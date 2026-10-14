// Offline tests for js/group-builder.js.   Run:  node tools/test-group-builder.mjs
import assert from 'node:assert/strict';
import {
    GROUP_STAGE_SIZES, isValidGroupStageSize, groupName, selectGroupEntries, seedEntries, drawGroups, groupNotes,
    buildGroupStage, buildGroupTournamentDoc, groupStandings, allGroupStandings, knockoutPairs, buildKnockoutMatches,
    totalRoundsFor, qualifierCountFor, applySeedingSnapshot, planGroupBuild, planKnockoutBuild
} from '../js/group-builder.js';

const CUP = 'jinx-cup-1';
const mk = (n, extra = {}) => ({
    id: `vid${String(n).padStart(8, '0')}`, videoId: `vid${String(n).padStart(8, '0')}`,
    title: `Jinx edit ${n}`, shortTitle: `Edit ${n}`, slug: `edit-${n}`, artist: `Creator ${n}`, channelId: `chan${n}`,
    year: 2026, status: 'ok', embedAllowed: true, flags: [], tournaments: [CUP],
    views: 1_000_000 - n * 1000, likes: 50_000 - n * 40, ...extra
});
const edits = size => Array.from({ length: size }, (_, i) => mk(i + 1));
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

test('valid sizes are 8..256 (groups of 4, power-of-two groups)', () => {
    assert.deepEqual(GROUP_STAGE_SIZES, [8, 16, 32, 64, 128, 256]);
    for (const n of [0, 4, 12, 20, 100, 129, 512]) assert.ok(!isValidGroupStageSize(n), String(n));
    assert.equal(totalRoundsFor(16), 4);     // group stage + QF, SF, F
    assert.equal(totalRoundsFor(128), 7);    // group stage + 6 knockout rounds
    assert.equal(qualifierCountFor(128), 64);
});

test('group names run A..Z then AA, AB...', () => {
    assert.equal(groupName(0), 'A'); assert.equal(groupName(25), 'Z'); assert.equal(groupName(26), 'AA');
    assert.equal(groupName(27), 'AB'); assert.equal(groupName(63), 'BL');
    assert.equal(new Set(Array.from({ length: 64 }, (_, i) => groupName(i))).size, 64);
});

test('selectGroupEntries: size errors, shared per-edit checks, notes', () => {
    assert.deepEqual(selectGroupEntries(edits(16), CUP).errors, []);
    assert.match(selectGroupEntries(edits(12), CUP).errors[0], /needs exactly 8, 16, 32, 64, 128, 256\. You can add 4 to reach 16, or remove 4 to drop to 8/);
    assert.match(selectGroupEntries(edits(10), CUP, 16).errors.join(' '), /needs exactly 16/);
    const bad = edits(16); bad[3].status = 'review'; bad[4].embedAllowed = false;
    assert.equal(selectGroupEntries(bad, CUP).errors.length, 2);
    const dup = edits(16); dup[1].channelId = dup[0].channelId;
    const r = selectGroupEntries(dup, CUP); assert.deepEqual(r.errors, []); assert.match(r.notes[0], /has 2 edits/);
});

test('seeding: average of views rank and likes rank, views break ties', () => {
    const e = [mk(1, { views: 100, likes: 5 }), mk(2, { views: 90, likes: 50 }), mk(3, { views: 80, likes: 40 }), mk(4, { views: 10, likes: 1 })];
    const s = seedEntries(e);
    // views ranks 1,2,3,4; likes ranks 3,1,2,4 -> scores 2, 1.5, 2.5, 4
    assert.deepEqual(s.map(x => x.entry.videoId), [e[1].videoId, e[0].videoId, e[2].videoId, e[3].videoId]);
    assert.deepEqual(s.map(x => x.seedRank), [1, 2, 3, 4]);
});

