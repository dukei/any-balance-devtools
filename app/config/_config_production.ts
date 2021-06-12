import {Config} from "./index";

const config: Config = {
	log: {
		//Minimum log level to show log messages (trace, debug, info, warn, error, fatal)
		level: "info"
	},
	http: {
		//Default port to start server on. Do not change, since AnyBalanceDebugger expects 1500
		port: 1500,
	},
	browser: {
		//After you solve any captcha the window will not close automatically
		leaveCaptchaWindowAfterSolution: false,
		//Don't automatically close recaptcha v3 tabs
		leaveRecaptchaV3: true,
		//Don't automatically close recaptcha v2 tabs
		leaveRecaptchaV2: false,
		//Path to browser profile
		persistentProfile: './profiles'
	},
	ab: {
		modules: {
			//Enter here the path to default AnyBalance modules
			//any-balance-devtools will try to determine it from provider path
			//but it is much safer to explicitly configure it here
			default: "" //e.g. "C:/SrcRep/any-balance-providers/modules"
		},
	}
};

export default config;

