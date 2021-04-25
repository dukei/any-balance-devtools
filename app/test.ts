
import log from "../common/log";
import {BrowserManager} from "../browser/BrowserManager";
import {PageHelper} from "../browser/PageHelper";


(async () => {
    try {
/*
        const response = await PageHelper.solveRecaptcha({
            sitekey: '6Lf_2Q0TAAAAABzDzxrOMAFty0K_OLFDhlu7P7in',
            url: 'https://payeer.com/',
            timeLimit: 120000,
            prompt: 'Пожалуйста, докажите, что вы не робот',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
        });
*/
        const response = await PageHelper.solveRecaptchaV3({
            sitekey: '6Lc66nwUAAAAANZvAnT-OK4f4D_xkdzw5MLtAYFL',
            url: 'https://xn--90adear.xn--p1ai/',
            timeLimit: 120000,
            prompt: 'Пожалуйста, докажите, что вы не робот',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
            action: 'check_fines'
        });

        log.info("finished: response - " + response);

    }catch(e){
        log.error(e.message, e.stack);
    }
})();