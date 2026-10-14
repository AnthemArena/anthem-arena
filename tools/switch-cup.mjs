#!/usr/bin/env node
// Switches the ACTIVE cup in every place that has to agree, or checks that they agree.
//
//   node tools/switch-cup.mjs jinx-cup-1            change all four places to jinx-cup-1
//   node tools/switch-cup.mjs jinx-cup-1 --dry-run  show what would change, write nothing
//   node tools/switch-cup.mjs --check               report the cup in each place; exit code 1 if they disagree
//
// The four places:
//   js/arcane-config.js                        ARCANE_CONFIG.tournamentId  (pages, admin, builder)
//   netlify/edge-functions/firebase-cache.js   TOURNAMENT                  (/api/matches)
//   netlify/edge-functions/live-matches.js     TOURNAMENT                  (the live page)
//   firestore.rules                            activeTournament()          (which cup accepts votes)
//
// The first three go live when you commit and deploy. THE RULES DO NOT: after switching, publish firestore.rules in the Firebase
// console (Firestore Database > Rules), or every vote on the new cup is rejected. This tool cannot see what is published there.
//
// All-or-nothing: if any of the four files does not have exactly one place to change, nothing is written.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = [
    { file: 'js/arcane-config.js', what: 'pages, admin and builder (ARCANE_CONFIG.tournamentId)', re: /(tournamentId:\s*)(['"])([^'"\n]+)\2/g },
    { file: 'netlify/edge-functions/firebase-cache.js', what: '/api/matches (TOURNAMENT)', re: /(const TOURNAMENT\s*=\s*)(['"])([^'"\n]+)\2/g },
    { file: 'netlify/edge-functions/live-matches.js', what: 'the live page (TOURNAMENT)', re: /(const TOURNAMENT\s*=\s*)(['"])([^'"\n]+)\2/g },
    { file: 'firestore.rules', what: 'which cup accepts votes (activeTournament)', re: /(function activeTournament\(\)\s*\{\s*return\s*)(['"])([^'"\n]+)\2/g }
];

// Same shape as the cup ids the builders and the admin page expect: lower-case letters, digits and hyphens.
export const isValidCupId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(id);

// Reads each file and finds its one place. Returns { rows, problems }.
export function inspect(root) {
    const rows = [], problems = [];
    for (const t of TARGETS) {
        const full = path.join(root, t.file);
        if (!fs.existsSync(full)) { problems.push(`${t.file}: file not found`); continue; }
        const src = fs.readFileSync(full, 'utf8');
        const hits = [...src.matchAll(new RegExp(t.re.source, 'g'))];
        if (hits.length !== 1) { problems.push(`${t.file}: expected exactly one place to change, found ${hits.length}`); continue; }
        rows.push({ ...t, full, src, current: hits[0][3] });
    }
    return { rows, problems };
}

// Returns { changes: [{file, from, to, text}], problems }. Writes nothing.
export function plan(root, cupId) {
    const { rows, problems } = inspect(root);
    if (problems.length) return { changes: [], problems };
    return {
        problems: [],
        changes: rows.map(r => ({
            file: r.file, what: r.what, from: r.current, to: cupId, full: r.full,
            text: r.src.replace(new RegExp(r.re.source), (m, pre, q) => `${pre}${q}${cupId}${q}`)
        }))
    };
}

function entryReport(root, cupId) {
    try {
        const edits = JSON.parse(fs.readFileSync(path.join(root, 'data/edits.json'), 'utf8'));
        return edits.filter(e => Array.isArray(e.tournaments) && e.tournaments.includes(cupId)).length;
    } catch { return null; }
}

async function main() {
    const args = process.argv.slice(2);
    const flag = f => { const i = args.indexOf(f); if (i >= 0) { args.splice(i, 1); return true; } return false; };
    const rootArg = (() => { const i = args.indexOf('--root'); return i >= 0 ? args.splice(i, 2)[1] : null; })();
    const root = rootArg ? path.resolve(rootArg) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const check = flag('--check'), dry = flag('--dry-run');
    const cupId = args[0];

    if (check || !cupId) {
        if (!check) { console.error('Usage: node tools/switch-cup.mjs <cup-id> [--dry-run]\n       node tools/switch-cup.mjs --check'); process.exit(1); }
        const { rows, problems } = inspect(root);
        if (problems.length) { console.error('\nCannot check:\n  - ' + problems.join('\n  - ') + '\n'); process.exit(1); }
        console.log('\nActive cup in each place:');
        for (const r of rows) console.log(`  ${r.file.padEnd(44)} ${r.current}`);
        const ids = new Set(rows.map(r => r.current));
        if (ids.size > 1) { console.error(`\n❌ They DISAGREE (${[...ids].join(', ')}). Run: node tools/switch-cup.mjs <cup-id>\n`); process.exit(1); }
        const [id] = ids, n = entryReport(root, id);
        console.log(`\n✅ All four agree: ${id}`);
        if (n !== null) console.log(`   ${n} edit(s) in data/edits.json list "${id}" in their tournaments.`);
        console.log('   Not checked: the rules published in the Firebase console must also say this id (Firestore Database > Rules).\n');
        return;
    }

    if (!isValidCupId(cupId)) {
        console.error(`\n❌ "${cupId}" is not a usable cup id. Use lower-case letters, digits and hyphens, for example jinx-cup-1. Nothing was changed.\n`);
        process.exit(1);
    }
    const { changes, problems } = plan(root, cupId);
    if (problems.length) { console.error('\n❌ Nothing was changed:\n  - ' + problems.join('\n  - ') + '\n'); process.exit(1); }

    const todo = changes.filter(c => c.from !== c.to);
    console.log(`\nSwitching the active cup to "${cupId}"${dry ? ' (dry run: nothing is written)' : ''}:`);
    for (const c of changes) console.log(`  ${c.file.padEnd(44)} ${c.from === c.to ? `already ${c.to}` : `${c.from}  ->  ${c.to}`}`);
    if (!todo.length) { console.log('\nNothing to do: all four already say ' + cupId + '.\n'); return; }
    if (!dry) for (const c of todo) fs.writeFileSync(c.full, c.text);

    const n = entryReport(root, cupId);
    if (n === 0) console.log(`\n⚠️  No edit in data/edits.json lists "${cupId}" in its tournaments yet, so there is nothing to build.`);
    console.log(`
${dry ? 'Would do' : 'Done'}. NOW:
  1. Commit and deploy (the first three files go live with the site).
  2. PUBLISH firestore.rules in the Firebase console: Firestore Database > Rules > paste the file > Publish.
     Until you do, votes on ${cupId} are rejected. This is the step that is easy to forget.
  3. Check:  node tools/switch-cup.mjs --check
`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
