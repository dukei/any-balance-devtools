import config from "../config";

import { DOMParserImpl as dom} from 'xmldom-ts';
import { DOMParserOptions } from "xmldom-ts/dist/types/parser/dom-parser";

import * as xpath from 'xpath-ts';
import * as fs from "fs-extra";
import path from 'path';
import CriticalSection from "../../common/CriticalSection";
import GCC from "./GCC";
import log from "../../common/log";
import shell from "shelljs";
import ABModuleContext from "./ABModuleContext";
import archiver from "archiver";
import {Schema} from 'node-schematron';
import appRoot from 'app-root-path';
import xmllint from 'xmllint-wasm';
import XSDVerifier from "./XSDVerifier";

export type ABModuleRepositories = {
    [name: string] : string
}

export type ABModuleFile = {
    type: string
    name: string
    attrs?: {
        [name: string]: string
    }
    content?: string|Buffer
    xmlDocument?: Document
}

export interface ABModuleDiskFile extends ABModuleFile {
    path: string
}

export const Module_Repo_Default = 'default';
export const Module_Repo_Self = '__self';
export const Module_Version_Source = 'source';
export const Module_Version_Head = 'head';
export const Module_Version_Default = Module_Version_Head;
export const Module_File_Manifest = 'anybalance-manifest.xml';
export const Module_File_Type_JS = 'js';
export const Module_File_Type_Manifest = 'manifest';
export const Module_File_Type_History = 'history';
export const Module_Repo_Default_Dirname = 'modules';
export const Module_File_Type_Preferences = 'preferences';

export const Module_File_Types_Text = [Module_File_Type_JS, Module_File_Type_Manifest, Module_File_Type_History, Module_File_Type_Preferences];
export const Module_File_Types_XML = [Module_File_Type_Manifest, Module_File_Type_History, Module_File_Type_Preferences];

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

const Module_File_Verifier_XSD = 'xsd';
const Module_File_Verifier_Schematron = 'schematron';

const verifiers: {
    [fileType: string]: {type: string, schema: string}[]
} = {
    [Module_File_Type_Manifest]: [
        {type: Module_File_Verifier_XSD, schema: 'anybalance-manifest.xsd'},
        {type: Module_File_Verifier_Schematron, schema: 'anybalance-manifest.sch'}
    ],
    [Module_File_Type_History]: [
        {type: Module_File_Verifier_XSD, schema: 'history.xsd'},
    ],
    [Module_File_Type_Preferences]: [
        {type: Module_File_Verifier_XSD, schema: 'preferences.xsd'},
    ],
}

const criticalSection = new CriticalSection();

export default class ABModule{
    public readonly repo: string;
    public readonly id: string;
    public readonly type: ModuleType;
    public readonly path: string;
    public readonly version: string
    public gen!: number; //Provider generation

    public readonly files: ABModuleFile[] = [];
    public readonly depends: ABModule[] = [];
    public isLoaded: boolean = false;
    public errorMessage?: string;

    private context: ABModuleContext;

    private constructor(opt: {id: string, path: string, type: ModuleType, repo: string, version: string, context: ABModuleContext}) {
        this.repo = opt.repo;
        this.id = opt.id;
        this.path = opt.path;
        this.type = opt.type;
        this.version = opt.version;
        this.context = opt.context;
    }

    public get name(): string {
        let node = xpath.select1('//provider/name', this.xmlManifest) as Element;
        if(!node)
            throw new Error(this.path + ' does not contain name node!');

        return node.textContent?.trim() || '';
    }

    private get xmlManifest(): Document {
        const manifest = this.files[0];
        if(manifest.type !== Module_File_Type_Manifest)
            throw new Error('Manifest is not loaded yet!');
        return manifest.xmlDocument!;
    }

    /**
     * Создаёт модуль
     *
     * @param id
     * @param repo - id repo
     * @param version - версия модуля (source или head)
     */
    public static async createModuleFromId(id: string, _repo: string = Module_Repo_Default, version: string, context: ABModuleContext): Promise<ABModule>{
        let modulesPath: string|undefined = config.ab.modules[_repo];
        if(!modulesPath)
            modulesPath = await context.getRepoPath(_repo);
        if(!modulesPath)
            throw new Error('Modules directory "' + _repo + "' is not configured! Edit config.");

        const module = new ABModule({
            id: id, repo: _repo, type: ModuleType.MODULE, path: path.join(modulesPath, id), version: version, context: context
        });

        return module;
    }

