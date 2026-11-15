// Reporting, blocking and posting limits.   node tools/test-moderation.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REASON_KEYS, HIDE_AT_REPORTS, reportId, validTargetId, hiddenByReports, addBlock, removeBlock, isBlockedIn, blockedEntries, isHiddenFor, checkRate, rateMessage, LIMITS, groupReports, reasonSummary } from '../js/moderation-model.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

test('a report id carries target and reporter, so one person can report one thing once', () => {
    assert.equal(reportId('post', 'user_1_99', 'u2'), 'post_user_1_99_u2');
    assert.notEqual(reportId('post', 'x', 'u2'), reportId('comment', 'x', 'u2'));
});
test('target ids with slashes or no text are refused', () => {
    assert.ok(validTargetId('user_a_1')); assert.ok(!validTargetId('a/b')); assert.ok(!validTargetId('')); assert.ok(!validTargetId(null));
});
test('reasons are spam, abuse, inappropriate, other', () => assert.deepEqual(REASON_KEYS, ['spam', 'abuse', 'inappropriate', 'other']));

test('a post is hidden from others once it has enough reports, never from its author, and not after the admin cleared it', () => {
    const p = { userId: 'a', reportCount: HIDE_AT_REPORTS };
    assert.ok(hiddenByReports(p, 'b'));
    assert.ok(!hiddenByReports(p, 'a'));
    assert.ok(!hiddenByReports({ ...p, moderationCleared: true }, 'b'));
    assert.ok(!hiddenByReports({ userId: 'a', reportCount: HIDE_AT_REPORTS - 1 }, 'b'));
    assert.ok(!hiddenByReports({ userId: 'a' }, 'b'));
    assert.ok(!hiddenByReports(p, 'b', true), 'the admin view shows everything');
});

test('blocking: add, remove, check, newest first', () => {
    let l = addBlock({}, 'u1', 'Ann', 1);
    l = addBlock(l, 'u2', 'Bo', 2);
    assert.ok(isBlockedIn(l, 'u1') && isBlockedIn(l, 'u2') && !isBlockedIn(l, 'u3'));
    assert.deepEqual(blockedEntries(l).map(e => e.name), ['Bo', 'Ann']);
    l = removeBlock(l, 'u1');
    assert.ok(!isBlockedIn(l, 'u1') && isBlockedIn(l, 'u2'));
    assert.deepEqual(addBlock({}, '', 'x'), {});
    assert.ok(!isBlockedIn({}, 'toString'), 'inherited object keys are not blocks');
});

test('a blocked person is hidden, except from themselves; reports also hide', () => {
    const blocked = addBlock({}, 'a', 'Ann');
    assert.ok(isHiddenFor({ userId: 'a' }, { blocked, viewerId: 'b' }));
    assert.ok(!isHiddenFor({ userId: 'a' }, { blocked, viewerId: 'a' }));
    assert.ok(!isHiddenFor({ userId: 'c' }, { blocked, viewerId: 'b' }));
    assert.ok(isHiddenFor({ userId: 'c', reportCount: 5 }, { blocked: {}, viewerId: 'b' }));
});

test('posting limit: 3 posts a minute, then a wait that counts down', () => {
    let log = {}, t = 1000;
    for (let i = 0; i < LIMITS.post.max; i++) { const r = checkRate(log, 'post', t + i, true); assert.ok(r.ok); log = r.log; }
    const no = checkRate(log, 'post', t + 10);
    assert.ok(!no.ok); assert.ok(no.waitSeconds >= 1 && no.waitSeconds <= 60);
    assert.ok(checkRate(log, 'post', t + 61000).ok, 'allowed again after the window');
    assert.ok(checkRate(log, 'comment', t + 10).ok, 'comments have their own count');
});
test('a check that is not recorded does not use up an allowance', () => {
    let log = {};
    for (let i = 0; i < 10; i++) log = checkRate(log, 'post', 5000 + i).log;
    assert.ok(checkRate(log, 'post', 6000).ok);
});
test('rate message reads plainly', () => assert.match(rateMessage('post', 1), /wait 1 second\./));

test('admin queue: one row per reported item, open reports only, most reported first', () => {
    const rs = [
        { id: '1', targetType: 'post', targetId: 'p1', authorId: 'a', reason: 'spam', timestamp: 10 },
        { id: '2', targetType: 'post', targetId: 'p1', authorId: 'a', reason: 'abuse', timestamp: 30 },
        { id: '3', targetType: 'comment', targetId: 'c1', authorId: 'b', reason: 'spam', timestamp: 20, postId: 'p9' },
        { id: '4', targetType: 'post', targetId: 'p2', authorId: 'c', reason: 'spam', timestamp: 99, handled: true }
    ];
    const g = groupReports(rs);
    assert.deepEqual(g.map(x => x.key), ['post_p1', 'comment_c1']);
    assert.equal(g[0].count, 2); assert.deepEqual(g[0].reportIds, ['1', '2']); assert.equal(g[0].last, 30);
    assert.equal(g[1].postId, 'p9');
    assert.equal(reasonSummary({ spam: 1, abuse: 2 }), 'Abuse or harassment (2), Spam or advertising (1)');
});

test('firestore.rules: reports are write-once for the reporter and readable by the admin only', () => {
    const r = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    const block = /match \/reports\/\{reportId\} \{([\s\S]*?)\n    \}/.exec(r);
    assert.ok(block, 'a reports block');
    assert.ok(/allow read: if isAdmin\(\)/.test(block[1]));
    assert.ok(/allow create: if signedIn\(\)/.test(block[1]));
    assert.ok(!/allow (update|write)[^;]*signedIn\(\)\s*;/.test(block[1]), 'no open update');
    assert.ok(/isReportBump/.test(r), 'the report counter rule exists');
});

console.log(`\n${passed} tests passed`);
