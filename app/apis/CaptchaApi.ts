import log from '../../common/log' ;
import config from '../config';
import createError from 'http-errors';
import {Request, Response} from "express";
import {v4 as uuidv4} from 'uuid';
import {PageHelper} from "../browser/PageHelper";

enum CaptchaStatus {
    IN_PROGRESS = 'IN_PROGRESS',
    TIMEOUT = 'TIMEOUT',
    CANCEL = 'CANCEL',
    ERROR = 'ERROR',
    READY = 'READY',
};

type CaptchaProgress = {
    progress: CaptchaStatus,
    result?: string,
    updatedAt: number
}

export default class CaptchaApi{
    private req: Request;
    private res: Response;

    private static handles: {[handle: string]: CaptchaProgress} = {}

    constructor(req: Request, res: Response){
        this.req = req;
        this.res = res;
    }

    private static clearOldCaptchas(){
        const now = +new Date();
        for(let handle in CaptchaApi.handles){
            if(now - CaptchaApi.handles[handle].updatedAt > 180000)
                delete CaptchaApi.handles[handle];
        }
    }

    async action_recaptcha() {
        let b = this.req.body;

        CaptchaApi.clearOldCaptchas();

        if(!b.SITEKEY)
            throw createError(400, 'SITEKEY is required!');

        const handle = uuidv4();
        let info: CaptchaProgress = {
            progress: CaptchaStatus.IN_PROGRESS,
            updatedAt: +new Date()
        };
        CaptchaApi.handles[handle] = info;

        if(b.USERAGENT && typeof(b.USERAGENT) !== 'string')
            throw new Error(`USERAGENT should be string, ${typeof(b.USERAGENT)} given: ${b.USERAGENT}`);
        if(!b.SITEKEY)
            throw new Error("SITEKEY is required!");
        if(b.SITEKEY === 'undefined')
            throw new Error("SITEKEY is undefined!");
        if(!b.URL)
            throw new Error("URL is required!");
        if(typeof (b.URL) !== 'string')
            throw new Error(`URL should be string, ${typeof (b.URL)} given: ${b.URL}`);
        if(!/^https?:\/\//.test(b.URL))
            throw new Error(`URL should be absolute, starting from http(s)://, given: ${b.URL}`);
        if(b.TIMELIMIT) {
            if(typeof(b.TIMELIMIT) === 'string' && !/^[0-9]+$/.test(b.TIMELIMIT))
                throw new Error(`TIMELIMIT should be number, ${typeof (b.TIMELIMIT)} given: ${b.TIMELIMIT}`);
            if(typeof(b.TIMELIMIT) !== 'string' && typeof(b.TIMELIMIT) !== 'number')
                throw new Error(`TIMELIMIT should be number, ${typeof (b.TIMELIMIT)} given: ${b.TIMELIMIT}`);
        }
        if(b.ACTION && typeof(b.ACTION) !== 'string')
            throw new Error(`ACTION should be string, ${typeof(b.ACTION)} given: ${b.ACTION}`);

        const promise = PageHelper.solveRecaptchaEx({
            userAgent: b.USERAGENT || undefined,
            url: b.URL,
            sitekey: b.SITEKEY,
            prompt: b.TEXT || undefined,
            timeLimit: b.TIMELIMIT || undefined,
            action: b.ACTION || undefined
        }, b.TYPE || 'v3');

        promise.then(result => {
            info.progress = CaptchaStatus.READY;
            info.result = result;
            info.updatedAt = +new Date();
        }).catch((e: any) => {
            log.error(e);
            if(e.message === 'timeout')
                info.progress = CaptchaStatus.TIMEOUT;
            else if(e.message === 'cancel')
                info.progress = CaptchaStatus.CANCEL;
            else {
                info.progress = CaptchaStatus.ERROR;
                info.result = e.message;
            }
            info.updatedAt = +new Date();
        })

        console.log(b);
        this.res.json({status: 'ok', handle: handle});
    }

    async action_result() {
        let b = this.req.body;
        const handle: string = b.handle;

        const info = CaptchaApi.handles[handle];
        if(!info)
            throw createError(400, 'Invalid handle!');

        if(info.progress === CaptchaStatus.READY)
            this.res.json({status: 'ok', result: info.result});
        else if(info.progress !== CaptchaStatus.ERROR)
            this.res.json({status: 'ok', result: info.progress});
        else
            throw new Error('Captcha unexpected error: ' + info.result);
    }

    async action(name: string){
        // @ts-ignore
        if (!this['action_' + name])
            throw createError(404, 'Action not found');

        // @ts-ignore
        await this['action_' + name]();
    }
}
