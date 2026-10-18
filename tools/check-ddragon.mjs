// Shows the newest Data Dragon version and checks that our champion icons exist at it, so the one version line in
// js/arcane-config.js can be updated with confidence:   node tools/check-ddragon.mjs [version-to-check]
// (Needs internet. Node 18+.)
import fs from 'node:fs';
const cfg = fs.readFileSync(new URL('../js/arcane-config.js', import.meta.url), 'utf8');
const current = /DATA_DRAGON_VERSION = '([\d.]+)'/.exec(cfg)?.[1];
const ids = [...cfg.matchAll(/^\s+'([A-Za-z]+)',?\s*$/gm)].map(m => m[1]).filter(x => /^[A-Z]/.test(x));
const bonus = ['Jinx', 'Vi', 'Caitlyn', 'Ekko', 'Jayce', 'Viktor', 'Heimerdinger', 'Warwick', 'Singed', 'Mel'];
const champs = [...new Set([...ids, ...bonus])];

const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
const latest = versions[0];
const target = process.argv[2] || latest;
console.log(`configured: ${current}   newest: ${latest}   checking: ${target}`);
if (!versions.includes(target)) { console.log(`"${target}" is not a Data Dragon version`); process.exit(1); }

const missing = [];
for (const id of champs) {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${target}/img/champion/${id}.png`, { method: 'HEAD' });
    if (!res.ok) missing.push(id);
}
// the skin art we use is not versioned: spot-check it too
for (const u of ['splash/Jinx_37.jpg', 'splash/Vi_29.jpg', 'splash/Caitlyn_28.jpg', 'tiles/Jinx_37.jpg']) {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/img/champion/${u}`, { method: 'HEAD' });
    if (!res.ok) missing.push(u);
}
console.log(missing.length ? `MISSING at ${target}: ${missing.join(', ')}` : `all ${champs.length} champion icons and the Arcane skin art exist at ${target}`);
console.log(target === current ? 'The configured version is already this one.' : `To use it: change DATA_DRAGON_VERSION to '${target}' in js/arcane-config.js`);
process.exit(missing.length ? 1 : 0);
