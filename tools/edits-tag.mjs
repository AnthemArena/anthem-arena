#!/usr/bin/env node
// Picks the entrants of a cup: the top N edits of one group (default "jinx") ranked by seed, and tags them in data/edits.json.
//   npm run tag -- jinx-cup-1 256            preview only: shows what would change, writes nothing
//   npm run tag -- jinx-cup-1 256 --write    tag them
//   options:  --group jinx   which heading group to pick from (default jinx; #jinxandvi etc. are never picked unless you ask)
// Ranking is the same views + likes seeding the cup builder uses (js/group-builder.js seedEntries).
// Only edits with status "ok" that can be embedded are eligible. Running it again gives the same result: exactly N edits end up
// tagged with the cup, the rest lose that tag (their other cup tags are untouched). The leftovers are your spares.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedEntries, isValidGroupStageSize, GROUP_STAGE_SIZES } from '../js/group-builder.js';
import { isValidCupId } from './switch-cup.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const eligible = (e, group) => e.status === 'ok' && e.embedAllowed !== false && String(e.group || '').toLowerCase() === group;

// Pure: returns { errors, chosen, spares, changes, edits } and never touches the input array.
export function planTag(edits, { cupId, count, group = 'jinx' }) {
    const errors = [];
    if (!isValidCupId(cupId)) errors.push(`"${cupId}" is not a valid cup id.`);
    if (!Number.isInteger(count) || !isValidGroupStageSize(count)) errors.push(`The count must be one of ${GROUP_STAGE_SIZES.join(', ')}.`);
    const pool = edits.filter(e => eligible(e, group));
    if (Number.isInteger(count) && pool.length < count) errors.push(`Only ${pool.length} edits in group "${group}" are eligible (status ok, embeddable); ${count} are needed.`);
    if (errors.length) return { errors, chosen: [], spares: [], changes: { added: 0, removed: 0 }, edits };

    const ranked = seedEntries(pool);
    const chosenIds = new Set(ranked.slice(0, count).map(r => r.entry.videoId));
    let added = 0, removed = 0;
    const out = edits.map(e => {
        const tags = Array.isArray(e.tournaments) ? e.tournaments : [];
        const has = tags.includes(cupId), want = chosenIds.has(e.videoId);
        if (want && !has) { added++; return { ...e, tournaments: [...tags, cupId] }; }
        if (!want && has) { removed++; return { ...e, tournaments: tags.filter(t => t !== cupId) }; }
        return e;
    });
    return { errors, chosen: ranked.slice(0, count), spares: ranked.slice(count), changes: { added, removed }, edits: out };
}

function main() {
    const args = process.argv.slice(2);
    const flag = n => args.includes(n), val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
    const skip = new Set([val('--group')]);
    const pos = args.filter(a => !a.startsWith('--') && !skip.has(a));
    const [cupId, countRaw] = pos;
    if (!cupId || !countRaw) { console.error('Usage: npm run tag -- <cup-id> <how-many> [--group jinx] [--write]'); process.exit(1); }
    const file = path.join(root, 'data/edits.json');
    const edits = JSON.parse(fs.readFileSync(file, 'utf8'));
    const group = (val('--group') || 'jinx').toLowerCase();
    const plan = planTag(edits, { cupId, count: Number(countRaw), group });
    if (plan.errors.length) { plan.errors.forEach(e => console.error('FAIL  ' + e)); process.exit(1); }

    const last = plan.chosen[plan.chosen.length - 1].entry, name = r => (r.entry.shortTitle || r.entry.title || r.entry.videoId);
    console.log(`${plan.chosen.length} of ${plan.chosen.length + plan.spares.length} eligible "${group}" edits chosen for ${cupId} (best seeds first).`);
    console.log(`Lowest seed in: #${plan.chosen.length}  ${name(plan.chosen[plan.chosen.length - 1])}  (${(last.views || 0).toLocaleString()} views)`);
    console.log(`Changes: ${plan.changes.added} newly tagged, ${plan.changes.removed} untagged.`);
    if (plan.spares.length) {
        console.log(`\nSpares (${plan.spares.length}), not in the cup:`);
        plan.spares.forEach((r, i) => console.log(`  ${String(plan.chosen.length + i + 1).padStart(3)}  ${r.entry.videoId}  ${(r.entry.views || 0).toLocaleString().padStart(9)} views  ${name(r)}`));
    }
    const others = edits.filter(e => !eligible(e, group)).length;
    if (others) console.log(`\n${others} other edits (other groups, or not ok/embeddable) are not eligible and are left out.`);
    if (!flag('--write')) { console.log('\nPreview only. Add --write to save:  npm run tag -- ' + pos.join(' ') + ' --write'); return; }
    fs.writeFileSync(file, JSON.stringify(plan.edits, null, 2) + '\n');
    console.log(`\nWrote data/edits.json. Next: npm run launch -- ${cupId}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
