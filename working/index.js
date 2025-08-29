const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

async function get(url) {
    const lib = url.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
        lib.get(url, res => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error('Request Failed'));
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({ data }));
        }).on('error', reject);
    });
}

function getCountriesMap() {
    const display = new Intl.DisplayNames(['en'], { type: 'region' });
    const map = {};
    for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
            const code = String.fromCharCode(a) + String.fromCharCode(b);
            const name = display.of(code);
            if (name && name !== code) map[code] = name;
        }
    }
    return map;
}

async function main() {
    const manualLinksPath = 'manual-links.json';
    const onlineSourcesPath = 'online-sources.json';
    const linksPath = 'links.json';
    const countriesDir = 'countries';

    const protocols = ['vmess://', 'vless://', 'ss://', 'trojan://'];
    const protocolFiles = {
        'vmess://': 'vm.txt',
        'vless://': 'vl.txt',
        'ss://': 'ss.txt',
        'trojan://': 'tr.txt'
    };

    const onlineSources = JSON.parse(fs.readFileSync(onlineSourcesPath, 'utf8'));
    const countriesMap = getCountriesMap();

    let allLinks = new Set();
    try {
        const manualLinks = JSON.parse(fs.readFileSync(manualLinksPath, 'utf8'));
        manualLinks.forEach(link => allLinks.add(link));
    } catch {}

    let currentSource = 0;
    for (const source of onlineSources) {
        try {
            process.stdout.write(`\r[${++currentSource}/${onlineSources.length}] Fetching sources... `);
            const response = await get(source);
            const links = response.data.match(/https:\/\/[^\s"]+/g);
            links?.forEach(link => allLinks.add(link));
        } catch {}
    }
    process.stdout.write("Done!\n");

    fs.writeFileSync(linksPath, JSON.stringify([...allLinks], null, 2));

    let configs = new Set();
    currentSource = 0;
    for (const link of allLinks) {
        try {
            process.stdout.write(`\r[${++currentSource}/${allLinks.size}] Fetching configs... `);
            const response = await get(link);
            let data = response.data;

            if (/^[A-Za-z0-9+/=]+$/.test(data.replace(/\s/g, ''))) {
                try {
                    data = decodeBase64(data);
                } catch {}
            }

            data.split('\n').forEach(line => {
                if (!line.includes('@127.0.0.1:1080?')) {
                    configs.add(sanitizeText(line.trim()));
                }
            });
        } catch {}
    }
    process.stdout.write("Done!\n");

    configs = [...configs].filter(line => protocols.some(proto => line.startsWith(proto)));

    process.stdout.write('Formatting files... ');

    const protocolContent = protocols.reduce((acc, proto) => {
        acc[proto] = configs.filter(line => line.startsWith(proto));
        return acc;
    }, {});

    for (const [proto, filename] of Object.entries(protocolFiles)) {
        fs.writeFileSync(filename, protocolContent[proto].join('\n'));
    }

    const countryContent = {};
    for (const line of configs) {
        const country = extractCountry(line, countriesMap);
        if (country) {
            if (!countryContent[country]) countryContent[country] = [];
            countryContent[country].push(line);
        }
    }

    fs.mkdirSync(countriesDir, { recursive: true });
    for (const [country, lines] of Object.entries(countryContent)) {
        fs.writeFileSync(path.join(countriesDir, `${sanitizeFileName(country)}.txt`), lines.join('\n'));
    }

    process.stdout.write("Done!\n");

    splitConfigs(configs);
}

function sanitizeText(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[^\x20-\x7E]/g, '');
}

function decodeBase64(text) {
    return Buffer.from(text, 'base64').toString('utf8');
}

function sanitizeFileName(name) {
    return name.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_');
}

function splitConfigs(configs) {
    let part = 1;
    for (let i = 0; i < configs.length; i += 10000) {
        const chunk = configs.slice(i, i + 10000).join('\n');
        fs.writeFileSync(`m1n1-5ub-${part}.txt`, chunk);
        part++;
    }
    console.log('The file is split into parts successfully');
}

function extractCountry(line, countriesMap) {
    let tag = '';
    const idx = line.indexOf('#');
    if (idx !== -1) {
        tag = line.substring(idx + 1);
    } else if (line.startsWith('vmess://')) {
        try {
            const json = JSON.parse(decodeBase64(line.slice(8)));
            tag = json.ps || '';
        } catch {}
    }

    if (!tag) return null;

    tag = decodeURIComponent(tag.replace(/\+/g, ' '));
    tag = sanitizeText(tag);

    const parts = tag.split(/[^A-Za-z]/);
    for (const part of parts) {
        const upper = part.toUpperCase();
        if (countriesMap[upper]) return countriesMap[upper];
    }

    const lowerTag = tag.toLowerCase();
    for (const name of Object.values(countriesMap)) {
        if (lowerTag.includes(name.toLowerCase())) return name;
    }

    return null;
}

main();