    /**
     * Создаёт провайдер или модуль по пути к нему
     *
     * @param pth - path в случае repo=_self
     * @param repo - id repo
     * @param version - версия модуля (source или head)
     */
    public static async createFromPath(pth: string, version: string, context: ABModuleContext): Promise<ABModule>{
        let {id, type, repo, manifest} = await this.guessModuleIdAndRepo(pth);
        const module = new ABModule({
            id, type, path: pth, repo: repo || Module_Repo_Self, version: version, context: context
        });
        module.files.push(manifest);
        context.addToCache(module);

        return module;
    }

    private static async guessModuleIdAndRepo(dir: string): Promise<{type: ModuleType, id: string, repo?: string, manifest: ABModuleFile}>{
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
        const doc = this.parseXML(pathManifest, xml);

        const idNode = xpath.select1('//provider/id', doc) as Node;
        if(!idNode)
            throw new Error(dir + ' does not contain id node!');

        const id = idNode.firstChild?.textContent?.trim();
        if(!id)
            throw new Error(dir + ' contains empty id node!');

        const idSegments = id.split(/\//);
        const pathSegments = path.normalize(dir).split(/[\/\\]/).filter(s => !!s);
        for(let i=1; i<=idSegments.length; ++i){
            if(idSegments[idSegments.length - i] !== pathSegments[pathSegments.length - i])
                throw new Error(dir + ' does not end with ' + id + ': id should match the path of a ' + (type === ModuleType.MODULE ? 'module' : 'provider') + '!');
        }

        const repoPathSegments = pathSegments.slice(0, -idSegments.length);
        const repoPath = path.join.apply(path.join, repoPathSegments); //Путь до репо (без ID модуля)

        for(let _repo in config.ab.modules){
            const rPath = config.ab.modules[_repo];
            if(!path.relative(rPath, repoPath)){
                repo = _repo;
                break;
            }
        }

        //Если путь к модулям не сконфигурирован, но данный путь лежит в modules,
        // то считаем это путем к репе модулей по-умолчанию
        if(!repo && repoPathSegments[repoPathSegments.length-1] === Module_Repo_Default_Dirname)
            repo = Module_Repo_Default;

        const manifest: ABModuleFile = {
            type: Module_File_Type_Manifest,
            name: Module_File_Manifest,
            content: xml,
            xmlDocument: doc
        };

        return {type, id, repo, manifest};
    }



    public isRoot(){
        return ABModule.isRoot(this.repo);
    }

    public getFullId() {
        return ABModule.getFullId(this.id, this.repo, this.version);
    }

    public static isRoot(repo?: string){
        return repo === Module_Repo_Self;
    }

    public static getFullId(id: string, repo: string, version: string) {
        return repo + ':' + id + '@' + version;
    }

    private async loadXmlManifest(){
        if(this.files.length > 0)
            return;

        return criticalSection.exclusive(async () => {
            if(this.files.length > 0)
                return;

            const xml = await this.getFileText(Module_File_Manifest);
            const doc = ABModule.parseXML(this.getFilePath(Module_File_Manifest), xml);

            this.files.push({
                type: Module_File_Type_Manifest,
                name: Module_File_Manifest,
                content: xml,
                xmlDocument: doc
            })
       });
    }

    public getGen(): number {
        const node = xpath.select1('//provider', this.xmlManifest) as Element;
        const gen = node.attributes.getNamedItem("gen");
        return +(gen?.textContent || 1);
    }

    public getIdAndVersion(): { id: string, version: number, majorVersion?: string } {
        let node = xpath.select1('//provider/id', this.xmlManifest) as Element;
        if(!node)
            throw new Error(this.path + ' does not contain id node!');

        const attrs = node.attributes;
        return {
            id: node.textContent || '',
            version: +(attrs.getNamedItem('version')?.value || 0),
            majorVersion: attrs.getNamedItem('major_version')?.value
        }
    }

    private async loadFilesList(){
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
            for(let j=0; j<attrs.length; ++j){
                if(!file.attrs)
                    file.attrs = {};
                const attr = attrs.item(j);
                if(attr)
                    file.attrs[attr.name] = attr.textContent || '';
            }

            if(this.context.loadFileContent){
                if(Module_File_Types_Text.indexOf(file.type) >= 0)
                    file.content = await this.getFileText(file.name);
                else
                    file.content = await fs.readFile(this.getFilePath(file.name));
            }

            if(this.context.loadXmls){
                if(Module_File_Types_XML.indexOf(file.type) >= 0){
                    if(!file.content)
                        file.content = await this.getFileText(file.name);
                    if(file.type === Module_File_Type_Manifest)
                        file.xmlDocument = this.xmlManifest;
                    else
                        file.xmlDocument = ABModule.parseXML(this.getFilePath(file.name), file.content as string);
                }
            }

            files.push(file);
        }
    }

