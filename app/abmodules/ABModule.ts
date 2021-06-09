import config from "../config";

import { DOMParserImpl as dom} from 'xmldom-ts';
import * as xpath from 'xpath-ts';
import * as fs from "fs-extra";
import path from 'path';
import CriticalSection from "../../common/CriticalSection";
import GCC from "./GCC";
import log from "../../common/log";
import shell from "shelljs";

export type ABModuleRepositories = {
    [name: string] : string
}

export type ABModuleFile = {
    type: string
    name: string
    attrs?: {
        [name: string]: string
    }
}

export const Module_Repo_Default = 'default';
export const Module_Repo_Self = '__self';
export const Module_Version_Source = 'source';
export const Module_Version_Head = 'head';
export const Module_Version_Default = Module_Version_Head;
export const Module_File_Manifest = 'anybalance-manifest.xml';

export enum ModuleType {
    PROVIDER= 1,
    CONVERTER= 2,
    MODULE= 3

}

export type ABModuleDoer = (m: ABModule) => any;

async function checkFileExists(file: string) {
    return fs.access(file, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false)
}

const criticalSection = new CriticalSection();

export default class ABModule{
    public readonly repo: string;
    public readonly id: string;
    public readonly type: ModuleType;
    public readonly version?: string;
    public readonly path: string;
    public gen!: number; //Provider generation

    private xmlManifest!: Document;

    public readonly files: ABModuleFile[] = [];
    public readonly depends: ABModule[] = [];
    public isLoaded: boolean = false;
    public errorMessage?: string;

    private static modulesCache: {[name: string]: ABModule} = {};
    private static defaultVersion: string = Module_Version_Default;

    private constructor(opt: {id: string, path: string, type: ModuleType, repo: string, version?: string}) {
        this.repo = opt.repo;
        this.id = opt.id;
        this.path = opt.path;
        this.version = opt.version;
        this.type = opt.type;
    }

    /**
     * Создаёт модуль или провайдер
     *
     * @param idOrPath - path в случае repo=_self, id в противном случае
     * @param repo - id repo
     * @param version - версия модуля (source или head)
     */
    public static async create(idOrPath: string, _repo: string = Module_Repo_Default, version: string = ABModule.defaultVersion): Promise<ABModule>{
        let module: ABModule;
        if(this.isRoot(_repo)){
            let {id, type, repo, xmlManifest} = await this.guessModuleIdAndRepo(idOrPath);
            module = new ABModule({
                id, type, path: idOrPath, repo: repo || _repo, version
            });
            module.xmlManifest = xmlManifest;
        }else{
            if(!config.ab.modules[_repo])
                throw new Error('Modules directory "' + _repo + "' is not configured! Edit config.");

            module = new ABModule({
                id: idOrPath, repo: _repo, type: ModuleType.PROVIDER, path: path.join(config.ab.modules[_repo], idOrPath), version
            });
        }

        return module;
    }

    private static async guessModuleIdAndRepo(dir: string): Promise<{type: ModuleType, id: string, repo?: string, xmlManifest: Document}>{
        let type: ModuleType;
        let repo: string|undefined;

        let pathManifest = path.join(dir, Module_File_Manifest);
        if(await checkFileExists(pathManifest)){
            type = ModuleType.PROVIDER; //Или конвертер. Но это, наверное, потом различим
        }else if(await checkFileExists(pathManifest = path.join(dir, Module_Version_Source, Module_File_Manifest))){
            type = ModuleType.MODULE;
        }else{
            throw new Error("Unknown module type: " + dir);
        }

        const xml = await fs.readFile(pathManifest, "utf8")
        const doc = new dom().parseFromString(xml);

        const idNode = xpath.select1('//provider/id', doc) as Node;
        if(!idNode)
            throw new Error(dir + ' does not contain id node!');

        const id = idNode.firstChild?.textContent?.trim();
        if(!id)
            throw new Error(dir + ' contains empty id node!');

        const dirname = path.basename(dir);
        if(dirname !== id)
            throw new Error(dir + ' != ' + id + ': id should match the directory name of ' + (type === ModuleType.MODULE ? 'module' : 'provider') + '!');

        var repoPath = path.dirname(dir); //Путь до репо (без ID модуля)

        for(let _repo in config.ab.modules){
            const rPath = config.ab.modules[_repo];
            if(!path.relative(rPath, repoPath)){
                repo = _repo;
                break;
            }
        }

        return {type, id, repo, xmlManifest: doc};
    }



    public isRoot(){
        return ABModule.isRoot(this.repo);
    }

    public getFullId() {
        return ABModule.getFullId(this.id, this.repo);
    }

    public static isRoot(repo?: string){
        return repo === Module_Repo_Self;
    }

