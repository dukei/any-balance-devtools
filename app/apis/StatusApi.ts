import log from '../../common/log' ;
import config from '../config';
import createError from 'http-errors';
import {Request, Response} from "express";
import appRoot from 'app-root-path';
import * as path from "path";

export default class StatusApi{
    private req: Request;
    private res: Response;

    constructor(req: Request, res: Response){
        this.req = req;
        this.res = res;
    }

    async action_version() {
        let b = this.req.body;

        const pkg = require(path.join(appRoot.path, 'package.json'));

        this.res.json({status: 'ok', version: pkg.version});

    }

    async action(name: string){
        // @ts-ignore
        if (!this['action_' + name])
            throw createError(404, 'Action not found');

        // @ts-ignore
        await this['action_' + name]();
    }
}
