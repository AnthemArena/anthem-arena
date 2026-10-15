// Offline tests for js/next-match.js (the vote page's "Next match" bar).   node tools/test-next-match.mjs
import assert from 'node:assert/strict';
import { matchKey, unvotedLiveMatches, nextMatchBarHtml } from '../js/next-match.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
const m = (n, status = 'live', extra = {}) => ({ matchId: `cup-group-A-match-${n}`, status, song1: { shortTitle: `Edit ${n}a` }, song2: { shortTitle: `Edit ${n}b` }, ...extra });
const six = [1, 2, 3, 4, 5, 6].map(n => m(n));
const ids = list => list.map(matchKey);

test('API matches carry matchId (not id): the key is found either way', () => {
    assert.equal(matchKey({ matchId: 'a' }), 'a');
    assert.equal(matchKey({ id: 'b' }), 'b');
    assert.equal(matchKey({}), null);
    assert.equal(matchKey(null), null);
});

test('the match being voted in is never in its own "more matches" list (this was the bug: the page filtered on match.id)', () => {
    const left = unvotedLiveMatches(six, { currentId: 'cup-group-A-match-3' });
    assert.equal(left.length, 5);
    assert.ok(!ids(left).includes('cup-group-A-match-3'));
});

test('matches already voted in are left out', () => {
    const voted = new Set(['cup-group-A-match-1', 'cup-group-A-match-4']);
    const left = unvotedLiveMatches(six, { currentId: 'cup-group-A-match-2', hasVoted: id => voted.has(id) });
    assert.deepEqual(ids(left), ['cup-group-A-match-3', 'cup-group-A-match-5', 'cup-group-A-match-6']);
});

test('order starts just after the current match and wraps round', () => {
    assert.deepEqual(ids(unvotedLiveMatches(six, { currentId: 'cup-group-A-match-4' })), ['cup-group-A-match-5', 'cup-group-A-match-6', 'cup-group-A-match-1', 'cup-group-A-match-2', 'cup-group-A-match-3']);
    assert.deepEqual(ids(unvotedLiveMatches(six, { currentId: 'cup-group-A-match-6' })).slice(0, 2), ['cup-group-A-match-1', 'cup-group-A-match-2']);
});

test('only live matches count (finished and upcoming ones are never offered)', () => {
    const mixed = [m(1), m(2, 'completed'), m(3, 'upcoming'), m(4)];
    assert.deepEqual(ids(unvotedLiveMatches(mixed, { currentId: 'cup-group-A-match-1' })), ['cup-group-A-match-4']);
});

test('no current match (or an unknown one) lists every unvoted live match; junk input is safe', () => {
    assert.equal(unvotedLiveMatches(six).length, 6);
    assert.equal(unvotedLiveMatches(six, { currentId: 'nope' }).length, 6);
    assert.deepEqual(unvotedLiveMatches(null), []);
    assert.deepEqual(unvotedLiveMatches([null, {}, { status: 'live' }]), []);
});

test('bar: names the count, the next pairing, and links to that match', () => {
    const html = nextMatchBarHtml(unvotedLiveMatches(six, { currentId: 'cup-group-A-match-2' }));
    assert.ok(html.includes('5 more matches need your vote'));
    assert.ok(html.includes('Edit 3a vs Edit 3b'));
    assert.ok(html.includes('href="vote?match=cup-group-A-match-3"') && html.includes('Next match'));
});

test('bar: singular wording for the last match', () => {
    const html = nextMatchBarHtml([m(5)]);
    assert.ok(html.includes('1 more match needs your vote') && !html.includes('1 more matches'));
});

test('bar: when nothing is left it says so and points at the bracket', () => {
    const html = nextMatchBarHtml([]);
    assert.ok(html.includes("You've voted in every live match") && html.includes('href="brackets"') && !html.includes('Next match'));
});

test('bar: titles from YouTube are escaped', () => {
    const evil = m(1, 'live', { song1: { shortTitle: '<img src=x onerror=alert(1)>' }, song2: { title: 'A "quoted" & <b>edit</b>' } });
    const html = nextMatchBarHtml([evil]);
    assert.ok(!html.includes('<img') && !html.includes('<b>edit'));
    assert.ok(html.includes('&lt;img') && html.includes('&quot;quoted&quot; &amp;'));
});

test('bar: a match id with odd characters is encoded in the link', () => {
    const html = nextMatchBarHtml([m(1, 'live', { matchId: 'a b&c' })]);
    assert.ok(html.includes('href="vote?match=a%20b%26c"'));
});

console.log(`\n${passed} tests passed`);
