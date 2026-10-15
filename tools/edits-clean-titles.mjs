#!/usr/bin/env node
// Gives every edit in data/edits.json a clean `shortTitle` (the YouTube title without its trailing hashtags).
//
//   node tools/edits-clean-titles.mjs             DRY RUN: lists what would change, writes nothing
//   node tools/edits-clean-titles.mjs --write     saves the changes to data/edits.json
//   node tools/edits-clean-titles.mjs my.json     work on another file
//
// Safe by design:
//   - only entries whose shortTitle is still identical to the YouTube `title` (or missing) are touched: a shortTitle you wrote by hand is KEPT
//   - only `shortTitle` changes; `title` (the full title shown on hover and kept for search) and every other field stay as they are
//   - running it twice changes nothing the second time
//   - it refuses to write if saving would reformat the file (so the diff is only the titles)
// A cup copies shortTitle into its matches when the cup is BUILT, so run this BEFORE building a real cup; matches that already
// exist keep the titles they were built with (the pages also hide trailing hashtags when they display a name).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cleanTitle } from '../js/title-clean.js';

const norm = t => String(t ?? '').replace(/\s+/g, ' ').trim();

// pure: returns { edits: <new array>, changed: [{ id, before, after }], keptByHand: n, alreadyClean: n }
export function cleanEdits(edits) {
    const changed = [];
    let keptByHand = 0, alreadyClean = 0;
    const out = edits.map(e => {
        const handEdited = e.shortTitle && norm(e.shortTitle) !== norm(e.title);
        if (handEdited) { keptByHand++; return e; }
        const after = cleanTitle(e.title);
        if (after === e.shortTitle) { alreadyClean++; return e; }
        changed.push({ id: e.id, before: e.shortTitle ?? '(none)', after });
        return { ...e, shortTitle: after };
    });
    return { edits: out, changed, keptByHand, alreadyClean };
}

function main() {
    const args = process.argv.slice(2);
    const write = args.includes('--write');
    const file = path.resolve(args.find(a => !a.startsWith('--')) || 'data/edits.json');
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) { console.error(`${file} is not a list of edits.`); process.exit(1); }

    const { edits, changed, keptByHand, alreadyClean } = cleanEdits(data);
    console.log(`${data.length} edits in ${path.relative(process.cwd(), file)}: ${changed.length} to clean, ${alreadyClean} already clean, ${keptByHand} with a shortTitle you wrote by hand (kept).\n`);
    for (const c of changed.slice(0, 40)) console.log(`  ${c.before.slice(0, 100)}\n  -> ${c.after}\n`);
    if (changed.length > 40) console.log(`  ... and ${changed.length - 40} more\n`);

    if (!changed.length) { console.log('Nothing to do.'); return; }
    if (!write) { console.log('Dry run: nothing written. Add --write to save.'); return; }

    const indent = 2, tail = raw.endsWith('\n') ? '\n' : '';
    const untouched = JSON.stringify(data, null, indent) + tail;
    if (untouched !== raw) {
        console.error('Refusing to write: saving would reformat the whole file, not just the titles. (Nothing was changed.)');
        process.exit(1);
    }
    fs.writeFileSync(file, JSON.stringify(edits, null, indent) + tail);
    console.log(`Saved ${changed.length} cleaned titles. Review with: git diff data/edits.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
