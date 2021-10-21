// @ts-ignore
const { validateXML } = require('xmllint-wasm');

const evaluateXml = async (/** @type {string} */ xml, /** @type {string} */ xsd, /** @type {string} */ xmlName) => {
    return validateXML({ xml: {contents: xml, fileName: xmlName}, schema: xsd });
};

process.on('message', async ({ xml, xsd, xmlName }) => {
    // @ts-ignore
    process.send(await evaluateXml(xml, xsd, xmlName));
    process.exit();
});