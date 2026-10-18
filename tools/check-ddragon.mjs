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
    ...listIn(read('../js/username-system.js'), 'CHAMPIONS'),   // the avatar pick list
    ...listIn(read('../js/settings-modal.js'), 'CHAMPIONS'),
    ...quoted(arcaneTags || ''), 'Jinx', 'Vi', 'Caitlyn'
])];

const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
const latest = versions[0];
const target = process.argv[2] || latest;
console.log(`configured: ${current}   newest: ${latest}   checking: ${target}`);
if (!versions.includes(target)) { console.log(`"${target}" is not a Data Dragon version`); process.exit(1); }

// Only real champions have an icon. Names in our lists that are not in Data Dragon (Arcane story characters such as Vander
// or Silco, used as tags) are listed for information and never count as a failure.
const all = (await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${target}/data/en_US/champion.json`)).json()).data;
const real = new Set(Object.keys(all));
const notChampions = usedChampions.filter(id => !real.has(id));
const missing = [];
for (const id of usedChampions.filter(id => real.has(id))) {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${target}/img/champion/${id}.png`, { method: 'HEAD' });
    if (!res.ok) missing.push(id);
}
// the skin art we use is not versioned: spot-check it too
for (const u of ['splash/Jinx_37.jpg', 'splash/Vi_29.jpg', 'splash/Caitlyn_28.jpg', 'tiles/Jinx_37.jpg']) {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/img/champion/${u}`, { method: 'HEAD' });
    if (!res.ok) missing.push(u);
}
const pickList = new Set(listIn(read('../js/username-system.js'), 'CHAMPIONS'));
const newer = [...real].filter(id => !pickList.has(id));

console.log(missing.length ? `MISSING at ${target}: ${missing.join(', ')}` : `all ${usedChampions.length - notChampions.length} champion icons we use and the Arcane skin art exist at ${target}`);
if (notChampions.length) console.log(`not champions (story characters used as tags, fine): ${notChampions.join(', ')}`);
if (newer.length) console.log(`${newer.length} champions are in Data Dragon but not in the avatar pick list: ${newer.join(', ')}`);
console.log(target === current ? 'The configured version is already this one.' : `To use it: change DATA_DRAGON_VERSION to '${target}' in js/arcane-config.js`);
process.exit(missing.length ? 1 : 0);