test('seeding: hidden likes are estimated, not treated as zero', () => {
    const e = [mk(1, { views: 1000, likes: 100 }), mk(2, { views: 900, likes: 90 }), mk(3, { views: 800, likes: null }), mk(4, { views: 100, likes: 10 })];
    const s = seedEntries(e), hidden = s.find(x => x.entry === e[2]);
    assert.equal(hidden.likesEstimated, true);
    assert.equal(hidden.seedRank, 3);                       // would be 4th if hidden likes counted as 0
    assert.ok(s.filter(x => x !== hidden).every(x => !x.likesEstimated));
});

for (const size of GROUP_STAGE_SIZES) {
    test(`${size} edits: every edit in exactly one group, one per pot, groups of 4`, () => {
        const groups = drawGroups(edits(size), 'seed-1'), G = size / 4;
        assert.equal(groups.length, G);
        assert.ok(groups.every(g => g.slots.length === 4));
        assert.deepEqual(groups.map(g => g.slots.map(s => s.pot)).flat().filter((_, i) => i % 4 === 0), Array(G).fill(1));
        assert.ok(groups.every(g => g.slots.map(s => s.pot).join() === '1,2,3,4'));
        assert.equal(new Set(groups.flatMap(g => g.slots.map(s => s.entry.videoId))).size, size);
        // pot k holds exactly seeds (k-1)G+1..kG
        for (const g of groups) g.slots.forEach(s => assert.ok(s.seedRank > (s.pot - 1) * G && s.seedRank <= s.pot * G));
        const dp = groups.flatMap(g => g.slots.map(s => s.drawPosition)).sort((a, b) => a - b);
        assert.deepEqual(dp, Array.from({ length: size }, (_, i) => i + 1));
    });
}

test('the draw is reproducible from the seed, and a different seed changes it', () => {
    const e = edits(32);
    const sig = seed => drawGroups(e, seed).map(g => g.slots.map(s => s.entry.videoId).join()).join('|');
    assert.equal(sig('abc'), sig('abc'));
    assert.notEqual(sig('abc'), sig('abd'));
    const shuffled = [...e].reverse();
    assert.equal(sig('abc'), drawGroups(shuffled, 'abc').map(g => g.slots.map(s => s.entry.videoId).join()).join('|'));   // input order does not matter
    assert.throws(() => drawGroups(e, ''), /seed is required/);
    assert.throws(() => drawGroups(edits(12), 'x'), /Cannot draw 12/);
});

test('the top seeds are spread: no two of the best G edits share a group', () => {
    const groups = drawGroups(edits(64), 's'), G = 16;
    for (const g of groups) assert.equal(g.slots.filter(s => s.seedRank <= G).length, 1);
});

test('creators with two edits in one group are noted, never blocked', () => {
    const e = edits(16); e[1].channelId = e[0].channelId; e[1].artist = e[0].artist;
    const groups = drawGroups(e, 's');
    assert.ok(Array.isArray(groupNotes(groups)));
    const forced = [{ name: 'A', index: 1, slots: [{ entry: e[0] }, { entry: e[1] }, { entry: e[2] }, { entry: e[3] }] }];
    assert.match(groupNotes(forced)[0], /Group A: "Creator 1" has 2 edits/);
});

test('group stage: 6 matches per group, every pair once, 3 per edit, one per matchday', () => {
    const { matches } = buildGroupStage({ cupId: CUP, cupName: 'Jinx Cup 1', entries: edits(16), drawSeed: 's' });
    assert.equal(matches.length, 24);
    for (const name of ['A', 'B', 'C', 'D']) {
        const gm = matches.filter(m => m.group === name);
        assert.equal(gm.length, 6);
        const pairs = new Set(gm.map(m => [m.song1.id, m.song2.id].sort().join('-')));
        assert.equal(pairs.size, 6);
        const ids = new Set(gm.flatMap(m => [m.song1.id, m.song2.id])); assert.equal(ids.size, 4);
        for (const id of ids) assert.equal(gm.filter(m => m.song1.id === id || m.song2.id === id).length, 3);
        for (const md of [1, 2, 3]) {
            const day = gm.filter(m => m.matchday === md).flatMap(m => [m.song1.id, m.song2.id]);
            assert.equal(new Set(day).size, 4);
        }
    }
});

