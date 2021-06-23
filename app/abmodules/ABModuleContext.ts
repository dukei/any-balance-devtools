import config from "../config";
import ABModule, {Module_Repo_Default, Module_Version_Default} from "./ABModule";
import log from "../../common/log";

export default class ABModuleContext {
    private cache: { [name: string]: ABModule } = {};
    public readonly defaultVersion: string;
    private readonly mainModulePath: string; //Path to mainModule
    private defaultModulesPath?: string
    public readonly loadFileContent?: boolean
    public readonly loadXmls?: boolean
    public readonly verifyFiles?: boolean

    public constructor(opt: {
                            mainModulePath: string,
                            defaultVersion: string,
                            loadFileContent?: boolean
                            loadXmls?: boolean
                            verifyFiles?: boolean
                       }
    ) {
        this.defaultVersion = opt.defaultVersion;
        this.mainModulePath = opt.mainModulePath;
        this.loadFileContent = opt.loadFileContent;
        this.loadXmls = opt.loadXmls;
        this.verifyFiles = opt.verifyFiles;
    }

    public clearModulesCache() { this.cache = {}; }

    public async createModule(id: string, repo: string = Module_Repo_Default, version?: string): Promise<ABModule>{
        const v = version || this.defaultVersion;

        const fid = ABModule.getFullId(id, repo, v);
        const cached = this.cache[fid];
        if(cached)
            return cached;

        const m = await ABModule.createModuleFromId(id, repo, v, this);
        this.cache[fid] = m;

        return m;
    }

    public async getRepoPath(repo: string): Promise<string|undefined>{
        if(!repo)
            repo = Module_Repo_Default;
        if(config.ab.modules[repo])
            return config.ab.modules[repo];

        if(repo === Module_Repo_Default){
            if(this.defaultModulesPath)
                return this.defaultModulesPath;

            this.defaultModulesPath = await ABModule.findSiblingDir(this.mainModulePath, 'modules');

            if(this.defaultModulesPath){
                log.info("default modules path is not set in config. Guessed it is " + this.defaultModulesPath);
                return this.defaultModulesPath;
            }else{
                log.warn("Could not guess default modules path from " + this.defaultModulesPath);
            }
        }
    }

    public addToCache(m: ABModule){
        this.cache[m.getFullId()] = m;
    }


}
