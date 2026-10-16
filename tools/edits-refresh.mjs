#!/usr/bin/env node
// After adding links to data/edit-urls.txt: import them, work out their picture shape, and clean their titles, in one go.
//   export YOUTUBE_API_KEY=your_key_here          (do NOT commit the key)
//   npm run edits                                 (or: node tools/edits-refresh.mjs)
// Runs, in order and stopping at the first problem:  edits-import.js, edits-aspect.js, edits-clean-titles.mjs --write
// Afterwards: look at `git diff data/edits.json` (new entries at the end; nothing you fixed by hand should have changed).
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.YOUTUBE_API_KEY) {
    console.error('\nYOUTUBE_API_KEY is not set. Run:   export YOUTUBE_API_KEY=your_key_here   then try again.\n');
    process.exit(1);
}
const steps = [
    ['1/3  import new links', ['tools/edits-import.js']],
    ['2/3  picture shape (aspect)', ['tools/edits-aspect.js']],
    ['3/3  clean titles', ['tools/edits-clean-titles.mjs', '--write']]
];
for (const [label, args] of steps) {
    console.log(`\n=== ${label} ===`);
    const r = spawnSync('node', args, { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) { console.error(`\nStopped: "${label}" failed. Nothing after it was run.\n`); process.exit(r.status || 1); }
}
console.log('\nDone. Next: git diff data/edits.json, then  npm run launch -- <cup-id>  when a cup is ready.\n');
