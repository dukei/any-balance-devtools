import ABModule, {
    ABModuleFile,
    Module_File_Manifest,
    Module_File_Type_History,
    Module_File_Type_JS, Module_File_Types_XML,
    Module_Version_Head
} from "./ABModule";
import ABModuleContext from "./ABModuleContext";
import * as path from "path";
import * as fs from "fs-extra";
import log from "../../common/log";
import {PageHelper} from "../browser/PageHelper";
import readline from 'readline';
import * as util from "util";
import shell from "shelljs";
import Templater from "./Templater";
import child_process from 'child_process';

export type ABCmdTemplate = 'tortoiseGit'|'gitAdd'|'gitCommit';

function decimalToHexString(num: number)
{
    if (num < 0)
    {
        num = 0xFFFFFFFF + num + 1;
    }

    return num.toString(16).toUpperCase();
}

function searchRegExpSafe(regExp: RegExp, where: string) {
    if(!regExp.global){
        let r = regExp.exec(where);
        return r ? r[1] : '';
    }else{
        let arr = [], r;
        while ((r = regExp.exec(where)) !== null) {
            arr.push(r[1] || '');
        }
        return arr;
    }

}

function addZeros(val: number) {
    return val < 10 ? '0' + val : '' + val;
}



export default class ABVersionIncrementer{
    private readonly pth: string
    private m!: ABModule;
    private mainJs?: string;
    private changeDescription!: string

    constructor(pth: string) {
        this.pth = pth;
    }

    public async incrementVersion(){
        const pth = this.pth;
        const m = await ABModule.createFromPath(pth, Module_Version_Head, new ABModuleContext({
            mainModulePath: pth,
            defaultVersion: Module_Version_Head,
            loadFileContent: true,
            loadXmls: true
        }));
        this.m = m;

        await m.load();
        const v = m.getIdAndVersion();

        if(path.basename(pth) !== v.id)
            throw new Error("Provider folder should be the same as provider id: " + v.id);

        await this.checkJsForStupidErrors();
        await this.checkXMLsForStupidErrors();
        this.changeDescription = await PageHelper.getVersionDescription(((v.majorVersion && v.majorVersion + '.') || '') + (v.version + 1), v.id);

        await this.writeProvider();

        log.info("Provider version is incremented. Trying to commit changes...");

        const commitDirs = await this.checkModulesIfAreCompiledAndCommitted();
        commitDirs.push(pth);
        await this.commit(commitDirs, this.changeDescription);
    }

    private async checkJsForStupidErrors(){
        const m = this.m;
        const js = m.files.find(f => f.type === Module_File_Type_JS && f.name === 'main.js');

        if(js) {
            this.mainJs = await m.getFileText(js.name);

            const prefsName = searchRegExpSafe(/(?:var\s+)?([^\s]+)\s*=\s*AnyBalance\.getPreferences\s*\(\)/i, this.mainJs);
            //var prefsName = /(?:var\s+)?([^\s]+)\s*=\s*AnyBalance\.getPreferences\s*\(\)/i.exec(mainJs)[1];
            if (prefsName) {
                // Нельзя хардкодить преференсы!
                /*		var reg = new RegExp('(?:var\\s+)?' + prefsName + '\\s*=\\s*([^,;]+)', 'ig');
                        var r_result;
                        while((r_result = reg.exec(mainJs)) !== null) {
                            if(!/AnyBalance\.getPreferences\s*\(\)/i.test(r_result[1])) {
                                throw new Error('You have overrided your preferences!' + msg);
                            }
                        } */
            }
            //Обработать ошибку входа!
            if (this.mainJs.indexOf('<div[^>]+class="t-error"[^>]*>[\\s\\S]*?<ul[^>]*>([\\s\\S]*?)<\\/ul>') >= 0) {
                throw new Error('You have to check for login error and show appropriate message!');
            }
        }else {
            log.warn("main.js is not found. Skipping checks for main.js");
        }
    }

    private async checkXMLsForStupidErrors(){
        const m = this.m;
        const xmls = m.files.filter(f => Module_File_Types_XML.indexOf(f.type) >= 0);

        for(let f of xmls){
            if(!/^\uFEFF?</.test(f.content! as string))
                throw new Error("Please remove leading spaces from " + f.name);
        }
    }

    public async checkModulesIfAreCompiledAndCommitted(): Promise<string[]> {
        const modules: {[id: string]: ABModule} = {}; //просто список используемых модулей
        const deps: ABModule[] = []; //Модули, от которых зависим.
        const pathsToCommit: string[] = [];

        await ABModule.traverseDependencies(this.m, undefined, (mdl) => {
                const id = mdl.getFullId();
                if(modules[id])
                    return;
                if(mdl.isRoot())
                    return;
                modules[id] = mdl;
                deps.push(mdl);
            }
        );

        for(let i=0; i<deps.length; ++i){
            const mdl = deps[i];
            log.info('Checking ' + mdl.getFullId() + '...');
            if(!await mdl.checkIfBuilt()){
                log.info('Module ' + mdl.getFullId() + ' source is newer than head. Building head...');
                await ABModule.buildModule(mdl, Module_Version_Head);
            }

            if(!await mdl.checkIfCommitted()){
                log.info('Module ' + mdl.getFullId() + ' has uncommitted changes. Adding it to commit path.');
                pathsToCommit.push(mdl.getFilePath().replace(/[\\\/]+$/, ''));
            }
        }

        return pathsToCommit;
    }