test('group matches use the existing match shape: round 1, stage group, one batch per group', () => {
    const { matches } = buildGroupStage({ cupId: CUP, cupName: 'Jinx Cup 1', entries: edits(16), drawSeed: 's' });
    assert.ok(matches.every(m => m.round === 1 && m.stage === 'group' && m.status === 'upcoming' && m.winnerId === null && m.totalVotes === 0));
    assert.ok(matches.every(m => m.song1.votes === 0 && m.song2.votes === 0 && m.song1.id !== m.song2.id));
    assert.ok(matches.every(m => m.roundLabel === `Group ${m.group}` && m.batch === m.groupIndex));
    assert.equal(new Set(matches.map(m => m.matchId)).size, 24);
    assert.ok(matches.every(m => m.matchId.startsWith(`${CUP}-group-`)));
    assert.deepEqual(matches.map(m => m.matchNumber), Array.from({ length: 24 }, (_, i) => i + 1));
    assert.ok(matches.every(m => m.song1.seed >= 1 && m.song1.pot >= 1 && m.song1.group === m.group));
});

test('groupsPerBatch opens several groups together', () => {
    const { matches } = buildGroupStage({ cupId: CUP, cupName: 'x', entries: edits(32), drawSeed: 's', groupsPerBatch: 4 });
    assert.deepEqual([...new Set(matches.map(m => m.batch))], [1, 2]);
    assert.equal(matches.filter(m => m.batch === 1).length, 24);
});

test('size limits: 256 edits = 384 group matches + doc, inside one 500-write batch', () => {
    const { matches } = buildGroupStage({ cupId: CUP, cupName: 'x', entries: edits(256), drawSeed: 's' });
    assert.equal(matches.length, 384);
    assert.ok(matches.length + 1 <= 500);
    assert.equal(new Set(matches.map(m => m.matchId)).size, 384);
});

test('tournament doc: format, rounds, totals, seeding snapshot', () => {
    const e = edits(128), built = buildGroupStage({ cupId: CUP, cupName: 'Jinx Cup 1', entries: e, drawSeed: 's' });
    const doc = buildGroupTournamentDoc({ cupId: CUP, cupName: 'Jinx Cup 1', size: 128, drawSeed: 's', entries: e, seeding: built.seeding });
    assert.equal(doc.format, 'groups-knockout'); assert.equal(doc.stage, 'group');
    assert.equal(doc.totalRounds, 7); assert.equal(doc.totalMatches, 192 + 63);
    assert.equal(doc.groupStage.groups, 32); assert.equal(doc.groupStage.qualifiers, 64);
    assert.equal(doc.seeding.length, 128); assert.equal(doc.entryVideoIds.length, 128);
    assert.deepEqual(doc.seeding.map(s => s.seedRank), Array.from({ length: 128 }, (_, i) => i + 1));
});

// ---------- standings ----------
const complete = (m, v1, v2) => ({ ...m, status: 'completed', song1: { ...m.song1, votes: v1 }, song2: { ...m.song2, votes: v2 }, winnerId: v1 > v2 ? m.song1.id : m.song2.id });
const group16 = () => buildGroupStage({ cupId: CUP, cupName: 'x', entries: edits(16), drawSeed: 's' }).matches;

