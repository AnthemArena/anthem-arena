#!/usr/bin/env node
// Preview (or audit) a group-stage cup's draw without touching Firebase.
//   node tools/group-preview.mjs jinx-cup-1                    (size = edits entered in the cup, new random seed)
//   node tools/group-preview.mjs jinx-cup-1 --seed my-seed     (re-run a published draw)
//   node tools/group-preview.mjs --demo 64                     (no cup yet: use the top 64 edits by views)
//   add --simulate to play every match with made-up votes and show the tables and the knockout round 1
//   add --all to print every group (the default prints the first 4)     --file data/edits.json
import fs from 'node:fs';
import { makeDrawSeed, cupDisplayName } from '../js/bracket-builder.js';
import {
    selectGroupEntries, buildGroupStage, buildGroupTournamentDoc, describeGroups, allGroupStandings, knockoutPairs,
    buildKnockoutMatches, totalRoundsFor, isValidGroupStageSize, GROUP_STAGE_SIZES
} from '../js/group-builder.js';

const args = process.argv.slice(2);
const flag = f => { const i = args.indexOf(f); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const take = f => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : null; };
const simulate = flag('--simulate'), showAll = flag('--all');
const demo = take('--demo'), seedArg = take('--seed'), file = take('--file') || 'data/edits.json';
const cupId = args[0] || 'demo-cup';
if (!demo && !args[0]) { console.error('Usage: node tools/group-preview.mjs <cup-id> [--seed S] [--simulate] [--all]   or   --demo N'); process.exit(1); }

const edits = JSON.parse(fs.readFileSync(file, 'utf8'));
let entries, notes = [], size;
if (demo) {
    size = Number(demo);
    if (!isValidGroupStageSize(size)) { console.error(`--demo must be one of ${GROUP_STAGE_SIZES.join(', ')}`); process.exit(1); }
    entries = edits.filter(e => e.status === 'ok' && e.embedAllowed !== false).sort((a, b) => b.views - a.views).slice(0, size);
    if (entries.length < size) { console.error(`Only ${entries.length} usable edits in ${file}.`); process.exit(1); }
} else {
    const sel = selectGroupEntries(edits, cupId);
    if (sel.errors.length) { console.error(`\nCannot build ${cupId}:\n  - ${sel.errors.join('\n  - ')}\n`); process.exit(1); }
    ({ entries, notes, size } = sel);
}
if (notes.length) console.log(`\nNotes (not errors):\n  - ${notes.join('\n  - ')}`);

const drawSeed = seedArg || makeDrawSeed(cupId);
const cupName = cupDisplayName(cupId);
const { groups, matches, seeding, notes: groupNotes } = buildGroupStage({ cupId, cupName, entries, drawSeed });
const doc = buildGroupTournamentDoc({ cupId, cupName, size, drawSeed, entries, seeding });
console.log(`\n${cupName}${demo ? ' (DEMO: top edits by views)' : ''}: ${size} edits in ${groups.length} groups of 4, ${matches.length} group matches, then a ${doc.groupStage.qualifiers}-edit knockout (${doc.totalRounds} rounds in all)`);
console.log(`Draw seed: ${drawSeed}`);
if (seeding.some(s => s.likesEstimated)) console.log(`Likes were hidden on ${seeding.filter(s => s.likesEstimated).length} edit(s): estimated from views for seeding.`);
if (groupNotes.length) console.log(`\n${groupNotes.join('\n')}`);
const lines = describeGroups(groups);
console.log('\nGroups (pot 1 | pot 2 | pot 3 | pot 4):');
console.log(lines.slice(0, showAll ? undefined : 4).map(l => '  ' + l).join('\n') + (!showAll && lines.length > 4 ? `\n  ... ${lines.length - 4} more (use --all)` : ''));

if (simulate) {
    let t = 1779033703; const rand = () => { t = (Math.imul(t ^ (t >>> 15), 1 | t) + 0x6D2B79F5) | 0; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const views = new Map(entries.map(e => [e.videoId, e.views || 1]));
    const played = matches.map(m => {
        const a = Math.sqrt(views.get(m.song1.id)), b = Math.sqrt(views.get(m.song2.id));
        const total = 80 + Math.floor(rand() * 120), v1 = Math.max(0, Math.round(total * (a / (a + b)) + (rand() - 0.5) * total * 0.5)), v2 = total - Math.min(total, v1);
        const w = v1 >= v2 ? m.song1 : m.song2;
        return { ...m, status: 'completed', song1: { ...m.song1, votes: v1 }, song2: { ...m.song2, votes: v2 }, winnerId: w.id };
    });
    const st = allGroupStandings(played);
    console.log('\nSimulated group tables (made-up votes; * = qualifies):');
    for (const g of st.slice(0, showAll ? undefined : 4)) {
        console.log(`  Group ${g.name}${g.unresolvedTie ? '   (!) dead heat at the cut, decided by draw position' : ''}`);
        for (const r of g.rows) console.log(`    ${r.rank <= 2 ? '*' : ' '} ${r.rank}. ${String(r.title).slice(0, 34).padEnd(34)} W${r.wins} L${r.losses}  ${String(r.votesFor).padStart(4)}-${String(r.votesAgainst).padEnd(4)} ${(r.share * 100).toFixed(1)}%  (seed ${r.seed})`);
    }
    const km = buildKnockoutMatches({ cupId, cupName, pairs: knockoutPairs(st), totalRounds: totalRoundsFor(size) });
    const r2 = km.filter(m => m.round === 2);
    console.log(`\nKnockout round 1 (${r2[0].roundLabel}), ${r2.length} matches:`);
    console.log(r2.slice(0, showAll ? undefined : 8).map(m => `  ${m.matchNumber}. ${m.song1.fromGroup}${m.song1.groupRank} ${String(m.song1.shortTitle).slice(0, 34)}  vs  ${m.song2.fromGroup}${m.song2.groupRank} ${String(m.song2.shortTitle).slice(0, 34)}`).join('\n') + (!showAll && r2.length > 8 ? `\n  ... ${r2.length - 8} more` : ''));
    console.log(`\nTotal matches: ${matches.length} group + ${km.length} knockout = ${matches.length + km.length}`);
}
console.log('');
