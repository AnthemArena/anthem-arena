#!/usr/bin/env node
// Preview (or audit) a cup's draw without touching Firebase.
//   node tools/bracket-preview.mjs jinx-cup-1                      (16, new random seed)
//   node tools/bracket-preview.mjs jinx-cup-1 --seed my-seed       (re-run a published draw)
//   node tools/bracket-preview.mjs jinx-cup-1 --size 32 --file data/edits.json
import fs from 'node:fs';
import { selectEntries, buildMatches, makeDrawSeed, cupDisplayName, describePairings, roundLabel } from '../js/bracket-builder.js';

const args = process.argv.slice(2);
const take = flag => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : null; };
const size = Number(take('--size') || 16), seedArg = take('--seed'), file = take('--file') || 'data/edits.json';
const cupId = args[0];
if (!cupId) { console.error('Usage: node tools/bracket-preview.mjs <cup-id> [--size 16] [--seed <draw seed>] [--file data/edits.json]'); process.exit(1); }

const edits = JSON.parse(fs.readFileSync(file, 'utf8'));
const { entries, errors } = selectEntries(edits, cupId, size);
if (errors.length) { console.error(`\nCannot build ${cupId}:\n  - ${errors.join('\n  - ')}\n`); process.exit(1); }

const drawSeed = seedArg || makeDrawSeed(cupId);
const matches = buildMatches({ cupId, cupName: cupDisplayName(cupId), entries, drawSeed });
const rounds = Math.max(...matches.map(m => m.round));
console.log(`\n${cupDisplayName(cupId)}: ${size} edits, ${matches.length} matches, ${rounds} rounds\nDraw seed: ${drawSeed}\n\n${roundLabel(1, rounds)}:`);
console.log(describePairings(matches).map(l => '  ' + l).join('\n') + '\n');
