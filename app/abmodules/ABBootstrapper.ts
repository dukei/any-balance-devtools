import ABModule, {
    Module_File_Manifest,
} from "./ABModule";
import * as path from "path";
import * as fs from "fs-extra";
import log from "../../common/log";
import appRootBetter from "../../common/AppRoot";
import * as xpath from 'fontoxpath';

export default class ABBootstrapper{
    private readonly pth: string
    private m!: ABModule;

    constructor(pth: string) {
        this.pth = pth;
    }

    public async bootstrap(){
        //@ts-ignore
        if(!await fs.pathExists(path.join(this.pth, Module_File_Manifest))){
            await this.bootstrapSource();
        }

        await this.addDebugFiles();
    }

    private async bootstrapSource(){
        log.info("Bootstrapping source");
        await fs.copy(path.join(appRootBetter.path, 'res/bootstrap/source'), this.pth, {overwrite: false, filter: (src: string, dst: string) => {
            return path.basename(src) !== Module_File_Manifest
        }});

        let manifest = await fs.readFile(path.join(appRootBetter.path, 'res/bootstrap/source', Module_File_Manifest), 'utf-8');
        manifest = manifest.replace(/(<id[^>]+>)[\s\S]*?<\/id>/, "$1" + path.basename(this.pth) + '</id>');
        await fs.writeFile(path.join(this.pth, Module_File_Manifest), manifest);
    }

    private async addDebugFiles(){
        if(/^win/.test(process.platform))
            await fs.copy(path.join(appRootBetter.path, 'res/bootstrap/debug/windows'), this.pth, {overwrite: false});
        else
            log.warn("No debug command files for " + process.platform);

        const manifestPth = path.join(this.pth, Module_File_Manifest);
        const manifest = ABModule.parseXML(manifestPth, await fs.readFile(manifestPth, 'utf-8'));

        const prefsStrings: string[] = []
        const prefName = xpath.evaluateXPathToString('/provider/files/preferences/text()', manifest)?.trim();
        if(!prefName){
            log.warn("Preferences file is not found, bootstrapping default properties");
            await fs.copy(path.join(appRootBetter.path, 'res/bootstrap/debug/_debug-anybalance.html'), this.pth);
        }else{
            const prefsPth = path.join(this.pth, prefName);
            const prefs = ABModule.parseXML(prefsPth, await fs.readFile(prefsPth, 'utf-8'));
            const nodes = xpath.evaluateXPath('//*[self::EditTextPreference or self::ListPreference or self::CheckBoxPreference]', prefs);

            for(let node of nodes){
                let e = node as Element;
                const prefStrings: string[] = [];
                prefStrings.push(JSON.stringify(e.attributes.getNamedItem("key")?.value || "?unknownKey"), ': ');
                let defValue: any = e.attributes.getNamedItem("defaultValue")?.value || "";

                prefsStrings.push('//' + e.attributes.getNamedItem("title")?.value);
                switch(e.tagName)   {
                    case "CheckBoxPreference":
                        if(["1", "true"].indexOf(defValue.toLowerCase()) >= 0)
                            defValue = false;
                        break;
                    case "ListPreference":
                        prefsStrings.push('//Entries: ' + e.attributes.getNamedItem("entries")?.value);
                        prefsStrings.push('//Values: ' + e.attributes.getNamedItem("entryValues")?.value);
                        break;
                }
                prefStrings.push(JSON.stringify(defValue), ',')
                prefsStrings.push(prefStrings.join(''));
            }

            let file = await fs.readFile(path.join(appRootBetter.path, 'res/bootstrap/debug/_debug-anybalance.html'), 'utf-8');
            file = file.replace(/(g_api_preferences\s*=\s*\{)(\s*)[^\}]*/, '$1$2' + prefsStrings.join('$2') + '$2');
            await fs.writeFile(path.join(this.pth, '_debug-anybalance.html'), file);
        }
    }


}