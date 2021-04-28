// lib/app.ts
import express from 'express';
import config, {ConfigHelper} from './config';
import log from "../common/log";
import routes from './routes';

(async () => {
    log.info(`Starting configuration (${__filename}, ${ConfigHelper.getConfigTarget()})`)

    const app : express.Application = express();

    let router = express.Router();
    routes(router);
    app.use('/', router);

    app.listen({ port: config.http.port }, () =>
        log.info(`🚀 Server ready at http://localhost:${config.http.port}`)
    );

})();