test('standings: wins first, then vote share, then total votes', () => {
    const gm = group16().filter(m => m.group === 'A');
    const ids = [...new Set(gm.flatMap(m => [m.song1.id, m.song2.id]))];
    const [w, x, y, z] = ids;
    // w beats everyone; x beats y and z; y beats z.
    const result = gm.map(m => {
        const pair = [m.song1.id, m.song2.id], rank = id => ids.indexOf(id);
        const win = rank(pair[0]) < rank(pair[1]) ? pair[0] : pair[1];
        return complete(m, win === m.song1.id ? 70 : 30, win === m.song1.id ? 30 : 70);
    });
    const st = groupStandings(result);
    assert.deepEqual(st.rows.map(r => r.id), [w, x, y, z]);
    assert.deepEqual(st.rows.map(r => r.wins), [3, 2, 1, 0]);
    assert.ok(st.complete && !st.unresolvedTie);
});

test('standings: equal wins are split by vote share, not by raw votes', () => {
    const gm = group16().filter(m => m.group === 'A');
    const [a, b, c, d] = [...new Set(gm.flatMap(m => [m.song1.id, m.song2.id]))];
    const M = (p, q) => gm.find(m => [m.song1.id, m.song2.id].sort().join() === [p, q].sort().join());
    // a, b, c each beat d; a beats b, b beats c, c beats a (a 3-way cycle -> 2 wins each)
    const res = [
        [a, b, 60, 40], [b, c, 55, 45], [c, a, 51, 49], [a, d, 90, 10], [b, d, 80, 20], [c, d, 100, 0]
    ].map(([p, q, vp, vq]) => { const m = M(p, q); return complete(m, m.song1.id === p ? vp : vq, m.song1.id === p ? vq : vp); });
    const st = groupStandings(res);
    // shares: a (60+49+90)/(100+100+100)=.663, b (40+55+80)/300=.583, c (45+51+100)... c: 45+51+100=196 for, against 55+49+0=104 -> .653
    assert.deepEqual(st.rows.slice(0, 3).map(r => r.id), [a, c, b]);
    assert.equal(st.rows[3].id, d);
    assert.ok(st.rows.slice(0, 3).every(r => r.wins === 2));
});

test('standings: an unfinished group is not complete and only counts finished matches', () => {
    const gm = group16().filter(m => m.group === 'A');
    const st = groupStandings([complete(gm[0], 60, 40), ...gm.slice(1)]);
    assert.equal(st.complete, false); assert.equal(st.rows.reduce((n, r) => n + r.played, 0), 2);
    assert.equal(groupStandings([]).complete, false);
});

test('standings: a true dead heat at the qualification line is flagged and ranked by draw position', () => {
    const gm = group16().filter(m => m.group === 'A');
    const [a, b, c, d] = [...new Set(gm.flatMap(m => [m.song1.id, m.song2.id]))];
    const M = (p, q) => gm.find(m => [m.song1.id, m.song2.id].sort().join() === [p, q].sort().join());
    // a beats everyone 60-40; b beats c, c beats d, d beats b, each 50-49: b, c and d are identical on wins, share and votes.
    const res = [[a, b, 60, 40], [a, c, 60, 40], [a, d, 60, 40], [b, c, 50, 49], [c, d, 50, 49], [d, b, 50, 49]]
        .map(([p, q, vp, vq]) => { const m = M(p, q); return complete(m, m.song1.id === p ? vp : vq, m.song1.id === p ? vq : vp); });
    const st = groupStandings(res);
    assert.equal(st.rows[0].id, a);
    assert.ok(st.rows.slice(1).every(r => r.wins === 1 && r.votesFor === 139));
    assert.equal(st.unresolvedTie, true);                                         // places 2 and 3 are level on everything
    const dp = st.rows.slice(1).map(r => r.drawPosition);
    assert.deepEqual(dp, [...dp].sort((x, y) => x - y));                           // last resort: lowest draw position first
    assert.ok(st.rows.every((r, i) => r.rank === i + 1));
});

test('standings: a decided qualification line is not flagged', () => {
    const gm = group16().filter(m => m.group === 'A');
    assert.equal(groupStandings(playAll(gm)).unresolvedTie, false);
});

