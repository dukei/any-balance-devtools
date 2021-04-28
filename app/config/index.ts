export type Config = {
    debug?: boolean,
	http: {
		port: number,
	},
	browser: {
    	leaveCaptchaWindowAfterSolution: boolean,
		leaveRecaptchaV3: boolean,
		leaveRecaptchaV2: boolean,
		persistentProfile: string
	}
}

export class ConfigHelper {
	public static getConfigTarget(): string { return (process.env.NODE_ENV || "development") }
}

const targetConfig: Config = require("./config_" + ConfigHelper.getConfigTarget()).default;
export default targetConfig;