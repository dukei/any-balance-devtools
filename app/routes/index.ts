import captchaRoutes from './captcha_routes'
import statusRoutes from './status_routes'
import fileRoutes from './file_routes'
import {Router} from "express";

export default function(router: Router) {
    captchaRoutes(router);
    statusRoutes(router);
    fileRoutes(router);
};