// lib/app.ts
import express from 'express';
import config, {ConfigHelper} from './config';
import log from "../common/log";
import routes from './routes';
import yargs, {Arguments} from "yargs";
import {hideBin} from "yargs/helpers";
import ABModule from "./abmodules/ABModule";
import ABVersionIncrementer from "./abmodules/ABVersionIncrementer";

(async () => {
    log.debug(`Starting configuration (${__filename}, ${ConfigHelper.getConfigTarget()})`);
    await yargs(hideBin(process.argv))
        .usage("Usage: $0 [command] [--help] [..--options]")
        .version()
        .alias('version', 'v')
        .help()
        .demandCommand(1, '')
        .alias('help', 'h')
        .command({
            command: 'serve',
            describe: 'Start the debugger helper server',
            handler: onServe
        })
        .command({
            command: 'pack',
            handler: onCommand(onAssemble),
            builder: yargs => {
                return yargs
                    .option('dir', {
                        alias: 'd',
                        describe: 'Path to provider dir (current dir otherwise)',
                        type: 'string'
                    })
                    .option('build', {
                        default: 'head',
                        alias: 'b',
                        choices: ['head', 'source'],
                        describe: 'Build version of modules to use',
                        type: 'string'
                    })
                    .option('out', {
                        alias: 'o',
                        default: 'provider.zip',
                        describe: 'Name (path) to output zip file',
                        type: 'string'
                    });
            },
            describe: 'Pack provider and its modules into zip'
        })
        .command({
            command: 'compile',
            handler: onCommand(onCompile),
            builder: yargs => {
                return yargs
                    .option('dir', {
                        alias: 'd',
                        describe: 'Path to module base dir (current dir otherwise)',
                        type: 'string'
                    })
                    .option('build', {
                        default: 'head',
                        alias: 'b',
                        describe: 'Build version to compile to',
                        type: 'string'
                    })
            },
            describe: 'Compiles module'
        })
        .command({
            command: 'increment',
            handler: onCommand(onIncrementVersion),
            builder: yargs => {
                return yargs
                    .option('dir', {
                        alias: 'd',
                        describe: 'Path to provider base dir (current dir otherwise)',
                        type: 'string'
                    })
            },
            describe: 'Increments version, updates changes history, compiles dependency and commits all changes for a provider'
        })
        .strict()
        .parse();
})();

async function onServe(argv: Arguments){
    const app : express.Application = express();

    let router = express.Router();
    routes(router);
    app.use('/', router);

    app.listen({ port: config.http.port }, () =>
        log.info(`🚀 Server ready at http://localhost:${config.http.port}`)
    );
}

async function onAssemble(argv: Arguments){
    const source = argv.dir as string || process.cwd();
    const output = argv.out as string;
    const version = argv.build as string;

    log.info("About to pack " + source);

    const result = await ABModule.assemble(source, output, version);
    log.info("SUCCESS: Provider has been packed to " + result);
}

async function onCompile(argv: Arguments){
    const source = argv.dir as string || process.cwd();
    const version = argv.build as string;

    log.info("About to compile " + source);

    const result = await ABModule.buildModule(source, version);
    log.info("SUCCESS: Module has been compiled to " + result);
}

async function onIncrementVersion(argv: Arguments){
    const source = argv.dir as string || process.cwd();

    log.info("About to increment version of " + source);

    const result = await new ABVersionIncrementer(source).incrementVersion();
    log.info("SUCCESS: Provider version has been incremented");
}

function onCommand(command: (argv: Arguments) => Promise<void>){
    return async (argv: Arguments) => {
        try {
            await command.apply(null, [argv]);
        }catch(e){
            log.fatal(e.message, e);
        }
    }
}
