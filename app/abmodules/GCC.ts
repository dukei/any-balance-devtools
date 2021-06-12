import {compiler} from "google-closure-compiler";
import path from "path";
import log from "../../common/log";
const {getNativeImagePath, getFirstSupportedPlatform} = require('google-closure-compiler/lib/utils');

export default class GCC{
    public readonly compiler;
    private static platformInitialized = false;
    private readonly opts: any; //

    constructor(gen: number=1, files: string[], output: string) {
        GCC.initializePlatform();

        this.opts = {
            language_in: 'ECMASCRIPT_NEXT',
            language_out: gen > 1 ? 'ECMASCRIPT_2017' : 'ECMASCRIPT5',
            charset: 'utf-8',
            js: files,
            js_output_file: output
        };

        this.compiler = new compiler(this.opts);

        this.compiler.spawnOptions = {stdio: 'inherit'};
    }

    public async run(): Promise<number>{
        return new Promise(resolve => {
            log.info("Compiling js with GCC: " + JSON.stringify(this.opts, undefined, '  '));
            this.compiler.run((exitCode, stdout, stderr) => {
                if(stdout.trim())
                    log.info(stdout);
                if(stderr.trim())
                    log.error(stderr);
                log.info("GCC exited with code " + exitCode);
                resolve(exitCode);
            })
        })
    }

    private static initializePlatform(){
        if(!this.platformInitialized) {
            const platform = getFirstSupportedPlatform(['native', 'java']);
            if (!platform)
                throw new Error('Google-Closure-Compiler is not supported on this platform: ' + process.platform);

            if (platform === 'native') {
                compiler.JAR_PATH = '';
                compiler.prototype.javaPath = getNativeImagePath();
            }

            const isPkg = (<any>process).pkg !== undefined;
            if(isPkg){
                compiler.COMPILER_PATH = this.correctPkgPath(compiler.COMPILER_PATH);
                compiler.CONTRIB_PATH = this.correctPkgPath(compiler.CONTRIB_PATH);
                compiler.JAR_PATH = this.correctPkgPath(compiler.JAR_PATH);
                compiler.prototype.javaPath = this.correctPkgPath(compiler.prototype.javaPath);
            }

            this.platformInitialized = true;
        }
    }

    private static correctPkgPath(pth: string){
        return pth.replace(/^.*[\\\/]node_modules\b/, path.dirname(process.execPath));
    }
}