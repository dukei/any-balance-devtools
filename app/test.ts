
import log from "../common/log";
import * as fs from 'fs-extra';
import {BrowserManager} from "./browser/BrowserManager";
import {PageHelper} from "./browser/PageHelper";
import closureCompiler, {compiler} from 'google-closure-compiler';
const {getNativeImagePath, getFirstSupportedPlatform} = require('google-closure-compiler/lib/utils');
import {Schema} from 'node-schematron';

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
 /*       const response = await PageHelper.solveRecaptchaV3({
            sitekey: '6Lc66nwUAAAAANZvAnT-OK4f4D_xkdzw5MLtAYFL',
            url: 'https://xn--90adear.xn--p1ai/',
            timeLimit: 120000,
            prompt: 'Пожалуйста, докажите, что вы не робот',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
            action: 'check_fines'
        });

        log.info("finished: response - " + response);
*/
/*
        const c = new compiler({
            js: 'modules.js',
            compilation_level: 'ADVANCED',
            js_output_file: 'm1.js' 

        });

        c.spawnOptions = {stdio: 'inherit'};
        //@ts-ignore
        c.JAR_PATH = null;
        c.javaPath = getNativeImagePath()

        console.log(compiler.COMPILER_PATH);
               console.log(compiler.CONTRIB_PATH);
               console.log(compiler.JAR_PATH);
               console.log(process.platform);


        c.run((exitCode, stdout, stderr) => {
            console.log(stdout);
            console.error(stderr);
            console.log("Exitcode: " + exitCode);

        })
*/

        const xmllint = require('xmllint');
        let result = xmllint.validateXML({
            xml: await fs.readFile("C:\\SrcRep\\any-balance-providers\\providers\\ab-service-gosuslugi\\anybalance-manifest.xml", 'utf-8'),
            schema: await fs.readFile("c:\\srcrep\\any-balance-devtools\\res\\xsd\\anybalance-manifest.xsd", 'utf-8')
        });

        console.log(result);
        const schema = Schema.fromString(await fs.readFile("c:\\srcrep\\any-balance-devtools\\res\\xsd\\anybalance-manifest.sch", 'utf-8'))
        result = schema.validateString(await fs.readFile("C:\\SrcRep\\any-balance-providers\\providers\\ab-service-gosuslugi\\anybalance-manifest.xml", 'utf-8'),
            {debug: true});

        console.log(result);
    }catch(e: any){
        log.error(e.message, e.stack);
    }
})();