// ---------- knockout ----------
function playAll(matches, winnerOf = (a, b) => (a.seed < b.seed ? a : b)) {
    return matches.map(m => { const w = winnerOf(m.song1, m.song2); return complete(m, w === m.song1 ? 60 : 40, w === m.song1 ? 40 : 60); });
}

test('knockout pairs: winner v runner-up of another group, never the same group', () => {
    const played = playAll(group16());
    const st = allGroupStandings(played);
    assert.equal(st.length, 4); assert.ok(st.every(g => g.complete));
    const pairs = knockoutPairs(st);
    assert.equal(pairs.length, 4);
    for (const [a, b] of pairs) {
        assert.notEqual(a.fromGroup, b.fromGroup);
        assert.ok(a.groupRank === 1 && b.groupRank === 2 || a.groupRank === 2 && b.groupRank === 1);
    }
    assert.deepEqual(pairs.map(([a, b]) => `${a.fromGroup}${a.groupRank}-${b.fromGroup}${b.groupRank}`), ['A1-B2', 'C1-D2', 'B1-A2', 'D1-C2']);
});

test('knockout: round numbering follows the group stage, with working sourceMatch links', () => {
    const st = allGroupStandings(playAll(group16()));
    const km = buildKnockoutMatches({ cupId: CUP, cupName: 'x', pairs: knockoutPairs(st), totalRounds: totalRoundsFor(16) });
    assert.equal(km.length, 7);
    assert.deepEqual([2, 3, 4].map(r => km.filter(m => m.round === r).length), [4, 2, 1]);
    assert.deepEqual([...new Set(km.map(m => m.roundLabel))], ['Quarter-finals', 'Semi-finals', 'Final']);
    assert.equal(km.at(-1).matchId, `${CUP}-finals`);
    assert.ok(km.every(m => m.stage === 'knockout'));
    const ids = new Set(km.map(m => m.matchId));
    for (const m of km.filter(m => m.round > 2)) {
        for (const s of [m.song1, m.song2]) assert.ok(ids.has(s.sourceMatch) && s.id === 'TBD');
        assert.equal(km.find(x => x.matchId === m.song1.sourceMatch).round, m.round - 1);
    }
    assert.ok(km.filter(m => m.round === 2).every(m => m.song1.votes === 0 && m.song2.votes === 0 && m.song1.sourceMatch === undefined));
});

test('knockout: edits from the same group pair only meet again as late as possible', () => {
    const st = allGroupStandings(playAll(buildGroupStage({ cupId: CUP, cupName: 'x', entries: edits(64), drawSeed: 's' }).matches));
    const pairs = knockoutPairs(st);
    assert.equal(pairs.length, 16);
    // round 2 of the knockout pairs matches (1,2),(3,4)...: the two feeders never come from the same group pair
    const pairOf = g => Math.floor((st.findIndex(x => x.name === g)) / 2);
    for (let i = 0; i < pairs.length; i += 2) {
        const left = new Set(pairs[i].map(c => pairOf(c.fromGroup))), right = new Set(pairs[i + 1].map(c => pairOf(c.fromGroup)));
        assert.ok([...left].every(g => !right.has(g)), `feeders ${i + 1} and ${i + 2} share a group pair`);
    }
});

test('128 entrants: 32 groups, 192 group matches, 64-edit knockout over rounds 2..7', () => {
    const gs = buildGroupStage({ cupId: CUP, cupName: 'x', entries: edits(128), drawSeed: 's' });
    assert.equal(gs.matches.length, 192);
    const st = allGroupStandings(playAll(gs.matches));
    const km = buildKnockoutMatches({ cupId: CUP, cupName: 'x', pairs: knockoutPairs(st), totalRounds: 7 });
    assert.equal(km.length, 63);
    assert.deepEqual([2, 3, 4, 5, 6, 7].map(r => km.filter(m => m.round === r).length), [32, 16, 8, 4, 2, 1]);
    assert.equal(km[0].roundLabel, 'Round of 64');
    assert.equal(gs.matches.length + km.length + 1 <= 500, true);
    const qual = km.filter(m => m.round === 2).flatMap(m => [m.song1.id, m.song2.id]);
    assert.equal(new Set(qual).size, 64);
});

