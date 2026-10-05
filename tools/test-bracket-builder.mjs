// Offline tests for js/bracket-builder.js.   Run:  node tools/test-bracket-builder.mjs
import assert from 'node:assert/strict';
import { selectEntries, buildMatches, buildTournamentDoc, drawEntries, isPowerOfTwo, isValidBracketSize, roundLabel, BRACKET_SIZES } from '../js/bracket-builder.js';

const CUP = 'jinx-cup-1';
const mk = (n, extra = {}) => ({
    id: `vid${String(n).padStart(8, '0')}`, videoId: `vid${String(n).padStart(8, '0')}`,
    title: `Jinx edit ${n}`, shortTitle: `Edit ${n}`, slug: `edit-${n}`,
    artist: `Creator ${n}`, channelId: `chan${n}`, creatorUrl: `https://www.youtube.com/channel/chan${n}`,
    year: 2026, status: 'ok', embedAllowed: true, flags: [], tournaments: [CUP], ...extra
});
const edits = size => Array.from({ length: size }, (_, i) => mk(i + 1));
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

test('16 valid edits -> 15 matches over 4 rounds (8/4/2/1)', () => {
    const { entries, errors } = selectEntries(edits(16), CUP, 16);
    assert.deepEqual(errors, []);
    const m = buildMatches({ cupId: CUP, cupName: 'Jinx Cup 1', entries, drawSeed: 's1' });
    assert.equal(m.length, 15);
    const per = r => m.filter(x => x.round === r).length;
    assert.deepEqual([1, 2, 3, 4].map(per), [8, 4, 2, 1]);
});

test('every entry appears exactly once in round 1; no entry meets itself', () => {
    const { entries } = selectEntries(edits(16), CUP, 16);
    const r1 = buildMatches({ cupId: CUP, cupName: 'x', entries, drawSeed: 's1' }).filter(x => x.round === 1);
    const ids = r1.flatMap(x => [x.song1.id, x.song2.id]);
    assert.equal(new Set(ids).size, 16);
    assert.ok(r1.every(x => x.song1.id !== x.song2.id));
});

test('same seed + same entries = same draw, whatever the file order', () => {
    const a = edits(16), b = [...a].reverse();
    const da = drawEntries(a, 'seed-A').map(e => e.videoId), db = drawEntries(b, 'seed-A').map(e => e.videoId);
    assert.deepEqual(da, db);
});

test('a different seed gives a different draw', () => {
    const a = drawEntries(edits(16), 'seed-A').map(e => e.videoId).join();
    const b = drawEntries(edits(16), 'seed-B').map(e => e.videoId).join();
    assert.notEqual(a, b);
});

test('match ids are unique, carry the cup id, and the last round is <cup>-finals', () => {
    const { entries } = selectEntries(edits(16), CUP, 16);
    const m = buildMatches({ cupId: CUP, cupName: 'x', entries, drawSeed: 's' });
    assert.equal(new Set(m.map(x => x.matchId)).size, 15);
    assert.ok(m.every(x => x.matchId.startsWith(CUP + '-') && x.tournament === CUP));
    assert.equal(m.filter(x => x.round === 4)[0].matchId, 'jinx-cup-1-finals');
});

test('competitors have seed null and a drawPosition; placeholders are TBD', () => {
    const { entries } = selectEntries(edits(16), CUP, 16);
    const m = buildMatches({ cupId: CUP, cupName: 'x', entries, drawSeed: 's' });
    assert.ok(m.filter(x => x.round === 1).every(x => x.song1.seed === null && x.song2.seed === null && x.song1.drawPosition >= 1));
    assert.ok(m.filter(x => x.round > 1).every(x => x.song1.id === 'TBD' && x.song2.id === 'TBD'));
});

test('batches: round 1 = 2 batches of 4; later rounds = 1 batch', () => {
    const { entries } = selectEntries(edits(16), CUP, 16);
    const m = buildMatches({ cupId: CUP, cupName: 'x', entries, drawSeed: 's' });
    const b = r => [...new Set(m.filter(x => x.round === r).map(x => x.batch))];
    assert.deepEqual([1, 2, 3, 4].map(b), [[1, 2], [1], [1], [1]]);
});

