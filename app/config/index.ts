import * as path from "path";

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
		persistentProfile: string
	},
	ab: {
    	modules: {
			[name: string]: string
			default: string
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

const cfgBasePath = isPkg ? path.join(path.dirname(process.execPath), 'config') : '.'
const targetConfig: Config = require(cfgBasePath + "/config_" + ConfigHelper.getConfigTarget()).default;
export default targetConfig;