test('8 entrants: 2 groups, 4 qualifiers, semi-finals and a final', () => {
    const st = allGroupStandings(playAll(buildGroupStage({ cupId: CUP, cupName: 'x', entries: edits(8), drawSeed: 's' }).matches));
    const km = buildKnockoutMatches({ cupId: CUP, cupName: 'x', pairs: knockoutPairs(st), totalRounds: totalRoundsFor(8) });
    assert.deepEqual(km.map(m => m.roundLabel), ['Semi-finals', 'Semi-finals', 'Final']);
    assert.deepEqual(knockoutPairs(st).map(([a, b]) => `${a.fromGroup}${a.groupRank}-${b.fromGroup}${b.groupRank}`), ['A1-B2', 'B1-A2']);
});

test('knockout builder rejects wrong totalRounds and odd group counts', () => {
    const st = allGroupStandings(playAll(group16()));
    assert.throws(() => buildKnockoutMatches({ cupId: CUP, cupName: 'x', pairs: knockoutPairs(st), totalRounds: 5 }), /totalRounds is 5/);
    assert.throws(() => knockoutPairs(st.slice(0, 3)), /even number of groups/);
});

// ---------- plans ----------
const planFor = (size, extra = {}) => planGroupBuild({ cupId: CUP, cupName: 'Jinx Cup 1', entries: edits(size), drawSeed: 'seed-x', ...extra });
const asDocs = (plan, played) => ({ tournament: { ...plan.tournament }, matches: played });

test('planGroupBuild: doc and matches line up', () => {
    const plan = planFor(16);
    assert.equal(plan.matches.length, 24); assert.equal(plan.tournament.totalMatches, 24 + 7);
    assert.equal(plan.tournament.groupStage.matches, 24); assert.equal(plan.lines.length, 4);
    assert.throws(() => planFor(16, { groupsPerBatch: 0 }), /whole number/);
});

test('a Reset rebuilds the SAME draw from the saved seeding even after views change', () => {
    const first = planFor(32);
    const later = edits(32).map((e, i) => ({ ...e, views: 5_000_000 - ((i * 7919) % 32) * 1000, likes: 1000 + ((i * 31) % 32) }));   // totally different stats now
    const drift = planGroupBuild({ cupId: CUP, cupName: 'x', entries: later, drawSeed: 'seed-x' });
    const same = planGroupBuild({ cupId: CUP, cupName: 'x', entries: later, drawSeed: 'seed-x', seedingSnapshot: first.tournament.seeding });
    const sig = p => p.matches.map(m => `${m.song1.id}-${m.song2.id}`).join();
    assert.notEqual(sig(drift), sig(first));            // without the snapshot the draw would move
    assert.equal(sig(same), sig(first));                // with it, it does not
    assert.deepEqual(same.tournament.seeding, first.tournament.seeding);
});

test('applySeedingSnapshot refuses a changed entry list', () => {
    const snap = planFor(16).tournament.seeding, e = edits(16); e[0] = mk(999);
    assert.throws(() => applySeedingSnapshot(e, snap), /does not cover 1 entered edit/);
});

const finish = (plan, upTo = Infinity) => plan.matches.map((m, i) => i < upTo ? playAll([m])[0] : m);