    private async verifyFiles() {
        for(let file of this.files) {
            const vfs = verifiers[file.type];
            if (vfs) {
                for (let vf of vfs) {
                    switch (vf.type) {
                        case Module_File_Verifier_XSD: {
                            const xsdVerifier = new XSDVerifier();
                            const result = await xsdVerifier.verify({
                                xml: file.content as string || (file.content = await this.getFileText(file.name)),
                                xsd: await fs.readFile(path.join(appRoot.path, 'res/xsd', vf.schema), 'utf-8'),
                                xmlName: file.name
                            });


/*                            const result = await xmllint.validateXML({
                                xml: [{
                                    fileName: file.name,
                                    contents: file.content as string || (file.content = await this.getFileText(file.name)),
                                }],
                                schema: await fs.readFile(path.join(appRoot.path, 'res/xsd', vf.schema), 'utf-8'),
                            }); */
                            if (!result.valid)
                                throw new Error(this.getFilePath(file.name) + ' is invalid:\n' + result.rawOutput);
                            break;
                        }
                        case Module_File_Verifier_Schematron: {
                            const schema = Schema.fromString(await fs.readFile(path.join(appRoot.path, 'res/xsd', vf.schema), 'utf-8'))
                            const results = schema.validateString(file.content as string || (file.content = await this.getFileText(file.name)),
                                {debug: true});
                            if (results.length)
                                throw new Error(this.getFilePath(file.name) + ' is invalid:\n' + results.map(r => r.message).join('\n'));
                            break;
                        }
                    }
                }
            }
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

                const module = await this.createModule(id, repo, version);

                modules.push(module);
            }
        }
    }

    private async createModule(id: string, repo?: string, version?: string): Promise<ABModule>{
        return this.context.createModule(id, repo, version);
    }

    public async load(skipModules?: boolean){
        if(this.isLoaded)
            return; //Уже загружен

        try{
            await this.loadXmlManifest();
            await this.loadFilesList();
            this.gen = this.getGen();
            if(this.context.verifyFiles)
                await this.verifyFiles();
            if(!skipModules)
                await this.loadModulesList();
            this.isLoaded = true;
        }catch(e){
            this.isLoaded = false;
            this.errorMessage = e.message;
            e.message = 'Could not load module ' + this.getFullId() + ': ' + e.message;
            throw e;
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

    public async getFileText(name?: string, version?: string): Promise<string>{
        return fs.readFile(this.getFilePath(name, version), 'utf-8');
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

    public static async buildModule(basepathOrModule: string|ABModule, version: string): Promise<string>{
        let provider: ABModule;

        if(version === Module_Version_Source)
            throw new Error('Target version can not be ' + Module_Version_Source);

        if(typeof(basepathOrModule) == 'string'){
            const basepath = basepathOrModule;
            if(!await checkFileExists(basepath))
                throw new Error('Folder ' + basepath + ' does not exist!');

            const mc = new ABModuleContext({defaultVersion: version, mainModulePath: basepath});
            provider = await this.createFromPath(basepath, Module_Version_Source, mc);
        }else{
            provider = await basepathOrModule.createModule(basepathOrModule.id, basepathOrModule.repo, Module_Version_Source);
        }

        await provider.load(true);

        const sub_module_id = provider.id.replace(/[\\\/]+/g, '.');

        const files: string[] = [];
        const otherFiles: ABModuleFile[] = [];
        for(let i=0; i<provider.files.length; ++i){
            const file = provider.files[i];
            if(file.type === Module_File_Type_JS && !/:/.test(file.name))
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

        return path.dirname(provider.getFilePath(Module_File_Manifest, version));
    }

    public async getFilesMaxTime(allowNotExists?: boolean): Promise<number>{
        let maxTime = 0;
        for(let i=0; i<this.files.length; ++i){
            let file = this.files[i];
            let pth = this.getFilePath(file.name);
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

    public async checkIfBuilt(): Promise<boolean>{
        if(this.version === Module_Version_Source)
            return true; //Только для head проверям, что несбилжено
        if(this.type !== ModuleType.MODULE)
            return true;

        const moduleSource = await this.createModule(this.id, this.repo, Module_Version_Source);
        await moduleSource.load();

        const time = await this.getFilesMaxTime(true);
        const timeSrc = await moduleSource.getFilesMaxTime();

        return timeSrc <= time;
    }

    public async checkIfCommitted(): Promise<boolean>{
        const pth = this.getFilePath().replace(/[\\\/]+$/, '');

        const cmdLine = 'git -C "' + pth + '" status "' + pth + '"';

        const output = await ABModule.shellExec(cmdLine);

        if(/nothing to commit/i.test(output))
            return true;

        log.info('Module is not committed: ' + this.getFullId());
        return false;
    }

    public static async shellExec(cmdLine: string): Promise<string>{
        return new Promise<string>(((resolve, reject) => {
            log.debug("Executing " + cmdLine);
            shell.exec(cmdLine, {silent: false, async: true}, (code, stdout, stderr) => {
                if(stdout)
                    log.debug(stdout);
                if(stderr)
                    log.error(stderr);
                if(code !== 0)
                    reject(new Error("Error executing " + cmdLine + "\nExit code: " + code));
                else
                    resolve(stdout);
            });
        }));
    }

    public static async findSiblingDir(pth: string, dirname: string): Promise<string|undefined>{
        let newPath = pth;
        do{
            pth = newPath;
            const siblingPath = path.join(pth, dirname);
            if(await checkFileExists(siblingPath))
                return siblingPath;
            newPath = path.dirname(pth); //Перешли на уровень вверх
        }while(newPath && pth !== newPath);
    }

    public static async findGitRoot(pth: string): Promise<string|undefined>{
        const sibpath = await this.findSiblingDir(pth, '.git');
        return sibpath && path.dirname(sibpath);
    }

    public static async assemble(pth: string, output?: string, version?: string): Promise<string>{
        log.info("Assembling " + pth);
        if(!version)
            version = Module_Version_Default;
        if(!output)
            output = path.join(pth, 'provider.zip');
        else if(!path.isAbsolute(output))
            output = path.join(process.cwd(), output);

        const provider = await this.createFromPath(pth, version, new ABModuleContext({mainModulePath: pth, defaultVersion: version, verifyFiles: true}));

        const modules: {[id: string]: ABModule} = {}; //просто список используемых модулей
        const deps: ABModule[] = []; //Модули, от которых зависим.

        log.trace('Traversing dependencies...');
        const modulesFound: string[] = [];

        await ABModule.traverseDependencies(provider, undefined, async m => {
                const id = m.getFullId();
                if(modules[id])
                    return;
                modules[id] = m;
                deps.push(m);
                modulesFound.push(id);
            }
        );

        const files: ABModuleDiskFile[] = [];
        const fileNames: {[name: string]: string} = {};

        log.trace('Found total ' + deps.length + ' modules: ' + modulesFound.join(', '));
        log.trace('Listing files...');
        for(let i=0; i<deps.length; ++i){
            const m = deps[i];
            const root = m === provider;
            for(let j=0; j<m.files.length; ++j){
                const file = m.files[j];
                if(root || file.type === Module_File_Type_JS){
                    let name = file.name, k=0;
                    while(fileNames[name]){
                        name = 'f' + (++k) + '_' + file.name;
                    }
                    fileNames[file.name] = name;

                    files.push({path: m.getFilePath(file.name), name: name, type: file.type, attrs: file.attrs});
                }
            }
        }

        log.trace('Copying files...');

        const arc = archiver('zip', {
            zlib: {level: 9}
         });
        const outputStream = fs.createWriteStream(output);

        arc.on('error', err => {throw err});
        arc.pipe(outputStream);

        const filesList: string[] = [];

        for(let i=0; i<files.length; ++i){
            const file = files[i];
            if(file.type !== Module_File_Type_Manifest)
                arc.file(file.path, {
                    name: file.name
                });

            const attrs = [];
            if(file.attrs) {
                for (let a in (file.attrs || {})) {
                    attrs.push(a + '="' + file.attrs[a] + '"');
                }
            }
            filesList.push('<' + file.type + (attrs.length ? ' ' + attrs.join(' ') : '') + '>' + file.name + '</' +file.type+'>');
        }

        let manifest = await fs.readFile(provider.getFilePath(Module_File_Manifest), 'utf-8');
        manifest = manifest.replace(/<files[^>]*>[\s\S]*?<\/files>/i, '<files>\n\t\t' + filesList.join('\n\t\t') + '\n\t</files>');
        arc.append(manifest, {name: Module_File_Manifest});

        log.trace('Compressing files to ' + output);
        await arc.finalize();

        return output;
    }

    public static parseXML(pth: string, content: string): Document {
        const errors: string[] = [];
        const xmlOptions: DOMParserOptions = {
            locator: {},
            errorHandler: (key, msg) => {
                errors.push(`${msg} ${pth}`)
                //throw new Error(`${pth}: ${msg}`);
            }
        }
        const doc = new dom(xmlOptions).parseFromString(content);
        if(errors.length > 0){
            throw new Error(errors.join('\n'));
        }
        return doc;
    }
}

