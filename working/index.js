const fs = require('fs');
const axios = require('axios');
const atob = require('atob');
const btoa = require('btoa');

async function main() {
    const manualLinksPath = 'manual-links.json';
    const onlineSourcesPath = 'online-sources.json';
    const linksPath = 'links.json';
    const outputPath = '5ubscrpt10n.txt';
    const outputB64Path = '5ubscrpt10n_b64.txt';

    const onlineSources = JSON.parse(fs.readFileSync(onlineSourcesPath, 'utf8'));

    const protocols = ['vmess://', 'vless://', 'ss://', 'trojan://'];
    const protocolFiles = {
        'vmess://': 'vmess.txt',
        'vless://': 'vless.txt',
        'ss://': 'shadowsocks.txt',
        'trojan://': 'trojan.txt'
    };

    let allLinks = new Set();
    try {
        const manualLinks = JSON.parse(fs.readFileSync(manualLinksPath, 'utf8'));
        manualLinks.forEach(link => allLinks.add(link));
    } catch {}

    let currentSource = 0;
    for (const source of onlineSources) {
        try {
            process.stdout.write(`\r[${++currentSource}/${onlineSources.length}] Fetching sources... `);
            const response = await axios.get(source);
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
            const response = await axios.get(link);
            let data = response.data;

            // Decode base64 if detected
            if (/^[A-Za-z0-9+/=]+$/.test(data.replace(/\s/g, ''))) {
                try {
                    data = atob(data);
                } catch {}
            }

            data.split('\n').forEach(line => {
                if (!line.includes('@127.0.0.1:1080?')) {
                    configs.add(line.trim());
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

    fs.writeFileSync(outputPath, configs.join('\n'));
    fs.writeFileSync(outputB64Path, btoa(configs.join('\n')));

    for (const [proto, filename] of Object.entries(protocolFiles)) {
        fs.writeFileSync(filename, protocolContent[proto].join('\n'));
    }

    process.stdout.write("Done!\n");
}

main();
