import puppeteer, {Browser, BrowserContext, Page} from "puppeteer";
import log from "../../common/log";

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
            const br = await puppeteer.launch({
                args: args.proxy ? [ `--proxy-server=${args.proxy}` ] : undefined,
                headless: headless,
                userDataDir: args.userDataDir
            });
            this.browsers[key] = b = {
                key: key,
                pages: 0,
                browser: br
            };
            log.info("Created browser", key);
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
        await this.preparePage(page);
        await page.setDefaultNavigationTimeout(180000);

        ++b.pages;
        log.info("Created page", b.key, b.pages);

        page.on('close', async () => {
            log.info("Closing page", b.key, b.pages);
            --b.pages;
            if(b.pages <= 0){
                delete this.browsers[b.key];
                log.info("Closing browser", b.key);
                await b.browser.close();
            }
        });

        return page;
    }

    private async preparePage(page: Page){
        // This is where we'll put the code to get around the tests.
        // Pass the User-Agent Test.
        const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';
        await page.setUserAgent(userAgent);

        // Pass the Webdriver Test.
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        // Pass the Chrome Test.
        await page.evaluateOnNewDocument(() => {
            // We can mock this in as much depth as we need for the test.
            //@ts-ignore
            window.chrome = {
                runtime: {},
                // etc.
            };
        });

        // Pass the Permissions Test.
        await page.evaluateOnNewDocument(() => {
            const originalQuery = window.navigator.permissions.query;
            //@ts-ignore
            return window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });

        // Pass the Plugins Length Test.
        await page.evaluateOnNewDocument(() => {
            // Overwrite the `plugins` property to use a custom getter.
            Object.defineProperty(navigator, 'plugins', {
                // This just needs to have `length > 0` for the current test,
                // but we could mock the plugins too if necessary.
                get: () => [1, 2, 3, 4, 5],
            });
        });

        // Pass the Languages Test.
        await page.evaluateOnNewDocument(() => {
            // Overwrite the `plugins` property to use a custom getter.
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
        });

        await page.on('console', msg => {
            const url = page.url();
            log.info('page console (' + url + '): ' + msg.text());
        });
    }
}