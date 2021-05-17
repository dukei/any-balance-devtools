import {BrowserManager} from "./BrowserManager";
import * as fs from "fs";
import * as path from "path";
import config from "../config/config_development";
import appRoot from 'app-root-path';

export interface CodeBaseOptions {
    prompt?: string,
    timeLimit?: number,
}

export interface RecaptchaOptions extends CodeBaseOptions{
    sitekey: string,
    url: string,

    userAgent?: string,
    proxy?: string,
}

export interface RecaptchaV3Options extends RecaptchaOptions{
    action?: string
}


export class PageHelper {
    public static async solveRecaptcha(options: RecaptchaOptions): Promise<string>{
        return this.solveRecaptchaEx(options, 'v2');
    }

    public static async solveRecaptchaV3(options: RecaptchaV3Options): Promise<string>{
        return this.solveRecaptchaEx(options, 'v3');
    }

    public static async solveRecaptchaEx(options: RecaptchaOptions|RecaptchaV3Options, type: 'v2'|'v3'): Promise<string>{
        const bm = await BrowserManager.getInstance();
        const page = await bm.newPage({
            headless: false,
            proxy: options.proxy,
            userDataDir: config.browser.persistentProfile
        });

        await page.setRequestInterception(true);
        if(options.userAgent)
            await page.setUserAgent(options.userAgent);

        page.on('request', async request => {
            if(request.url() === options.url) {
                const tplname = type === 'v2' ? '/recaptcha.html' : '/recaptcha_v3.html';
                let template = await fs.promises.readFile(path.join(appRoot.path, 'res/templates') + tplname, 'utf8');
                template = template
                    .replace(/%TEXT%/g, options.prompt || 'Please, prove you are not a robot.')
                    .replace(/%TIMELIMIT%/g, '' + (options.timeLimit || 60000))
                    .replace(/%SITEKEY%/g, options.sitekey)
                    .replace(/%ACTION%/g, (options as RecaptchaV3Options).action || '')
                request.respond({
                    contentType: 'text/html',
                    body: template
                })
            }else{
                request.continue()
            }

        });

        const waitingForSolution = new Promise<string>((resolve, reject) => {
            page.exposeFunction('abdt_onRecaptchaEvent', async (event: string, params: any) => {
                if(event === 'timeout') {
                    reject(new Error('timeout'));
                }else if(event === 'cancel'){
                    reject(new Error('cancel'));
                }else if(event === 'solved'){
                    resolve(params);
                }else{
                    reject(new Error('Unknown event: ' + event));
                }
            });
            page.on('close', () => {
                reject(new Error('cancel'));
            })
        });


        await page.goto(options.url);

        try {
            return await waitingForSolution;
        }finally{
            if(config.browser.leaveCaptchaWindowAfterSolution
                || (config.browser.leaveRecaptchaV2 && type === 'v2')
                || (config.browser.leaveRecaptchaV3 && type === 'v3')) {
                //Manual closing
            }else{
                if (!page.isClosed())
                    page.close({runBeforeUnload: false});
            }
        }
    }
}