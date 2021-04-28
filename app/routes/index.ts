import captchaRoutes from './captcha_routes'
import {Router} from "express";

export default function(router: Router) {
    captchaRoutes(router);
};