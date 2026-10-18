// Achievement lines of Jinx, Vi and Caitlyn: every real achievement has one, in the Arcane voice, with only placeholders the loader fills.
//   node tools/test-champion-achievements.mjs
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
let failed = 0;
const check = (name, ok, got) => { console.log((ok ? '  ok  ' : 'FAIL  ') + name + (ok ? '' : '   got: ' + JSON.stringify(got))); if (!ok) failed++; };

const ids = [...read('../js/achievements.js').matchAll(/^\s+id: '([a-z-]+)',\s*$/gm)].map(m => m[1]);
const loader = read('../js/champion-loader.js');
check('found the real achievement ids', ids.length >= 30, ids.length);
for (const pack of ['jinx', 'vi', 'caitlyn']) {
const A = JSON.parse(read(`../champion-packs/${pack}.json`)).achievements;
console.log(`-- ${pack}`);
check('every real achievement id has a Jinx entry (the old ids came from the previous site and never matched)', ids.every(i => A[i]), ids.filter(i => !A[i]));
check('there is a default, a founding-member, a level-up and a mastery-up entry', ['default', 'founding-member', 'level-up', 'mastery-up'].every(k => A[k]));
check('every entry has messages, details and buttons', Object.values(A).every(e => ['messages', 'details', 'buttons'].every(k => Array.isArray(e[k]) && e[k].length >= 2)));

const allowed = new Set(['xp', 'name', 'description', 'rarity', 'rank']);
const used = new Set();
for (const e of Object.values(A)) for (const k of ['messages', 'details', 'buttons']) for (const s of e[k]) for (const m of s.matchAll(/\{(\w+)\}/g)) used.add(m[1]);
check('lines only use placeholders the loader fills', [...used].every(p => allowed.has(p)), [...used]);
check('the loader really replaces each of those placeholders', [...used].every(p => loader.includes(`\\{${p}\\}`)), [...used]);
check('no line yells in capitals with double exclamation marks (that is the League voice, the page speaks in the Arcane one)', Object.values(A).every(e => [...e.messages, ...e.details, ...e.buttons].every(s => !/!!/.test(s))));
check('detail lines show the XP', Object.entries(A).filter(([k]) => k !== 'level-up' && k !== 'mastery-up').every(([, e]) => e.details.every(s => s.includes('{xp}'))));
check('no achievement line mentions percentages or standings', Object.values(A).every(e => [...e.messages, ...e.details].every(s => !s.includes('%'))));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