    public static getFullId(id: string, repo: string) {
        return repo + ':' + id;
    }

    private async loadXmlManifest(){
        if(this.xmlManifest)
            return;

        return criticalSection.exclusive(async () => {
            if(this.xmlManifest)
                return;

            const pathManifest = path.join(this.path, Module_File_Manifest);
            const xml = await fs.readFile(pathManifest, "utf8")
            const doc = new dom().parseFromString(xml);
            this.xmlManifest = doc;
       });
    }

    public static clearModulesCache() { this.modulesCache = {}; }

    public static async createModule(id: string, repo: string = Module_Repo_Default, version: string = ABModule.defaultVersion): Promise<ABModule>{
        if(this.isRoot(repo))
            return await this.create(id, repo, version);

        const fid = this.getFullId(id, repo);
        const cached = this.modulesCache[fid];
        if(cached) {
            if(cached.version !== version)
                throw new Error('Module ' + fid + ' is already loaded with version ' + cached.version + '. Can not reload it with version ' + version + '!');
            return cached;
        }

        const m = await this.create(id, repo, version);
        this.modulesCache[fid] = m;

        return m;
    }

    public getGen(): number {
        const node = xpath.select1('//provider', this.xmlManifest) as Element;
        const gen = node.attributes.getNamedItem("gen");
        return +(gen?.textContent || 1);
    }

    private loadFilesList(){
        let node = xpath.select1('//provider/files', this.xmlManifest) as Element;
        if(!node)
            throw new Error(this.path + ' does not contain files node!');

        const nodeList = node.childNodes;
        const files = this.files;
        for(let i=0; i<nodeList.length; ++i){
            node = nodeList.item(i) as Element;
            if(node.nodeType !== Node.ELEMENT_NODE) //NODE_ELEMENT
                continue;
            const fname = node.textContent?.trim();
            if(!fname)
                throw new Error(this.path + ' does not contain filename for ' + node.tagName);

            const file: ABModuleFile = {
                type: node.tagName,
                name: fname
            };

            const attrs = node.attributes;
            for(var j=0; j<attrs.length; ++j){
                if(!file.attrs)
                    file.attrs = {};
                const attr = attrs.item(j);
                if(attr)
                    file.attrs[attr.name] = attr.textContent || '';
            }

            files.push(file);
        }
    }

    private async loadModulesList(){
        let node = xpath.select1('//provider/depends', this.xmlManifest) as Element;
        if(node) {

            var nodeList = node.childNodes;
            var modules = this.depends;
            for (var i = 0; i < nodeList.length; ++i) {
                node = nodeList.item(i) as Element;
                if (node.nodeType != Node.ELEMENT_NODE) //NODE_ELEMENT
                    continue;

                const id = node.attributes.getNamedItem('id')?.textContent?.trim(),
                    repo = node.attributes.getNamedItem('repo')?.textContent?.trim(),
                    version = node.attributes.getNamedItem('version')?.textContent?.trim();

                if (!id)
                    throw new Error('No id specified for dependency module!');

                const module = await ABModule.createModule(id, repo, version);

                modules.push(module);
            }
        }
    }

    public async load(){
        if(this.isLoaded)
            return; //Уже загружен

        try{
            await this.loadXmlManifest();
            await this.loadFilesList();
            await this.loadModulesList();
            this.gen = this.getGen();
            this.isLoaded = true;
        }catch(e){
            this.isLoaded = false;
            this.errorMessage = e.message;
            throw new Error('Could not load module ' + this.getFullId() + ': ' + e.message);
        }

    }

    public getFilePath(name?: string, version?: string){
        if(!name)
            return this.path;

        const basepath = this.path;

        if(this.type !== ModuleType.MODULE){ //Провайдер или конвертер
            return path.join(basepath, name);
        }else{ //Модуль
            if(!version)
                version = this.version;
            if(version === Module_Version_Source){
                return path.join(basepath, Module_Version_Source, name);
            }else{
                return path.join(basepath, 'build', version!, name);
            }
        }
    }

    public static async traverseDependencies(module: ABModule, before?: ABModuleDoer, after?: ABModuleDoer){
        await module.load();
        if(before)
            await before(module);

        for(let i=0; i<module.depends.length; ++i){
            let m = module.depends[i];
            await this.traverseDependencies(m, before, after);
        }

        if(after)
            await after(module);
    }

