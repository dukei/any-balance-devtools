// lib/app.ts
import express from 'express';
import config, {ConfigHelper} from './config';
import log from "../common/log";
import routes from './routes';
import yargs, {Arguments} from "yargs";
import {hideBin} from "yargs/helpers";

(async () => {
    log.debug(`Starting configuration (${__filename}, ${ConfigHelper.getConfigTarget()})`);

    await yargs(hideBin(process.argv))
        .usage("Usage: $0 [command] [--options]")
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