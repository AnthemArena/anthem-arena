// Runs tools/admin-swap-edit.js against a small in-memory Firestore.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const T = 'jinx-cup-1', OLD = 'OLDVIDEO001', NEW = 'NEWVIDEO001', OTHER = 'OTHERVID001';
const edits = [
    { videoId: OLD, title: 'Old edit', status: 'removed' },
    { videoId: NEW, id: NEW, title: 'New edit', shortTitle: 'New', artist: 'Newbie', creatorUrl: 'https://y/c', channelId: 'c1', year: 2025, slug: 'new', status: 'ok', embedAllowed: true },
    { videoId: OTHER, title: 'Other', status: 'ok' },
];
const mk = (n, s1, s2, extra = {}) => ({ matchId: `${T}-group-I-match-${n}`, group: 'I', status: 'upcoming', totalVotes: 0, song1: { videoId: s1, votes: 0, drawPosition: 5, pot: 2, group: 'I', title: s1 }, song2: { videoId: s2, votes: 0, drawPosition: 9, pot: 3, group: 'I', title: s2 }, ...extra });
const fresh = () => {
    const store = new Map();
    store.set(`tournaments/${T}`, { id: T, entryVideoIds: [OLD, OTHER, 'ZZZ'].sort() });
    store.set(`tournaments/${T}/matches/m1`, mk(1, OLD, OTHER));
    store.set(`tournaments/${T}/matches/m2`, mk(2, 'AAA', OLD));
    store.set(`tournaments/${T}/matches/m3`, mk(3, 'AAA', OTHER));
    return store;
};
const makeFs = store => ({
    collection: (_d, path) => ({ path }),
    doc: (_d, ...parts) => ({ path: parts.join('/') }),
    getDocs: async c => ({ docs: [...store].filter(([p]) => p.startsWith(c.path + '/') && !p.slice(c.path.length + 1).includes('/')).map(([p, d]) => ({ id: p.split('/').pop(), ref: { path: p }, data: () => structuredClone(d) })) }),
    getDoc: async r => ({ exists: () => store.has(r.path), data: () => structuredClone(store.get(r.path)) }),
    arrayUnion: v => ({ __union: v }),
    updateDoc: async (r, p) => apply(store, r, p),
    writeBatch: () => { const ops = []; return { update: (r, p) => ops.push(() => apply(store, r, p)), commit: async () => ops.forEach(f => f()) }; },
});
const apply = (store, r, patch) => {
    const d = store.get(r.path);
    for (const [k, v] of Object.entries(patch)) d[k] = v && v.__union ? [...(d[k] || []), v.__union] : v;
};

globalThis.__swapTest = {};
vm.runInThisContext(fs.readFileSync(new URL('./admin-swap-edit.js', import.meta.url), 'utf8'));
const swap = globalThis.__swapTest.fn;
const run = (store, over = {}) => swap({ fs: makeFs(store), db: {}, edits, download: () => {}, log: () => {}, now: () => '2026-11-15T17:00:00.000Z',
    config: { tournament: T, removedVideoId: OLD, replacementVideoId: NEW, dryRun: false, ...over } });

// dry run changes nothing and plans two matches
let s = fresh(), before = JSON.stringify([...s]);
let r = await run(s, { dryRun: true });
assert.equal(JSON.stringify([...s]), before); assert.equal(r.planned, 2); assert.equal(r.changed, false);

// real run: both matches get the replacement in the right slot; others untouched
s = fresh(); r = await run(s);
assert.equal(r.changed, true); assert.equal(r.updated, 2);
const m1 = s.get(`tournaments/${T}/matches/m1`), m2 = s.get(`tournaments/${T}/matches/m2`), m3 = s.get(`tournaments/${T}/matches/m3`);
assert.equal(m1.song1.videoId, NEW); assert.equal(m1.song2.videoId, OTHER);
assert.equal(m2.song2.videoId, NEW); assert.equal(m2.song1.videoId, 'AAA');
assert.equal(m3.song2.videoId, OTHER);
assert.deepEqual([m1.song1.drawPosition, m1.song1.pot, m1.song1.group, m1.song1.votes, m1.song1.seed], [5, 2, 'I', 0, null]);
assert.equal(m1.song1.artist, 'Newbie'); assert.equal(m1.song1.replacementFor, OLD);
const cup = s.get(`tournaments/${T}`);
assert.deepEqual(cup.entryVideoIds, [NEW, OTHER, 'ZZZ'].sort());
assert.equal(cup.replacements.length, 1); assert.equal(cup.replacements[0].removed, OLD); assert.equal(cup.replacements[0].replacement, NEW);

// refusals: nothing changes
// a wrong ID is caught by the title check
s = fresh(); before = JSON.stringify([...s]);
r = await run(s, { expectTitleContains: 'something else entirely' });
assert.equal(r.changed, false); assert.ok(r.problems.some(p => p.includes('Wrong video ID')));
assert.equal(JSON.stringify([...s]), before);
s = fresh(); r = await run(s, { expectTitleContains: 'OLDVIDEO' }); assert.equal(r.changed, true);
for (const [name, mutate, over] of [
    ['an opened match', st => { st.get(`tournaments/${T}/matches/m2`).status = 'live'; }, {}],
    ['a match with votes', st => { st.get(`tournaments/${T}/matches/m1`).totalVotes = 3; }, {}],
    ['a replacement already in the cup', st => { st.get(`tournaments/${T}/matches/m3`).song1.videoId = NEW; }, {}],
    ['an unknown replacement', () => {}, { replacementVideoId: 'NOPE' }],
    ['an unknown removed edit', () => {}, { removedVideoId: 'NOPE2' }],
]) {
    s = fresh(); mutate(s); before = JSON.stringify([...s]);
    r = await run(s, over);
    assert.equal(r.changed, false, name); assert.ok(r.problems.length, name);
    assert.equal(JSON.stringify([...s]), before, `${name}: must change nothing`);
}
console.log('admin swap: all checks passed');
