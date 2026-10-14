// Runs the REAL js/init-group-tournament.js against an in-memory fake Firestore (no Firebase needed).
//   node tools/test-group-firestore.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./test-support/hooks.mjs', import.meta.url);
const { store, stats } = await import('./test-support/fake-firestore.mjs');
const G = await import('../js/init-group-tournament.js');
const B = await import('../js/group-builder.js');

const CUP = 'jinx-cup-1';
const mk = (n, extra = {}) => ({
    id: `vid${String(n).padStart(8, '0')}`, videoId: `vid${String(n).padStart(8, '0')}`, title: `Jinx edit ${n}`, shortTitle: `Edit ${n}`, slug: `edit-${n}`,
    artist: `Creator ${n}`, channelId: `chan${n}`, year: 2026, status: 'ok', embedAllowed: true, flags: [], tournaments: [CUP],
    views: 1_000_000 - n * 1000, likes: 50_000 - n * 40, ...extra
});
let EDITS = [];
const setEdits = (n, over = e => e) => { EDITS = Array.from({ length: n }, (_, i) => over(mk(i + 1), i)); };
globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(EDITS) });

let passed = 0, pending = Promise.resolve();
const test = (name, fn) => { pending = pending.then(async () => { store.clear(); await fn(); passed++; console.log('  ok  ' + name); }); };
const matchesOf = () => [...store.entries()].filter(([k]) => k.startsWith(`tournaments/${CUP}/matches/`)).map(([, v]) => v);
const closeMatch = (m, v1, v2) => { const k = `tournaments/${CUP}/matches/${m.matchId}`; store.set(k, { ...store.get(k), status: 'completed', song1: { ...m.song1, votes: v1 }, song2: { ...m.song2, votes: v2 }, winnerId: v1 > v2 ? m.song1.id : m.song2.id }); };
const closeAll = (upTo = Infinity) => matchesOf().filter(m => m.stage === 'group').forEach((m, i) => { if (i < upTo) closeMatch(m, m.song1.seed < m.song2.seed ? 60 : 40, m.song1.seed < m.song2.seed ? 40 : 60); });

test('build a 16-edit group cup: one atomic batch, doc + 24 matches, correct shape', async () => {
    setEdits(16);
    const built = await G.previewGroupTournament({ drawSeed: 'seed-1' });
    assert.equal(store.size, 0);                                       // preview writes nothing
    await G.writeGroupTournament(built);
    assert.equal(stats.commits, 1); assert.equal(stats.lastBatchSize, 25);
    const t = store.get(`tournaments/${CUP}`);
    assert.equal(t.format, 'groups-knockout'); assert.equal(t.stage, 'group'); assert.equal(t.drawSeed, 'seed-1'); assert.equal(t.seeding.length, 16);
    assert.equal(matchesOf().length, 24);
    assert.ok(matchesOf().every(m => m.stage === 'group' && m.round === 1 && m.status === 'upcoming'));
});

test('writing twice refuses and changes nothing', async () => {
    setEdits(16);
    const built = await G.previewGroupTournament({ drawSeed: 's' });
    await G.writeGroupTournament(built);
    const before = JSON.stringify([...store.entries()]);
    await assert.rejects(() => G.writeGroupTournament(built), /already has 24 matches/);
    assert.equal(JSON.stringify([...store.entries()]), before);
});

test('wrong number of entries / unusable edits stop the build with a clear message', async () => {
    setEdits(12);
    await assert.rejects(() => G.previewGroupTournament({ drawSeed: 's' }), /12 edits entered\. A group-stage cup needs exactly 8, 16, 32, 64, 128, 256/);
    setEdits(16, (e, i) => i === 3 ? { ...e, status: 'review' } : e);
    await assert.rejects(() => G.previewGroupTournament({ drawSeed: 's' }), /status is "review"/);
    assert.equal(store.size, 0);
});

test('only the active cup can be built', async () => {
    setEdits(16);
    await assert.rejects(() => G.previewGroupTournament({ cupId: 'vi-cup-1' }), /Blocked: asked to build "vi-cup-1"/);
});

test('knockout cannot be built before the groups are closed; names the open groups', async () => {
    setEdits(16);
    await G.writeGroupTournament(await G.previewGroupTournament({ drawSeed: 's' }));
    await assert.rejects(() => G.previewKnockoutBuild(), /4 group\(s\) are not finished: A \(0 of 6 matches closed\)/);
    closeAll(20);
    await assert.rejects(() => G.previewKnockoutBuild(), /1 group\(s\) are not finished: D \(2 of 6 matches closed\)/);
});