    public static async buildModule(basepathOrModule: string|ABModule, version: string=ABModule.defaultVersion){
        let basepath: string, provider: ABModule;

        if(version === Module_Version_Source)
            throw new Error('Target version can not be ' + Module_Version_Source);

        if(typeof(basepathOrModule) == 'string'){
            basepath = basepathOrModule;
            if(!await checkFileExists(basepath))
                throw new Error('Folder ' + basepath + ' does not exist!');

            provider = await this.createModule(basepath, Module_Repo_Self);
        }else{
            basepath = basepathOrModule.getFilePath();
            version = basepathOrModule.version || this.defaultVersion; //Билдим модуль для той же версии
            provider = await ABModule.create(basepathOrModule.id, basepathOrModule.repo, Module_Version_Source); //В обход кеша обязательно
        }

        await provider.load();

        const sub_module_id = provider.id.replace(/[\\\/]+/g, '.');

        const files: string[] = [];
        const otherFiles: ABModuleFile[] = [];
        for(let i=0; i<provider.files.length; ++i){
            const file = provider.files[i];
            if(file.type === 'js' && !/:/.test(file.name))
                files.push(provider.getFilePath(file.name));
            else
                otherFiles.push(file);
        }

        const version_path = path.dirname(provider.getFilePath(Module_File_Manifest, version));
        if(!await checkFileExists(version_path)){
            await fs.mkdir(version_path, {recursive: true});
        }

        try{
            await fs.emptyDir(version_path); //Удаляем старые файлы
        }catch(e){
            WScript.Echo("WARNING: trouble deleting old js files: " + e.message);
        }

        const gcc = new GCC(provider.gen, files, path.join(version_path, sub_module_id + '.min.js'));
        const result = await gcc.run();

        if(result !== 0)
            throw new Error('Compilation failed, see log for details!');

        let new_manifest = await fs.readFile(provider.getFilePath(Module_File_Manifest), 'utf-8');
        new_manifest = new_manifest.replace(/\s*<js[^>]*>([^<]*)<\/js>/ig, ''); //Убираем все js файлы
        await fs.writeFile(provider.getFilePath(Module_File_Manifest, version), new_manifest.replace(/(<files[^>]*>)/i, '$1\n\t\t<js>' + sub_module_id + '.min.js</js>'));
        for(let otherFile of otherFiles){
            await fs.copyFile(provider.getFilePath(otherFile.name), provider.getFilePath(otherFile.name, version));
        }

        log.info('SUCCESS: Module ' + provider.getFullId() + ' has been compiled to version ' + version);
        return provider;
    }

    public static async getFilesMaxTime(module: ABModule, allowNotExists?: boolean): Promise<number>{
        let maxTime = 0;
        for(let i=0; i<module.files.length; ++i){
            let file = module.files[i];
            let pth = module.getFilePath(file.name);
            let time: number = 0;
            try{
                let stat = await fs.stat(pth);
                time = stat.mtimeMs;
            }catch(e){
                if(allowNotExists){
                    log.info('Problem getting file ' + pth + ': ' + e.message + ' -- assuming it is not built yet');
                }else {
                    throw new Error('Problem getting file ' + pth + ': ' + e.message);
                }
            }
            if(time > maxTime)
                maxTime = time;
        }
        return maxTime;
    }

    public static async checkIfBuilt(module: ABModule): Promise<boolean>{
        if(module.version === Module_Version_Source)
            return true; //Только для head проверям, что несбилжено
        if(module.type !== ModuleType.MODULE)
            return true;

        var moduleSource = await this.create(module.id, module.repo, Module_Version_Source); //Специально мимо кеша создаём
        await moduleSource.load();

        var time = this.getFilesMaxTime(module, true);
        var timeSrc = this.getFilesMaxTime(moduleSource);

        return timeSrc <= time;
    }

    public static async checkIfCommitted(module: ABModule): Promise<boolean>{
        const pth = module.getFilePath().replace(/[\\\/]+$/, '');

        const cmdLine = 'git -C "' + pth + '" status "' + pth + '"';

        const output = await this.shellExec(cmdLine);

        if(/nothing to commit/i.test(output))
            return true;

        log.info('Module is not committed: ' + module.getFullId());
        return false;
    }

    public static async shellExec(cmdLine: string): Promise<string>{
        return new Promise<string>(((resolve, reject) => {
            shell.exec(cmdLine, (code, stdout, stderr) => {
                log.info(stdout);
                log.error(stderr);
                if(code !== 0)
                    reject(new Error("Error executing " + cmdLine + "\nExit code: " + code));
                else
                    resolve(stdout);
            });
        }));
    }

    public static async findGitRoot(pth: string): Promise<string|undefined>{
        let newPath = pth;
        do{
            pth = newPath;
            if(await checkFileExists(path.join(pth, '.git')))
                return pth;
            newPath = path.dirname(pth); //Перешли на уровень вверх
        }while(newPath && pth !== newPath);
    }

    public static setDefaultVersion(version: string){
        this.defaultVersion = version;
    }


}

