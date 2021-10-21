import * as path from "path";
import {ABCmdTemplate} from "../abmodules/ABVersionIncrementer";
import * as fs from 'fs';

export type Config = {
    debug?: boolean,
	log?: {
    	level?: 'trace'|'debug'|'info'|'warn'|'error'|'fatal'
	},
	http: {
		port: number,
	},
	browser: {
    	leaveCaptchaWindowAfterSolution: boolean,
		leaveRecaptchaV3: boolean,
		leaveRecaptchaV2: boolean,
		persistentProfile: string,
		extraLaunchFlags?: string[]
	},
	ab: {
    	modules: {
			[name: string]: string
			default: string
		},
		templates: {
    		[key in ABCmdTemplate]: string
		}
	}
}

const isPkg = !!(<any>process).pkg;
export class ConfigHelper {
	public static getConfigTarget(): string {
		const def = isPkg ? "production" : "development";
		return (process.env.NODE_ENV || def)
	}
}

let cfgBasePath: string = __dirname;
const targetConfigName = "/config_" + ConfigHelper.getConfigTarget();

if(isPkg) {
	cfgBasePath = path.join(path.dirname(process.execPath), 'config');
	const defaultConfigName = "/config_default";
	if (!fs.existsSync(cfgBasePath + targetConfigName + '.js'))
		fs.copyFileSync(cfgBasePath + defaultConfigName + '.js', cfgBasePath + targetConfigName + '.js');
}

const targetConfig: Config = require(cfgBasePath + targetConfigName).default;
export default targetConfig;