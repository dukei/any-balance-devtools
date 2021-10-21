import log from '../../common/log' ;
import config from '../config';
import createError from 'http-errors';
import {Request, Response} from "express";
import * as path from 'path';
import fs from 'fs';

export default class FileApi{
    private req: Request;
    private res: Response;

    constructor(req: Request, res: Response){
        this.req = req;
        this.res = res;
    }

    async action_file() {
        let file: string = this.req.params[0];

        if(!/^\w+:/.test(file))
            file = '/' + file;

        if(!path.isAbsolute(file))
            throw createError(400, 'Path is not absolute');

        const dir = path.dirname(file);

        try {
            await fs.promises.access(path.join(dir, 'anybalance-manifest.xml'));
        }catch(e){
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