    public async writeProvider() {
        let manifest = await this.m.getFileText(Module_File_Manifest);
        const v = this.m.getIdAndVersion();

        manifest = manifest.replace(/(<id[^>]+version=)"\d+"/, `$1"${v.version+1}"`);

        const rlp = readline.createInterface({
            terminal: true,
            input: process.stdin,
            output: process.stdout
        });

        const question = util.promisify(rlp.question.bind(rlp));

        if (!/jquery/i.test(manifest) && !/no_browser/.test(manifest)) {
            const answer: string = <string><unknown>await question('You do not use jquery in your provider! To improve compatibility you must add "no_browser" flag.\nDo you want to do this (Y/n)?');
            if (!answer || answer.toLowerCase()[0] === 'y') {
                var apiFlags = searchRegExpSafe(/<api[^>]*flags\s*=\s*"([^"]+)/i, manifest);
                // already has some flags
                if (apiFlags) {
                    manifest = manifest.replace(/flags\s*=\s*"([^"]+)"/, 'flags="no_browser|$1"');
                } else {
                    manifest = manifest.replace(/<provider>/, '<provider>\n\t<api flags="no_browser"/>');
                }
            }
        }

/*        if(/<type[^>]*>[^<]*money/i.test(manifest) && !/<type[^>]*>[^<]*(bank|wallet)/i.test(manifest)){
            var result = createInput("type.html","Исправление типа",(5 * 60) * 1000);
            if(!result)
                throw new Error(cancel);

            manifest = manifest.replace(/<\/type>/, ', ' + result + '</type>');
        }
*/

        if(this.mainJs && !/nadapter\.js|<module[^>]+id="nadapter"/i.test(manifest) && /NAdapter/.test(this.mainJs)){
            const answer: string = <string><unknown>await question('You seem to use NAdapter, but you have forgot to include it in manifest.\nDo you want to do this (Y/n)?');
            if(!answer || answer.toLowerCase()[0] === 'y') {
                if(/<depends/i.test(manifest)){
                    manifest = manifest.replace(/(<depends[^>]*>)/i, '$1\n\t\t<module id="nadapter"/>');
                }else{
                    manifest = manifest.replace(/(<files[^>]*>)/i, '<depends>\n\t\t<module id="nadapter"/>\n\t</depends>\n\t$1');
                }
            }
        }

        const historyFile = this.m.files.find(f => f.type === Module_File_Type_History);
        let historyFileName: string = 'history.xml';
        if(!historyFile) {
            manifest = manifest.replace(/(\s*)<\/files>/i, '$1\t<history>' + historyFileName + '</history>$1</files>');
        }else{
            historyFileName = historyFile.name;
        }

        await fs.writeFile(this.m.getFilePath(Module_File_Manifest), manifest);

        let historyContent: string = '<?xml version="1.0" encoding="utf-8"?>\n\
	<history>\n\
	</history>';

        if(historyFile)
            historyContent = await this.m.getFileText(historyFile.name);

        const dt = new Date();
        const major_version_str = (v.majorVersion ? 'major_version="' + v.majorVersion + '" ' : '');

        historyContent = historyContent.replace(/<history>/, '<history>\n\t<change ' + major_version_str + 'version="' + (v.version+1) + '" date="' + dt.getFullYear() + '-' + addZeros(dt.getMonth()+1) + '-' + addZeros(dt.getDate()) + '">\n\t' + this.changeDescription.replace(/\n/g, '\n\t') + '\n\t</change>');
        historyContent = historyContent.replace(/^\s*|\s*$/g, '');

        await fs.writeFile(this.m.getFilePath(historyFileName), historyContent);
    }

    private async commit(commitDirs: string[], mesg: string) {
        //Отдельные репозитории надо отдельными диалогами комиттить. Поэтому разделяем их
        const repos: {[id: string]: string[]} = {};
        for(let i=0; i<commitDirs.length; ++i){
            let repo = await ABModule.findGitRoot(commitDirs[i]) || '-';
            let dirs = repos[repo];
            if(!dirs)
                dirs = repos[repo] = [];
            dirs.push(commitDirs[i]);
        }

        const templater = new Templater();
        const bTG = !!shell.which('tortoiseGitProc');
        const bGit = !!shell.which('git');
        if(!bTG && !bGit){
            log.warn("Could not commit changed files - git not found");
            return;
        }

        for(let repo in repos){
            log.info('Committing paths for repo ' + repo + ': ' + repos[repo].join('\n    '));
            const msg = this.m.name + ' (' + this.m.id + '): ' + mesg;
            const params = {
                pathRepo: repo,
                pathModules: repos[repo],
                logMessage: msg
            };

            const promises: Promise<string>[] = [];

            if(bTG){
                //TortoiseGit
                const cmd = await ABVersionIncrementer.render(templater,'tortoiseGit', params);
                await ABModule.shellExec(cmd);
            }else{
                // GIT
                promises.push((async () => {
                    let cmd = await ABVersionIncrementer.render(templater,'gitAdd', params);
                    await ABModule.shellExec(cmd);

                    cmd = await ABVersionIncrementer.render(templater,'gitCommit', params);
                    log.debug("Executing " + cmd);
                    return child_process.execSync(cmd, {stdio: 'inherit', encoding: 'utf-8'})
                })());
            }

            await Promise.all(promises);
        }
    }

    public static render(t: Templater, name: ABCmdTemplate, context: {
        pathRepo: string,
        pathModules: string[],
        logMessage: string
    }): Promise<string>{
        return t.render(name, context)
    }


}