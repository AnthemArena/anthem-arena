// The champion on the live and brackets pages: which situation, which line, and that the Jinx lines are well formed.
//   node tools/test-champion-says.mjs
import fs from 'node:fs';
import { pickLiveState, pickBracketsState, formatLeft, chooseSay, saysFor, SAY_STATES } from '../js/champion-says.js';
let failed = 0;
const check = (name, ok, got) => { console.log((ok ? '  ok  ' : 'FAIL  ') + name + (ok ? '' : '   got: ' + JSON.stringify(got))); if (!ok) failed++; };
const H = 3600 * 1000;

check('no live matches -> live-none', pickLiveState({ live: 0, unvoted: 0, voted: 0 }) === 'live-none');
check('voted in everything -> live-done', pickLiveState({ live: 6, unvoted: 0, voted: 6 }) === 'live-done');
check('voted nothing yet -> live-fresh', pickLiveState({ live: 6, unvoted: 6, voted: 0 }) === 'live-fresh');
check('some voted, many left -> live-some', pickLiveState({ live: 6, unvoted: 4, voted: 2 }) === 'live-some');
check('two or three left -> live-few', pickLiveState({ live: 6, unvoted: 3, voted: 3 }) === 'live-few' && pickLiveState({ live: 6, unvoted: 2, voted: 4 }) === 'live-few');
check('one left -> live-one', pickLiveState({ live: 6, unvoted: 1, voted: 5 }) === 'live-one');
check('a deadline within 6 hours beats the counts (but only while something is unvoted)', pickLiveState({ live: 6, unvoted: 4, voted: 2, msLeft: 5 * H }) === 'live-closing' && pickLiveState({ live: 6, unvoted: 0, voted: 6, msLeft: 1 * H }) === 'live-done');
check('a deadline 7 hours away is not "closing"', pickLiveState({ live: 6, unvoted: 4, voted: 2, msLeft: 7 * H }) === 'live-some');
check('an expired deadline is ignored', pickLiveState({ live: 6, unvoted: 4, voted: 2, msLeft: -1 }) === 'live-some');

check('empty bracket -> brackets-empty', pickBracketsState({ empty: true }) === 'brackets-empty');
check('a finished cup -> brackets-complete', pickBracketsState({ finished: true, isGroupCup: true, knockoutBuilt: true, stage: 'knockout' }) === 'brackets-complete');
check('group cup, groups tab -> brackets-groups', pickBracketsState({ isGroupCup: true, knockoutBuilt: false, stage: 'groups' }) === 'brackets-groups');
check('group cup, knockout tab, not built -> brackets-knockout-soon', pickBracketsState({ isGroupCup: true, knockoutBuilt: false, stage: 'knockout' }) === 'brackets-knockout-soon');
check('group cup, knockout built, knockout tab -> brackets-knockout-live', pickBracketsState({ isGroupCup: true, knockoutBuilt: true, stage: 'knockout' }) === 'brackets-knockout-live');
check('single elimination -> brackets-bracket', pickBracketsState({ isGroupCup: false }) === 'brackets-bracket');

check('formatLeft: minutes, hours, days', formatLeft(45 * 60000) === '45m' && formatLeft(2 * H + 10 * 60000) === '2h 10m' && formatLeft(3 * H) === '3h' && formatLeft(26 * H) === '1d 2h' && formatLeft(0) === '0m');

const jinx = JSON.parse(fs.readFileSync(new URL('../champion-packs/jinx.json', import.meta.url)));
check('Jinx has at least two lines for every state', SAY_STATES.every(s => (jinx.pages?.[s] || []).length >= 2), SAY_STATES.filter(s => (jinx.pages?.[s] || []).length < 2));
const vars = { unvoted: 4, voted: 2, live: 6, timeLeft: '3h' };
check('no Jinx line leaves a placeholder behind', SAY_STATES.every(s => jinx.pages[s].every((_, i) => !/[{}]/.test(chooseSay({ pages: { [s]: [jinx.pages[s][i]] } }, s, vars, 'x')))));
check('only known placeholders are used', SAY_STATES.every(s => jinx.pages[s].every(l => [...l.matchAll(/\{(\w+)\}/g)].every(m => ['unvoted', 'voted', 'live', 'timeLeft'].includes(m[1])))));
check('lines about the live clock only appear in the closing state', SAY_STATES.filter(s => s !== 'live-closing').every(s => jinx.pages[s].every(l => !l.includes('{timeLeft}'))));
check('the lines never mention percentages or who is ahead', SAY_STATES.every(s => jinx.pages[s].every(l => !/%|ahead|behind|winning|losing/i.test(l))));
check('a pack without "pages" falls back to plain lines for every state', SAY_STATES.every(s => chooseSay({}, s, vars, 'x').length > 0));
check('the same state and seed give the same line; a tap moves on', chooseSay(jinx, 'live-some', vars, 'live') === chooseSay(jinx, 'live-some', vars, 'live') && chooseSay(jinx, 'live-some', vars, 'live', 1) !== chooseSay(jinx, 'live-some', vars, 'live', 0));
check('saysFor returns the pack lines when present', saysFor(jinx, 'live-one') === jinx.pages['live-one']);
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
