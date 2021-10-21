import {TwingEnvironment, TwingLoaderArray, TwingFilter} from "twing";
import config from "../config";
import {ABCmdTemplate} from "./ABVersionIncrementer";
import log from "../../common/log";

export default class Templater {
    private readonly twing: TwingEnvironment;

    constructor() {
        const loader = new TwingLoaderArray(config.ab.templates)
        this.twing = new TwingEnvironment(loader, {autoescape: false});

        const filter = new TwingFilter('safe', async (value: string, type: string) => {
            switch(type){
                case 'nl':
                    return Templater.nl(value);
                case 'dq':
                    return Templater.nl(Templater.dq(value));
                case 'sq':
                    return Templater.nl(Templater.sq(value));
                default:
                    log.error('Unknown safe filter argument: ' + type + ". Only nl, dq, sq are allowed");
                    throw new Error('Unknown safe filter argument: ' + type + ". Only nl, dq, sq are allowed");
            }
        }, [{name: 'type', defaultValue: "nl"}], {is_variadic: true});

        this.twing.addFilter(filter);
    }

    public render(name: string, context?: any): Promise<string>{
        return this.twing.render(name, context)
    }

    private static nl(v: string): string{
        return v.replace(/[\r\n]+/g, ' ');
    }

    private static dq(v: string): string{
        return v.replace(/"/g, '""');
    }

    private static sq(v: string): string{
        return v.replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    }
}