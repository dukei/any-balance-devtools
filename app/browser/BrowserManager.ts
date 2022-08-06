import puppeteer from "puppeteer-extra";
import {Browser, BrowserContext, BrowserFetcher, Page} from "puppeteer";
import log from "../../common/log";
import * as path from "path";
import config from "../config";
import StealthPlugin from "puppeteer-extra-plugin-stealth"

type SpecificBrowser = {
    key: string
    pages: number
    browser: Browser
}

export type BrowserArgs = {
    incognito?: boolean,
    proxy?: string,
    headless?: boolean,
    userAgent?: string,
    userDataDir?: string
}

export class BrowserManager {
    private static instance: BrowserManager;
    private browsers: {[key: string]: SpecificBrowser} = {};

    private constructor(){
        puppeteer.use(StealthPlugin());
    }

    public static getInstance(): BrowserManager{
        return BrowserManager.instance || (BrowserManager.instance = new BrowserManager());
    }

    private async getBrowser(args: BrowserArgs): Promise<SpecificBrowser>{
        const headless = args.headless || false;
        const incognito = args.incognito || false;
        const key = [incognito, headless, args.proxy || ''].join(',');
        let b = this.browsers[key];
        if(!b) {
            //TODO: replace to SingleInit
            //https://github.com/vercel/pkg/issues/204#issuecomment-363219758
            const isPkg = (<any>process).pkg !== undefined;
            //https://github.com/puppeteer/puppeteer/issues/6899
            const executablePath = <string>(<any>puppeteer).executablePath();

            const chromiumExecutablePath = (isPkg
                    ? executablePath.replace(
                        /^.*?[\/\\]node_modules[\/\\]puppeteer[\/\\]\.local-chromium/,
                        path.join(path.dirname(process.execPath), 'chromium')
                    )
                    : executablePath
            )

            const _args: string[] = [];
            if(args.proxy)
                _args.push(`--proxy-server=${args.proxy}`);
            if(config.browser.extraLaunchFlags?.length)
                _args.push(...config.browser.extraLaunchFlags);

            const br = await puppeteer.launch({
                args: _args.length ? _args : [],
                headless: headless,
                userDataDir: args.userDataDir,
                executablePath: chromiumExecutablePath
            });
            this.browsers[key] = b = {
                key: key,
                pages: 0,
                browser: br
            };
            log.trace("Created browser", key);
        }
        return b;
    }

    async newPage(args: BrowserArgs): Promise<Page>{
        const b = await this.getBrowser(args);

        const br = b.browser;
        let context: BrowserContext;
        if(args.incognito) {
            context = await br.createIncognitoBrowserContext();
        }else{
            context = br.defaultBrowserContext();
        }

        const page = await context.newPage();
        await this.preparePage(page, args);
        await page.setDefaultNavigationTimeout(180000);

        ++b.pages;
        log.trace("Created page", b.key, b.pages);

        page.on('close', async () => {
            log.trace("Closing page", b.key, b.pages);
            --b.pages;
            if(b.pages <= 0){
                delete this.browsers[b.key];
                log.trace("Closing browser", b.key);
                await b.browser.close();
            }
        });

        return page;
    }

    private async preparePage(page: Page, args: BrowserArgs){
        // This is where we'll put the code to get around the tests.
        // Pass the User-Agent Test.
        const userAgent = args.userAgent || 'Mozilla/5.0 (X11; Linux x86_64)' +
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';
        await page.setUserAgent(userAgent);
    }
}