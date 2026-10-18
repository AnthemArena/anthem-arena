// Shows the newest Data Dragon version and checks that every champion icon we use exists at it, so the one version line in
// js/arcane-config.js can be updated with confidence:   node tools/check-ddragon.mjs [version-to-check]
// (Needs internet. Node 18+.)
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const quoted = text => [...text.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]);
const listIn = (src, name) => { const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(src); return m ? quoted(m[1]) : []; };

const cfg = read('../js/arcane-config.js');
const current = /DATA_DRAGON_VERSION = '([\d.]+)'/.exec(cfg)?.[1];
const arcaneTags = /characters: \[([\s\S]*?)\]/.exec(cfg)?.[1];
const usedChampions = [...new Set([
    ...listIn(read('../js/champion-list.js'), 'CHAMPIONS'),   // the avatar pick list
    ...quoted(arcaneTags || ''), 'Jinx', 'Vi', 'Caitlyn'
])];

// Network calls retry a few times (a single slow connection should not end the check) and run a few at a time.
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(url, method = 'GET') {
    let last;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try { return await fetch(url, { method, signal: AbortSignal.timeout(20000) }); }
        catch (e) { last = e; await sleep(attempt * 1000); }
    }
    throw new Error(`could not reach ${url} (${last?.cause?.code || last?.message}). Check your connection or VPN and run it again.`);
}
const json = async url => (await call(url)).json();
async function allSettled(items, worker, size = 6) {
    const out = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) { const i = next++; out[i] = await worker(items[i]); } }));
    return out;
}
for (const ev of ['unhandledRejection', 'uncaughtException']) process.on(ev, e => { console.error(String(e?.message || e)); process.exit(2); });

const versions = await json('https://ddragon.leagueoflegends.com/api/versions.json');
const latest = versions[0];
const target = process.argv[2] || latest;
console.log(`configured: ${current}   newest: ${latest}   checking: ${target}`);
if (!versions.includes(target)) { console.log(`"${target}" is not a Data Dragon version`); process.exit(1); }

// Only real champions have an icon. Names in our lists that are not in Data Dragon (Arcane story characters such as Vander
// or Silco, used as tags) are listed for information and never count as a failure.
const all = (await json(`https://ddragon.leagueoflegends.com/cdn/${target}/data/en_US/champion.json`)).data;
const real = new Set(Object.keys(all));
const notChampions = usedChampions.filter(id => !real.has(id));
const icons = usedChampions.filter(id => real.has(id));
console.log(`checking ${icons.length} champion icons...`);
const missing = (await allSettled(icons, async id => ((await call(`https://ddragon.leagueoflegends.com/cdn/${target}/img/champion/${id}.png`, 'HEAD')).ok ? null : id))).filter(Boolean);
// the skin art we use is not versioned: spot-check it too
const art = ['splash/Jinx_37.jpg', 'splash/Vi_29.jpg', 'splash/Caitlyn_28.jpg', 'tiles/Jinx_37.jpg'];
missing.push(...(await allSettled(art, async u => ((await call(`https://ddragon.leagueoflegends.com/cdn/img/champion/${u}`, 'HEAD')).ok ? null : u))).filter(Boolean));
const pickList = new Set(listIn(read('../js/champion-list.js'), 'CHAMPIONS'));
const newer = [...real].filter(id => !pickList.has(id));

console.log(missing.length ? `MISSING at ${target}: ${missing.join(', ')}` : `all ${usedChampions.length - notChampions.length} champion icons we use and the Arcane skin art exist at ${target}`);
if (notChampions.length) console.log(`not champions (story characters used as tags, fine): ${notChampions.join(', ')}`);
if (newer.length) console.log(`${newer.length} champions are in Data Dragon but not in the avatar pick list: ${newer.join(', ')}`);
console.log(target === current ? 'The configured version is already this one.' : `To use it: change DATA_DRAGON_VERSION to '${target}' in js/arcane-config.js`);
process.exit(missing.length ? 1 : 0);
