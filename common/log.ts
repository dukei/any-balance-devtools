import {Log4js} from "log4js";
import config from "../app/config";
import appRoot from '../common/AppRoot';
import path from 'path';

const log4js: Log4js = require('log4js');
log4js.configure({
    appenders: {
        err: { type: 'stderr', layout: {
            //https://log4js-node.github.io/log4js-node/layouts.html
            type: 'pattern',
            pattern: "%[[%p]%] %m"
        }},
        def: { type: 'file', filename: path.join(appRoot.pathHome, 'project.log') }
    },
    categories: { default: { appenders: ['def','err'], level: config.log?.level || 'info' } }
});

const log = log4js.getLogger("abdt");
export default log;