test('advancement: simulating the admin sourceMatch logic fills every slot and crowns one winner', () => {
    const { entries } = selectEntries(edits(16), CUP, 16);
    const m = buildMatches({ cupId: CUP, cupName: 'x', entries, drawSeed: 'sim' });
    const byId = new Map(m.map(x => [x.matchId, x]));
    // every sourceMatch exists and is used exactly once
    const sources = m.flatMap(x => [x.song1.sourceMatch, x.song2.sourceMatch]).filter(Boolean);
    assert.equal(new Set(sources).size, sources.length);
    assert.ok(sources.every(s => byId.has(s)));
    // play it through the way admin.js advanceWinnerToNextRound does (song1 always wins)
    let champion = null;
    for (let r = 1; r <= 4; r++) {
        for (const match of m.filter(x => x.round === r)) {
            assert.notEqual(match.song1.id, 'TBD'); assert.notEqual(match.song2.id, 'TBD');
            const winner = match.song1;
            const next = m.find(x => x.round === r + 1 && (x.song1.sourceMatch === match.matchId || x.song2.sourceMatch === match.matchId));
            if (!next) { champion = winner; continue; }
            const slot = next.song1.sourceMatch === match.matchId ? 'song1' : 'song2';
            next[slot] = { ...winner, votes: 0, sourceMatch: match.matchId };
        }
    }
    assert.ok(champion && champion.id !== 'TBD');
});

test('size 32 -> 31 matches, 5 rounds; size 8 -> 7 matches, 3 rounds', () => {
    for (const [size, rounds] of [[32, 5], [8, 3]]) {
        const { entries, errors } = selectEntries(edits(size), CUP, size);
        assert.deepEqual(errors, []);
        const m = buildMatches({ cupId: CUP, cupName: 'x', entries, drawSeed: 's' });
        assert.equal(m.length, size - 1);
        assert.equal(Math.max(...m.map(x => x.round)), rounds);
    }
});

test('tournament doc carries the draw seed and entry list', () => {
    const { entries } = selectEntries(edits(16), CUP, 16);
    const t = buildTournamentDoc({ cupId: CUP, cupName: 'Jinx Cup 1', size: 16, drawSeed: 'abc', entries });
    assert.equal(t.drawSeed, 'abc'); assert.equal(t.totalMatches, 15); assert.equal(t.entryVideoIds.length, 16);
});

// ---- validation ----
const errs = (list, size = 16) => selectEntries(list, CUP, size).errors.join('\n');

test('15 entries are rejected with a clear count', () => assert.match(errs(edits(15)), /has 15 edits but the bracket needs exactly 16/));
test('17 entries are rejected', () => assert.match(errs(edits(17)), /has 17 edits/));
test('edits not entered in this cup are ignored', () => {
    const l = [...edits(16), mk(99, { tournaments: ['vi-cup-1'] })];
    assert.deepEqual(selectEntries(l, CUP, 16).errors, []);
});
test('one entry per creator is enforced', () => {
    const l = edits(16); l[5] = mk(6, { channelId: 'chan1', artist: 'Creator 1' });
    assert.match(errs(l), /One entry per creator/);
});
test('status "review" is blocked and the flags are shown', () => {
    const l = edits(16); l[3] = mk(4, { status: 'review', flags: ['long: 4m10s'] });
    assert.match(errs(l), /status is "review".*long: 4m10s/);
});
test('embedding disabled is blocked', () => {
    const l = edits(16); l[2] = mk(3, { embedAllowed: false });
    assert.match(errs(l), /embedding is disabled/);
});
test('the same video listed twice is blocked', () => {
    const l = edits(16); l[7] = { ...l[0], channelId: 'other', artist: 'Other' };
    assert.match(errs(l), /listed twice/);
});
test('non power-of-two size is rejected', () => {
    assert.match(errs(edits(12), 12), /Bracket size must be one of 2, 4, 8, 16, 32, 64, 128\. Got 12/);
    assert.ok(!isPowerOfTwo(12) && isPowerOfTwo(16));
});

// ---------- any size: 2, 4, 8, 16, 32, 64, 128 ----------
const play = (matches, cup) => {   // song1 always wins; mirrors admin.js advanceWinnerToNextRound (round + 1, sourceMatch)
    const byId = new Map(matches.map(m => [m.matchId, m]));
    const maxRound = Math.max(...matches.map(m => m.round));
    let champion = null;
    for (let r = 1; r <= maxRound; r++) {
        for (const m of matches.filter(x => x.round === r)) {
            assert.notEqual(m.song1.id, 'TBD', `${m.matchId} song1 unfilled`);
            assert.notEqual(m.song2.id, 'TBD', `${m.matchId} song2 unfilled`);
            const winner = m.song1;
            for (const n of matches.filter(x => x.round === r + 1)) {
                if (n.song1.sourceMatch === m.matchId) n.song1 = { ...winner, sourceMatch: m.matchId };
                if (n.song2.sourceMatch === m.matchId) n.song2 = { ...winner, sourceMatch: m.matchId };
            }
            if (r === maxRound) champion = winner;
        }
    }
    return champion;
};

