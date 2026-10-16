// Tests netlify/edge-functions/firebase-cache.js: listing the matches of a cup must return ALL of them, however the Firestore REST API pages.
//   node tools/test-edge-matches.mjs [path-to-edge-function]      (the optional path lets you run the same scenarios on another version)
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = process.argv[2] ? path.resolve(process.argv[2]) : new URL('../netlify/edge-functions/firebase-cache.js', import.meta.url).pathname;
const handler = (await import(pathToFileURL(file).href)).default;
const quiet = () => { for (const k of ['log', 'warn', 'error', 'info']) console[k] = () => {}; };
quiet();

const str = v => ({ stringValue: String(v) }), int = v => ({ integerValue: String(v) });
const doc = (i) => ({
    name: `projects/arcane-moments/databases/(default)/documents/tournaments/arcane-test-01/matches/jinx-cup-1-group-${i}`,
    fields: {
        matchId: str(`m${i}`), stage: str('group'), group: str(`G${i}`), round: int(1), matchNumber: int(i), status: str('upcoming'),
        song1: { mapValue: { fields: { id: str(`a${i}`), votes: int(0) } } }, song2: { mapValue: { fields: { id: str(`b${i}`), votes: int(0) } } }
    }
});

// A fake Firestore REST server. `serverDefault` = how many documents it returns when pageSize is not asked for,
// `serverMax` = the most it will ever return in one page. Pages are chained with nextPageToken.
function fakeFirestore(total, { serverDefault = 20, serverMax = 300, failOnPage = null, rate429 = 0, votes = null } = {}) {
    const docs = Array.from({ length: total }, (_, i) => doc(i + 1)), log = [];
    if (votes && docs[0]) { docs[0].fields.song1.mapValue.fields.votes = int(votes[0]); docs[0].fields.song2.mapValue.fields.votes = int(votes[1]); }
    let limited = rate429;
    globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url);
        log.push({ method: init.method || 'GET', path: u.pathname, search: u.search });
        if (u.pathname.endsWith(':runQuery')) return new Response(JSON.stringify([{ readTime: 'x' }]), { status: 200 });   // no votes
        if (u.pathname.endsWith('/matches')) {
            if (limited > 0) { limited--; return new Response('slow down', { status: 429, statusText: 'Too Many Requests' }); }
            const asked = Number(u.searchParams.get('pageSize')) || serverDefault;
            const size = Math.min(asked, serverMax), start = Number(u.searchParams.get('pageToken') || 0);
            const pageNo = Math.floor(start / size) + 1;
            if (failOnPage && pageNo === failOnPage) return new Response('boom', { status: 503, statusText: 'Service Unavailable' });
            const slice = docs.slice(start, start + size), next = start + size < total ? String(start + size) : null;
            return new Response(JSON.stringify({ documents: slice, ...(next ? { nextPageToken: next } : {}) }), { status: 200 });
        }
        if (u.pathname.includes('/matches/')) return new Response(JSON.stringify(docs[0]), { status: 200 });
        return new Response('{}', { status: 200 });
    };
    return log;
}
const call = async (qs = '') => handler(new Request(`https://example.test/api/matches?_refresh=1${qs}`), {});
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; process.stdout.write(`  ok  ${name}\n`); };

await test('a server that returns 20 per page: all 130 matches still come back', async () => {
    const log = fakeFirestore(130, { serverDefault: 20, serverMax: 20 });
    const res = await call(), body = await res.json();
    assert.equal(res.status, 200); assert.equal(body.length, 130);
    assert.equal(new Set(body.map(m => m.matchId)).size, 130);
    assert.equal(log.filter(r => r.path.endsWith('/matches')).length, 7);                   // 130 / 20 = 7 pages
    assert.ok(body.every(m => m.stage === 'group' && m.song1.id.startsWith('a')));
});

await test('asks for the biggest page (300) so a normal cup is ONE request', async () => {
    const log = fakeFirestore(130, { serverDefault: 20, serverMax: 300 });
    const body = await (await call()).json();
    const lists = log.filter(r => r.path.endsWith('/matches'));
    assert.equal(body.length, 130); assert.equal(lists.length, 1); assert.ok(lists[0].search.includes('pageSize=300'), lists[0].search);
});

await test('a very long list follows every page token (700 matches over 3 pages)', async () => {
    const log = fakeFirestore(700, { serverMax: 300 });
    const body = await (await call()).json();
    assert.equal(body.length, 700); assert.equal(log.filter(r => r.path.endsWith('/matches')).length, 3);
    assert.equal(new Set(body.map(m => m.matchId)).size, 700);
});

await test('exactly one full page (300) does not loop or duplicate', async () => {
    fakeFirestore(300, { serverMax: 300 });
    assert.equal((await (await call()).json()).length, 300);
});

await test('an empty cup returns an empty list', async () => {
    fakeFirestore(0);
    const res = await call(); assert.equal(res.status, 200); assert.deepEqual(await res.json(), []);
});

await test('a failure on page 2 is an error, never a silently shortened list', async () => {
    fakeFirestore(130, { serverDefault: 20, serverMax: 20, failOnPage: 2 });
    const res = await call('&tournament=no-cache-yet'); assert.equal(res.status, 500); assert.match((await res.json()).error, /Firebase error: 503/);
});

await test('a single match is fetched as before: one request, no paging parameters', async () => {
    const log = fakeFirestore(5);
    const res = await call('&matchId=jinx-cup-1-group-1'), body = await res.json();
    assert.equal(res.status, 200); assert.equal(body.matchId, 'm1');
    const gets = log.filter(r => r.method === 'GET'); assert.equal(gets.length, 1); assert.ok(!gets[0].search.includes('pageSize'), gets[0].search);
});

await test('the match list makes NO per-match votes queries and reads the stored counters', async () => {
    const log = fakeFirestore(50, { serverMax: 300, votes: [30, 10] });
    const body = await (await call('&tournament=counters-cup')).json();
    assert.equal(log.filter(r => r.path.endsWith(':runQuery')).length, 0);
    assert.equal(log.length, 1);                                   // one list request for 50 matches
    assert.equal(body[0].totalVotes, 40); assert.equal(body[0].song1.votes, 30); assert.equal(body[0].song1.percentage, 75); assert.equal(body[0].song2.percentage, 25);
    assert.equal(body[1].totalVotes, 0); assert.equal(body[1].song1.percentage, 50);
});

await test('one 429 is retried and the list still comes back', async () => {
    fakeFirestore(10, { rate429: 1 });
    const res = await call('&tournament=retry-cup'); assert.equal(res.status, 200); assert.equal((await res.json()).length, 10);
});

await test('429 with a recent good copy: serves the stale copy instead of an error', async () => {
    fakeFirestore(10);
    assert.equal((await call('&tournament=stale-cup')).status, 200);       // fills the cache
    fakeFirestore(10, { rate429: 99 });
    const res = await call('&tournament=stale-cup');
    assert.equal(res.status, 200); assert.equal(res.headers.get('X-Cache'), 'STALE'); assert.equal((await res.json()).length, 10);
});

await test('429 with nothing cached is still an honest error', async () => {
    fakeFirestore(10, { rate429: 99 });
    const res = await call('&tournament=never-loaded'); assert.equal(res.status, 500); assert.match((await res.json()).error, /429/);
});

process.stdout.write(`\n${passed} tests passed\n`);
