import express, {Router} from "express";
import log from '../../common/log';
import config from "../config";
import StatusApi from "../apis/StatusApi";

export default function(router: Router) {
    const r = express.Router({mergeParams: true});
    router.use('/status/:action', r);

    const handler = async (req: any, res: any) => {
        try {
            let api = new StatusApi(req, res);
            await api.action(req.params.action);
        }catch(e: any){
            res.status(e.statusCode || 500).json({status: 'error', message: e.message});
            log.error("StatusApi error: " + e.message + '\n' + e.stack);
        }
    };

    r.route('/')
    	.get(handler)
        .post(handler);
};