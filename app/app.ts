if((<any>process).pkg){
    // Workaround 'pkg' bug: https://github.com/zeit/pkg/issues/420
    require('../common/pkg-copyfile-patch');
}

import express from 'express';
import config, {ConfigHelper} from './config';
import log from "../common/log";
import routes from './routes';
import yargs, {Arguments} from "yargs";
import {hideBin} from "yargs/helpers";
import ABModule from "./abmodules/ABModule";
import ABVersionIncrementer from "./abmodules/ABVersionIncrementer";
import * as path from "path";
import appRoot from 'app-root-path';
import * as fs from 'fs-extra';
import ABBootstrapper from "./abmodules/ABBootstrapper";

const urlRelease = 'https://api.github.com/repos/dukei/any-balance-devtools/releases/latest';

(async () => {
    log.debug(`Starting configuration (${__filename}, ${ConfigHelper.getConfigTarget()})`);

    if(process.argv.indexOf('update') < 0)
        checkForUpdate().catch(e => log.warn(e.message));

    const pkg = require(path.join(appRoot.path, 'package.json'));

    await yargs(hideBin(process.argv))
        .usage("Usage: $0 [command] [--help] [..--options]")
        .version("AnyBalanceDevtools v" + pkg.version)
        .alias('version', 'v')
        .help()
        .demandCommand(1, '')
        .alias('help', 'h')
        .command({
            command: 'serve',
            aliases: ['s'],
            describe: 'Start the debugger helper server',
            handler: onServe
        })
        .command({
            command: 'pack',
            aliases: ['p'],
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
            aliases: ['c'],
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
            aliases: ['i', 'inc'],
            handler: onCommand(onIncrementVersion),
            builder: yargs => {
                return yargs
                    .option('dir', {
                        alias: 'd',
                        describe: 'Path to provider base dir (current dir otherwise)',
                        type: 'string'
                    })
                    .option('keep-version', {
                        alias: 'k',
                        default: false,
                        describe: 'Do not increment version - keep it at current value. Just check dependencies and commit',
                        type: 'boolean'
                    })
            },
            describe: 'Increments version, updates changes history, compiles dependency and commits all changes for a provider'
        })
        .command({
            command: 'update',
            aliases: ['u'],
            handler: onCommand(onUpdate),
            describe: 'Updates this program to the latest version if any'
        })
        .command({
            command: 'bootstrap',
            aliases: ['b'],
            handler: onCommand(onBootstrap),
            builder: yargs => {
                return yargs
                    .option('dir', {
                        alias: 'd',
                        describe: 'Path to provider base dir (current dir otherwise)',
                        type: 'string'
                    })
            },
            describe: 'Bootstraps provider or adds debugger files to an existing provider'
        })
        .strict()
        .parse();

    log.debug("Program finished");
})().catch(e => {
    log.fatal("m" + e.message);
    log.debug(e.stack);
});

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
    const source = (argv.dir as string && path.resolve(argv.dir as string)) || process.cwd();
    const output = argv.out as string;
    const version = argv.build as string;

    log.info("About to pack " + source);

    const result = await ABModule.assemble(source, output, version);
    log.info("SUCCESS: Provider has been packed to " + result);
}

async function onCompile(argv: Arguments){
    const source = (argv.dir as string && path.resolve(argv.dir as string)) || process.cwd();
    const version = argv.build as string;

    log.info("About to compile " + source);

    const result = await ABModule.buildModule(source, version);
    log.info("SUCCESS: Module has been compiled to " + result);
}

async function onIncrementVersion(argv: Arguments){
    const source = (argv.dir as string && path.resolve(argv.dir as string)) || process.cwd();

    log.info("About to increment version of " + source);

    const result = await new ABVersionIncrementer(source).incrementVersion(argv.keepVersion as boolean);
    log.info(`SUCCESS: Provider version has been ${argv.keepVersion ? 'kept' : 'incremented'}`);
}

async function onBootstrap(argv: Arguments){
    const source = (argv.dir as string && path.resolve(argv.dir as string)) || process.cwd();

    log.info("About bootstrap " + source);

    const result = await new ABBootstrapper(source).bootstrap();
    log.info("SUCCESS: Provider has been bootstrapped");
}

async function onUpdate(argv: Arguments) {
    log.info("Checking for updates");

    const updater = require('git-auto-update');
    const info = await updater.getLatestReleaseInfo({url: urlRelease, output: true});
    if(!info)
        throw new Error('Failed to load release info');

    const pkg = require(path.join(appRoot.path, 'package.json'));
    const hasNewVersion = await updater.check({info, version: 'v'+pkg.version, url: urlRelease, output: true})
    if(hasNewVersion) {
        let programPath: string = path.join(appRoot.path, 'abd');
        const bPkg = !!(<any>process).pkg;
        if (bPkg) {
            programPath = path.dirname(process.execPath);
            await fs.rename(process.execPath, process.execPath + '.bak');
        }

        const success = await updater.update({
            info,
            url: urlRelease,
            output: true,
            updatePath: programPath,
            temporaryPath: programPath,
            version: 'v' + pkg.version
        });

        if (bPkg) {
            if (!success) {
                await fs.rename(process.execPath + '.bak', process.execPath);
            }
        }

        if (success) {
            log.info("SUCCESS: Updated");
        } else {
            log.info("FAILURE: Not updated");
        }
    }else{
        log.info("SUCCESS: You already have the latest version");
    }
}

function onCommand(command: (argv: Arguments) => Promise<void>){
    return async (argv: Arguments) => {
        try {
            await command.apply(null, [argv]);
        }catch(e: any){
            log.fatal(e.message);
            log.debug(e.stack);
        }
    }
}

async function checkForUpdate(){
    const bPkg = !!(<any>process).pkg;
    if(bPkg) //Удаляем старый бэкап
        await fs.remove(process.execPath + '.bak');

    const pkg = require(path.join(appRoot.path, 'package.json'));
    const updater = require('git-auto-update');
    const needUpdate = await updater.check({
        url: urlRelease,
        output: true,
        version: 'v'+pkg.version
    });
    if(needUpdate){
        log.warn("New version of AnyBalanceDevtools is available. Please run 'abd update'");
    }else{
        log.info("You have the latest version of AnyBalanceDevtools");
    }
}
