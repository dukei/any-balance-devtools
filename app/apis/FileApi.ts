import log from '../../common/log' ;
import config from '../config';
import createError from 'http-errors';
import {Request, Response} from "express";
import * as path from 'path';
import * as fs from 'fs-extra';
import os from 'os';

export default class FileApi{
    private req: Request;
    private res: Response;

    constructor(req: Request, res: Response){
        this.req = req;
        this.res = res;
    }

    async action_file() {
        let file: string = this.req.params[0];

        if(!/^\w+:/.test(file) && os.platform() !== 'win32')
            file = '/' + file;

        if(!path.isAbsolute(file))
            throw createError(400, 'Path is not absolute: ' + file);

        const dir = path.dirname(file);
        const manifestPath = path.join(dir, 'anybalance-manifest.xml');

        try {
            await fs.access(manifestPath);
        }catch(e){
            log.debug(`Accessing ${file}. ${manifestPath} is inaccessible`);
            throw createError(403, 'You can only access files in the same directory with anybalance-manifest.xml');
        }

        this.res.sendFile(file);
    }

    async action(name: string){
        // @ts-ignore
        if (!this['action_' + name])
            throw createError(404, 'Action not found');

        // @ts-ignore
        await this['action_' + name]();
    }
}
