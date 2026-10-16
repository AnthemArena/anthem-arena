// Gallery badge wording and group-cup logic.   node tools/test-edit-standing.mjs
import assert from 'node:assert/strict';
import { standingFor, reachedLabel } from '../js/edit-standing.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

const song = (id, votes = 0) => ({ id, votes });
const gm = (n, a, b, winner, va, vb) => ({
    matchId: `c-group-A-match-${n}`, stage: 'group', group: 'A', groupIndex: 1, round: 1, roundLabel: 'Group A',
    status: winner ? 'completed' : 'upcoming', winnerId: winner || null, song1: song(a, va), song2: song(b, vb)
});
// group A: a beats b, c, d; b beats c, d; c beats d  -> a, b through; c, d out
const fullGroup = () => [gm(1, 'a', 'b', 'a', 9, 1), gm(2, 'c', 'd', 'c', 5, 4), gm(3, 'a', 'c', 'a', 8, 2), gm(4, 'b', 'd', 'b', 7, 3), gm(5, 'a', 'd', 'a', 6, 4), gm(6, 'b', 'c', 'b', 6, 5)];

test('an edit that is not in any match is just "Entered"', () => {
    assert.equal(standingFor({ id: 'z' }, fullGroup()).label, 'Entered');
});

test('REGRESSION: one lost group match does not make an edit "out" while its group is still open', () => {
    const open = fullGroup().map((m, i) => i >= 3 ? { ...m, status: 'upcoming', winnerId: null } : m);   // only 3 of 6 played
    const s = standingFor({ id: 'c' }, open);        // c lost to a, beat d: not out yet
    assert.notEqual(s.kind, 'eliminated');
    assert.equal(s.label, 'Group A');
});

test('finished group: top two are "Through to the knockout", the rest "Group stage" (no "Out in")', () => {
    const m = fullGroup();
    assert.equal(standingFor({ id: 'a' }, m).label, 'Through to the knockout');
    assert.equal(standingFor({ id: 'b' }, m).label, 'Through to the knockout');
    assert.equal(standingFor({ id: 'c' }, m).label, 'Group stage');
    assert.equal(standingFor({ id: 'd' }, m).kind, 'eliminated');
    assert.ok(!/out/i.test(standingFor({ id: 'd' }, m).label));
});

test('a 2-1 edit in a finished group is through, not out (the case seen on the real gallery)', () => {
    const s = standingFor({ id: 'b' }, fullGroup());
    assert.equal(s.wins, 2); assert.equal(s.losses, 1); assert.equal(s.kind, 'bracket');
});

test('knockout: a loss names the round reached, in progress words', () => {
    const ko = (round, label, winner) => ({ matchId: `c-r${round}`, stage: 'knockout', round, roundLabel: label, status: 'completed', winnerId: winner, song1: song('a'), song2: song('x') });
    const base = fullGroup();
    assert.equal(standingFor({ id: 'a' }, [...base, ko(2, 'Round of 16', 'x')]).label, 'Reached the Round of 16');
    assert.equal(standingFor({ id: 'a' }, [...base, ko(2, 'Round of 16', 'a'), ko(3, 'Quarter-finals', 'x')]).label, 'Quarter-finalist');
    assert.equal(standingFor({ id: 'a' }, [...base, ko(2, 'Semi-finals', 'x')]).label, 'Semi-finalist');
    assert.equal(standingFor({ id: 'a' }, [...base, { ...ko(9, 'Final', 'x'), matchId: 'c-finals' }]).label, 'Finalist');
});

test('winning the final is "Champion"; an edit still alive in the knockout is "In the knockout"', () => {
    const base = fullGroup();
    const fin = { matchId: 'c-finals', stage: 'knockout', round: 9, roundLabel: 'Final', status: 'completed', winnerId: 'a', song1: song('a'), song2: song('x') };
    assert.equal(standingFor({ id: 'a' }, [...base, fin]).kind, 'champion');
    const r2 = { matchId: 'c-r2', stage: 'knockout', round: 2, roundLabel: 'Round of 16', status: 'upcoming', winnerId: null, song1: song('a'), song2: song('x') };
    assert.equal(standingFor({ id: 'a' }, [...base, r2]).label, 'In the knockout');
});

test('a live match shows "Live now" with the match to vote in', () => {
    const live = { ...gm(1, 'p', 'q'), status: 'live' };
    const s = standingFor({ id: 'p' }, [live]);
    assert.equal(s.kind, 'live'); assert.equal(s.liveMatch, live);
});

test('a plain knockout cup (no groups): one loss ends the run, worded as progress', () => {
    const m = { matchId: 'c-r1', round: 1, roundLabel: 'Round of 32', status: 'completed', winnerId: 'x', song1: song('a'), song2: song('x') };
    assert.equal(standingFor({ id: 'a' }, [m]).label, 'Reached the Round of 32');
    assert.equal(standingFor({ id: 'x' }, [m]).label, 'In the bracket');
});

test('no label says "Out", "Eliminated" or shows a record', () => {
    for (const l of ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final', '', 'Round of 128']) assert.ok(!/out|elimin|\d\s*[-–]\s*\d/i.test(reachedLabel(l)), l);
});

console.log(`\n${passed} tests passed`);
