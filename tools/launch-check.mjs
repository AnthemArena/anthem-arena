#!/usr/bin/env node
// Read-only pre-launch check for a cup. Writes nothing.   npm run launch -- jinx-cup-1     (or: node tools/launch-check.mjs jinx-cup-1)
// Checks: the cup id is valid; how many edits are entered and whether that is a valid group-stage size; every entry has what a
// match needs (the same checks the cup builder runs); and which cup the four "active cup" places say right now.
// It cannot see the rules published in the Firebase console: the last line reminds you.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect, isValidCupId } from './switch-cup.mjs';
import { selectGroupEntries, groupCountFor, qualifierCountFor } from '../js/group-builder.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cupId = process.argv[2];
if (!cupId) { console.error('Usage: npm run launch -- <cup-id>'); process.exit(1); }

let bad = 0;
const line = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) bad++; };
const info = msg => console.log(`      ${msg}`);

line(isValidCupId(cupId), `"${cupId}" is a valid cup id`);

const edits = JSON.parse(fs.readFileSync(path.join(root, 'data/edits.json'), 'utf8'));
const sel = selectGroupEntries(edits, cupId);
line(sel.errors.length === 0, `${sel.entries.length} edits entered in ${cupId}${sel.size ? ` (${sel.size}: ${groupCountFor(sel.size)} groups, ${qualifierCountFor(sel.size)} go to the knockout)` : ''}`);
for (const e of sel.errors) info(e);
for (const n of sel.notes || []) info('note: ' + n);

const noEmbed = sel.entries.filter(e => e.embedAllowed === false || e.status !== 'ok');
line(noEmbed.length === 0, `every entry can be played (status ok, embedding allowed)`);
for (const e of noEmbed.slice(0, 10)) info(`${e.videoId}  ${e.shortTitle || e.title}`);

const noAspect = sel.entries.filter(e => !e.aspect || e.aspectCheck);
line(noAspect.length === 0, `every entry has a checked picture shape`);
for (const e of noAspect.slice(0, 10)) info(`${e.videoId}  aspect: ${e.aspect || 'missing'}${e.aspectCheck ? ' (needs a look)' : ''}`);

const { rows, problems } = inspect(root);
line(problems.length === 0, 'the four active-cup places can be read');
for (const p of problems) info(p);
const now = [...new Set(rows.map(r => r.current))];
line(now.length === 1, `the four places agree (${now.join(' vs ')})`);
if (now.length === 1 && now[0] !== cupId) info(`they say ${now[0]}. To switch: node tools/switch-cup.mjs ${cupId} --dry-run, then without --dry-run`);
if (now.length === 1 && now[0] === cupId) info('already active');

console.log(`\nStill yours to check (this tool cannot see it): the rules published in the Firebase console must say "${cupId}".`);
console.log(bad ? `\n${bad} problem(s) above.\n` : '\nAll checks passed.\n');
process.exit(bad ? 1 : 0);