test('full run: groups closed -> knockout written in one batch, cup flips to the knockout stage, cannot run twice', async () => {
    setEdits(16);
    await G.writeGroupTournament(await G.previewGroupTournament({ drawSeed: 's' }));
    closeAll();
    const preview = await G.previewKnockoutBuild();
    assert.equal(preview.knockoutMatches.length, 7); assert.equal(preview.firstRoundLabel, 'Quarter-finals'); assert.deepEqual(preview.warnings, []);
    assert.equal(matchesOf().length, 24);                               // preview writes nothing
    await G.writeKnockoutBuild(preview);
    assert.equal(stats.lastBatchSize, 8);                               // 7 matches + the tournament update
    assert.equal(matchesOf().length, 31);
    const t = store.get(`tournaments/${CUP}`);
    assert.equal(t.stage, 'knockout'); assert.equal(t.groupStage.knockoutBuilt, true); assert.equal(t.groupStage.qualifiedVideoIds.length, 8);
    assert.equal(t.groupStage.groups, 4);                               // dotted update kept the rest of groupStage
    assert.ok(matchesOf().filter(m => m.stage === 'knockout').every(m => m.round >= 2));
    await assert.rejects(() => G.previewKnockoutBuild(), /already been built/);
    await assert.rejects(() => G.writeKnockoutBuild(preview), /already been built/);
    assert.equal(matchesOf().length, 31);
});

test('a stale preview is refused if group results changed before writing (and nothing is written)', async () => {
    setEdits(16);
    await G.writeGroupTournament(await G.previewGroupTournament({ drawSeed: 's' }));
    closeAll();
    const preview = await G.previewKnockoutBuild();
    // reverse EVERY result in group A, so its top two certainly change
    for (const m of matchesOf().filter(x => x.group === 'A')) closeMatch(m, m.song1.seed < m.song2.seed ? 40 : 60, m.song1.seed < m.song2.seed ? 60 : 40);
    const now = (await G.previewKnockoutBuild()).qualifiedVideoIds.join();
    assert.notEqual(now, preview.qualifiedVideoIds.join());             // the precondition really holds
    await assert.rejects(() => G.writeKnockoutBuild(preview), /group results changed/);
    assert.equal(matchesOf().length, 24);
    assert.equal(store.get(`tournaments/${CUP}`).stage, 'group');
});

test('Reset: rebuilding from the stored draw gives the SAME groups even after views changed', async () => {
    setEdits(32);
    const first = await G.previewGroupTournament({ drawSeed: 'published-seed' });
    await G.writeGroupTournament(first);
    const sig = () => matchesOf().map(m => `${m.matchId}:${m.song1.id}-${m.song2.id}`).sort().join();
    const original = sig();
    const stored = await G.getStoredGroupDraw();
    assert.equal(stored.drawSeed, 'published-seed'); assert.equal(stored.size, 32); assert.equal(stored.seeding.length, 32);
    setEdits(32, (e, i) => ({ ...e, views: 9_000_000 - ((i * 13) % 32) * 5000, likes: 7000 + ((i * 17) % 32) * 11 }));   // stats moved a lot
    const drifted = await G.previewGroupTournament({ drawSeed: 'published-seed' });
    assert.notEqual(drifted.matches.map(m => `${m.matchId}:${m.song1.id}-${m.song2.id}`).sort().join(), original);
    const rebuilt = await G.previewGroupTournament({ stored });
    assert.equal(rebuilt.matches.map(m => `${m.matchId}:${m.song1.id}-${m.song2.id}`).sort().join(), original);
    for (const k of [...store.keys()].filter(k => k.includes('/matches/'))) store.delete(k);   // what the admin Reset does
    await G.writeGroupTournament(rebuilt);
    assert.equal(sig(), original);
});

test('Reset refuses when the entry list changed since the cup was built', async () => {
    setEdits(16);
    await G.writeGroupTournament(await G.previewGroupTournament({ drawSeed: 's' }));
    const stored = await G.getStoredGroupDraw();
    setEdits(16, (e, i) => i === 0 ? mk(999) : e);
    await assert.rejects(() => G.previewGroupTournament({ stored }), /does not cover 1 entered edit/);
});

test('getStoredGroupDraw is null for a single-elimination cup', async () => {
    store.set(`tournaments/${CUP}`, { id: CUP, format: 'single-elimination', drawSeed: 'x', bracketSize: 16 });
    assert.equal(await G.getStoredGroupDraw(), null);
});

test('256-edit cup: 384 group matches in one batch of 385, knockout of 127 + 1 afterwards, both inside 500', async () => {
    setEdits(256);
    await G.writeGroupTournament(await G.previewGroupTournament({ drawSeed: 'big' }));
    assert.equal(stats.lastBatchSize, 385); assert.equal(matchesOf().length, 384);
    closeAll();
    await G.writeKnockoutBuild(await G.previewKnockoutBuild());
    assert.equal(stats.lastBatchSize, 128); assert.equal(matchesOf().length, 384 + 127);
    assert.equal(store.get(`tournaments/${CUP}`).groupStage.qualifiedVideoIds.length, 128);
    assert.equal(new Set(matchesOf().map(m => m.matchId)).size, 511);
});

test('groupsPerBatch is saved and used', async () => {
    setEdits(32);
    await G.writeGroupTournament(await G.previewGroupTournament({ drawSeed: 's', groupsPerBatch: 4 }));
    assert.equal(store.get(`tournaments/${CUP}`).groupStage.groupsPerBatch, 4);
    assert.deepEqual([...new Set(matchesOf().map(m => m.batch))].sort(), [1, 2]);
    const stored = await G.getStoredGroupDraw(); assert.equal(stored.groupsPerBatch, 4);
});

await pending;
console.log(`\n${passed} tests passed`);