test('knockout plan: refuses a cup that is not a group cup, or one already built', () => {
    assert.match(planKnockoutBuild({ tournament: { format: 'single-elimination' }, matches: [] }).error, /not a group-stage cup/);
    assert.match(planKnockoutBuild({ tournament: null, matches: [] }).error, /not a group-stage cup/);
    const plan = planFor(16), played = finish(plan);
    assert.match(planKnockoutBuild({ tournament: { ...plan.tournament, groupStage: { ...plan.tournament.groupStage, knockoutBuilt: true } }, matches: played }).error, /already been built/);
    const k = planKnockoutBuild({ tournament: plan.tournament, matches: played });
    assert.match(planKnockoutBuild({ tournament: plan.tournament, matches: [...played, k.knockoutMatches[0]] }).error, /already been built/);
});

test('knockout plan: names the unfinished groups and refuses until every group is closed', () => {
    const plan = planFor(16), part = finish(plan, 20);     // groups A-C done (18 matches), D has 2 of 6
    const r = planKnockoutBuild({ tournament: plan.tournament, matches: part });
    assert.match(r.error, /1 group\(s\) are not finished: D \(2 of 6 matches closed\)/);
    assert.match(planKnockoutBuild({ tournament: plan.tournament, matches: part.slice(1) }).error, /Expected 24 group matches but found 23/);
});

test('knockout plan: a finished cup gives 8 qualifiers, QF matches, and the tournament update', () => {
    const plan = planFor(16), r = planKnockoutBuild({ tournament: plan.tournament, matches: finish(plan) });
    assert.equal(r.error, undefined);
    assert.equal(r.knockoutMatches.length, 7); assert.equal(r.qualifiedVideoIds.length, 8); assert.equal(new Set(r.qualifiedVideoIds).size, 8);
    assert.equal(r.firstRoundLabel, 'Quarter-finals'); assert.equal(r.lines.length, 4); assert.deepEqual(r.warnings, []);
    assert.equal(r.tournamentUpdate.stage, 'knockout'); assert.equal(r.tournamentUpdate['groupStage.knockoutBuilt'], true);
    assert.deepEqual(r.tournamentUpdate['groupStage.qualifiedVideoIds'], r.qualifiedVideoIds);
    assert.ok(r.knockoutMatches.every(m => m.tournament === CUP && m.matchId.startsWith(CUP)));
    // no id clashes with the group matches
    assert.equal(new Set([...plan.matches, ...r.knockoutMatches].map(m => m.matchId)).size, 24 + 7);
});

test('knockout plan: a dead heat at the cut gives a warning, not an error', () => {
    const plan = planFor(16);
    const a = plan.matches.filter(m => m.group === 'A');
    const [p, q, r2, s2] = [...new Set(a.flatMap(m => [m.song1.id, m.song2.id]))];
    const M = (x, y) => a.find(m => [m.song1.id, m.song2.id].sort().join() === [x, y].sort().join());
    const tied = [[p, q, 60, 40], [p, r2, 60, 40], [p, s2, 60, 40], [q, r2, 50, 49], [r2, s2, 50, 49], [s2, q, 50, 49]]
        .map(([x, y, vx, vy]) => { const m = M(x, y); return complete(m, m.song1.id === x ? vx : vy, m.song1.id === x ? vy : vx); });
    const played = plan.matches.map(m => m.group === 'A' ? tied.find(t => t.matchId === m.matchId) : playAll([m])[0]);
    const r = planKnockoutBuild({ tournament: plan.tournament, matches: played });
    assert.equal(r.error, undefined); assert.equal(r.warnings.length, 1); assert.match(r.warnings[0], /^Group A: places 2 and 3 are level/);
});

test('knockout plan: 128 entrants -> 63 knockout matches, all rounds 2..7', () => {
    const plan = planFor(128), r = planKnockoutBuild({ tournament: plan.tournament, matches: finish(plan) });
    assert.equal(r.error, undefined); assert.equal(r.knockoutMatches.length, 63);
    assert.equal(r.tournamentUpdate['groupStage.qualifiedVideoIds'].length, 64);
    assert.ok(plan.matches.length + 1 <= 500 && r.knockoutMatches.length + 1 <= 500);
});

console.log(`\n${passed} tests passed`);