test('every supported size builds a correct bracket and can be played to a champion', () => {
    for (const size of BRACKET_SIZES) {
        const sel = selectEntries(edits(size), CUP);          // size inferred from the entry list
        assert.deepEqual(sel.errors, [], `size ${size}`);
        assert.equal(sel.size, size);
        const m = buildMatches({ cupId: CUP, cupName: 'x', entries: sel.entries, drawSeed: 'seed' });
        const rounds = Math.log2(size);
        assert.equal(m.length, size - 1, `match count ${size}`);
        assert.equal(Math.max(...m.map(x => x.round)), rounds);
        assert.equal(new Set(m.map(x => x.matchId)).size, size - 1, `unique ids ${size}`);
        assert.equal(m.filter(x => x.matchId === `${CUP}-finals`).length, 1);
        assert.equal(m.find(x => x.round === rounds).matchId, `${CUP}-finals`);
        for (let r = 1; r <= rounds; r++) assert.equal(m.filter(x => x.round === r).length, size / 2 ** r);
        // round 1: every entry exactly once
        const r1 = m.filter(x => x.round === 1).flatMap(x => [x.song1.id, x.song2.id]);
        assert.equal(new Set(r1).size, size);
        assert.ok(play(m, CUP) && true);
    }
});

test('size 2 is a single match: the final, in batch 1', () => {
    const { entries } = selectEntries(edits(2), CUP);
    const m = buildMatches({ cupId: CUP, cupName: 'x', entries, drawSeed: 's' });
    assert.equal(m.length, 1);
    assert.equal(m[0].matchId, `${CUP}-finals`);
    assert.equal(m[0].roundLabel, 'Final');
    assert.equal(m[0].batch, 1);
    assert.notEqual(m[0].song1.id, m[0].song2.id);
});

test('round labels: Final, Semi-finals, Quarter-finals, then Round of N', () => {
    assert.deepEqual([1, 2, 3, 4].map(r => roundLabel(r, 4)), ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']);
    assert.deepEqual([1, 2, 3].map(r => roundLabel(r, 3)), ['Quarter-finals', 'Semi-finals', 'Final']);
    assert.deepEqual([1, 2].map(r => roundLabel(r, 2)), ['Semi-finals', 'Final']);
    assert.equal(roundLabel(1, 7), 'Round of 128');
    assert.equal(roundLabel(2, 7), 'Round of 64');
});

test('every size fits one atomic Firestore batch (500 ops max)', () => {
    for (const size of BRACKET_SIZES) assert.ok(size - 1 + 1 <= 500);
});

test('size is inferred from the entry count; the same draw comes back for the same seed at every size', () => {
    for (const size of [4, 32, 128]) {
        const a = buildMatches({ cupId: CUP, cupName: 'x', entries: selectEntries(edits(size), CUP).entries, drawSeed: 'z' });
        const b = buildMatches({ cupId: CUP, cupName: 'x', entries: selectEntries([...edits(size)].reverse(), CUP).entries, drawSeed: 'z' });
        assert.deepEqual(a.filter(x => x.round === 1).map(x => x.song1.id), b.filter(x => x.round === 1).map(x => x.song1.id));
    }
});

test('a bad entry count says how many to add or remove', () => {
    assert.match(errs(edits(12), null), /12 edits entered.*add 4 to reach 16, or remove 4 to drop to 8/);
    assert.match(errs(edits(3), null), /add 1 to reach 4, or remove 1 to drop to 2/);
    assert.match(errs(edits(1), null), /add 1 to reach 2/);
    assert.match(errs(edits(129), null), /more than the 128 maximum: remove 1/);
    assert.match(errs([], null), /No edits are entered yet/);
    assert.equal(selectEntries(edits(12), CUP).size, null);
});

test('sizes outside 2-128 are rejected even when explicit', () => {
    assert.ok(!isValidBracketSize(1) && !isValidBracketSize(256) && !isValidBracketSize(0) && isValidBracketSize(128) && isValidBracketSize(2));
    assert.match(errs(edits(2), 256), /Got 256/);
});

test('a reset at the stored size refuses a changed entry list instead of rebuilding a different cup', () => {
    // cup was built at 16; the list now has 17 -> an explicit size 16 must fail
    assert.match(errs(edits(17), 16), /has 17 edits but the bracket needs exactly 16/);
    // and with the right 16 it passes
    assert.deepEqual(selectEntries(edits(16), CUP, 16).errors, []);
});

console.log(`\n${passed} tests passed`);
