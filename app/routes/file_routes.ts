import express, {Router} from "express";
import log from '../../common/log';
import config from "../config";
import FileApi from "../apis/FileApi";

export default function(router: Router) {
    const r = express.Router({mergeParams: true});
    router.use('/file/*', r);

    const handler = async (req: any, res: any) => {
        try {
            let api = new FileApi(req, res);
            await api.action('file');
        }catch(e){
            res.status(e.statusCode || 500).json({status: 'error', message: e.message});
            log.error("FileApi error: " + e.message + '\n' + e.stack);
        }
    };

    r.route('/')
    	.get(handler);
};