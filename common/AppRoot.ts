import appRoot from 'app-root-path';
import path from "path";

class AppRoot{
    public readonly pathHome: string;
    public readonly path: string;

    constructor() {
        this.path = appRoot.path;
        this.pathHome = (<any>process).pkg ? path.dirname(process.execPath) : appRoot.path;
    }
}

const appRootBetter = new AppRoot();
export default appRootBetter;
