import child_process from 'child_process';
import log from "../../common/log";

//Надо запусать форком, чтобы не валился node
//https://github.com/kripken/xml.js/issues/14#issuecomment-706716520
export default class XSDVerifier{
    public constructor() {
    }

    public async verify(params: {xml: string, xsd: string, xmlName: string}): Promise<{valid: boolean, rawOutput?: string}>{
        if(process.env.TS_NODE_DEV) {
            log.warn(params.xmlName + ": Running under ts-node-dev, skipping xsd validation fork");
            return {valid: true};
        }else{
            return new Promise(resolve => {
                const lint = child_process.fork(`${__dirname}/xmllint.js`);
                lint.on('message', resolve);
                lint.send(params);
            });
        }
    }
}