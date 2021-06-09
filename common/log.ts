import {Log4js} from "log4js";
import config from "../app/config";

const log4js: Log4js = require('log4js');
log4js.configure({
    appenders: {
        err: { type: 'stderr', layout: {
            //https://log4js-node.github.io/log4js-node/layouts.html
            type: 'pattern',
            pattern: "%[[%p]%] %m"
        }},
        def: { type: 'file', filename: 'project.log' }
    },
    categories: { default: { appenders: ['def','err'], level: config.log?.level || 'info' } }
});

const log = log4js.getLogger("abdt");
export default log;