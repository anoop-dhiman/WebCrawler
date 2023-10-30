const _ = require('lodash');
const axios = require("axios");
const jsdom = require("jsdom");
const fs = require("fs");
const PromiseB = require("bluebird");
const { JSDOM } = jsdom;

let url = '';
let maxDepth = 1;
let domain = '';
let concurrency = 1;
const linkTest = new RegExp('^\/.*?\/$');

const header = `{
    "results": [
`;
const footer = `
    ]
}`;
const fileName = 'output.txt';

async function fetchDomForUrl(url) {
    const res = await axios({ method: 'get', url });
    return new JSDOM(res.data);
}

function extractImagesFromDom(dom, url, depth = 0) {
    const images = [];
    let imgLinks = dom.window.document.querySelectorAll('img');
    _.forEach(imgLinks, (l) => {
        const src = l.src;
        if (_.startsWith(src, '/')) {
            images.push(`        {
            "imageUrl": "${new URL(src, url).href}",
            "sourceUrl": "${url}",
            "depth": ${depth}
        }`);
        } else if (_.includes(src, domain)) {
            images.push(`        {
            "imageUrl": "${src}",
            "sourceUrl": "${url}",
            "depth": ${depth}
        }`);
        }
    });
    return _.join(images, ',\n');
}

async function parsePage(dom, url, depth) {
    console.log("Parseing Page ~ url:", url, depth);
    let images = extractImagesFromDom(dom, url, depth);
    if (depth!== 0) {
        images = ',\n' + images;
    }
    // commit data to file
    fs.appendFileSync(fileName, images);
    let links = dom.window.document.querySelectorAll('a');
    links = _.uniqBy(links, 'href');
    if (depth + 1 <= maxDepth) {
        await PromiseB.map(links, async (l) => {
            if (linkTest.test(l.href)) {
                const subUrl = new URL(l.href, url).href;
                const subDom = await fetchDomForUrl(subUrl);
                return parsePage(subDom, subUrl, depth + 1);
            }
            return [];
        }, { concurrency });
    }
}

async function init() {
    const args = process.argv;
    if (args.length < 4) {
        console.log("Invalid number of arguments");
        return;
    }
    url = args[2];
    maxDepth = parseInt(args[3]);
    domain = _.trim(new URL(url).host, 'www.');

    console.log(`
    Starting Image Web Crawler:
        Url: ${url}
        Depth: ${maxDepth}
        Crawling Concurrency: ${concurrency}
    `);

    // append header
    fs.writeFileSync(fileName, header);

    const dom = await fetchDomForUrl(url);
    await parsePage(dom, url, 0);

    // append footer
    fs.appendFileSync(fileName, footer);
}

init();