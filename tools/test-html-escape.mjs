// Text people write must never reach innerHTML unescaped. Checks the shared helpers and scans the page scripts for the
// holes found in the XSS audit (usernames, post text, picture addresses, ids in inline handlers).
//   node tools/test-html-escape.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { escapeHtml, safeImageUrl } from '../js/html-escape.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message.split('\n')[0]); } };
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

t('escapeHtml covers < > & " \' and null', () => {
    assert.equal(escapeHtml('<img src=x onerror="a(1)">\'&'), '&lt;img src=x onerror=&quot;a(1)&quot;&gt;&#39;&amp;');
    assert.equal(escapeHtml(null), ''); assert.equal(escapeHtml(5), '5');
});
t('safeImageUrl keeps http(s), image data urls and site paths; drops javascript: and html data urls; escapes quotes', () => {
    assert.equal(safeImageUrl('https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Jinx_0.jpg'), 'https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Jinx_0.jpg');
    assert.equal(safeImageUrl('data:image/svg+xml,%3Csvg%3E'), 'data:image/svg+xml,%3Csvg%3E');
    assert.equal(safeImageUrl('/images/a.png'), '/images/a.png');
    assert.equal(safeImageUrl('javascript:alert(1)'), ''); assert.equal(safeImageUrl('data:text/html,<script>'), ''); assert.equal(safeImageUrl('//evil.com/x.png'), '');
    assert.equal(safeImageUrl('https://a.com/x" onerror="y'), 'https://a.com/x&quot; onerror=&quot;y');
});
const feed = read('js/feed-page.js'), profile = read('js/profile-page.js');
t('feed and profile escapeHtml escape quotes (they are used inside attributes)', () => {
    for (const src of [feed, profile]) { const m = /function escapeHtml\(text\) \{([\s\S]*?)\n\}/.exec(src); assert.ok(m && /&quot;/.test(m[1]), 'escapeHtml must escape quotes'); }
});
t('post text is escaped before mentions are added (stored XSS in posts)', () => assert.match(feed, /parseMentionsHTML\(escapeHtml\(displayContent\)\)/));
t('names, ids and picture addresses written by people are escaped in the feed templates', () => {
    for (const bad of ['${post.username}', '${comment.username}', '${user.username}', '${mention.username}', '${avatarUrl}', '${comment.userId}', '${parentUsername}']) assert.ok(!feed.includes(bad), 'unescaped ' + bad);
});
t('names and links written by people are escaped in the profile templates', () => {
    for (const bad of ['${post.username}', '${profile.username}', '${currentProfile.username}', '${displayUsername}', '${targetUsername}', '${socialLinks.twitter}', '${socialLinks.discord}', "copyDiscordHandle('"]) assert.ok(!profile.includes(bad), 'unescaped ' + bad);
});
t('a YouTube video id from a post is validated before it reaches src / attributes', () => assert.ok(/\[A-Za-z0-9_-\]\{6,20\}/.test(feed) && (feed.match(/\[A-Za-z0-9_-\]\{6,20\}/g) || []).length >= 2));
t('alert fallback banner and notification centre escape message, detail and pictures', () => {
    const g = read('js/global-notifications.js'), n = read('js/notification-center.js');
    assert.ok(!g.includes('${notification.message}</div>') && !g.includes('${notification.detail}</div>') && !g.includes('<img src="${notification.thumbnailUrl}"'));
    assert.ok(!n.includes('">${displayMessage}</div>') && !n.includes('clamp">${displayDetail}</div>') && !n.includes('<img src="${notification.thumbnailUrl}"'));
});
t('notification ids are limited to id characters before they go into inline handlers', () => assert.match(read('js/notification-visuals.js'), /const safeIds =/));
t('firestore rules reject markup in usernames on profile, post, comment, vote and activity writes', () => {
    const r = read('firestore.rules'); assert.match(r, /function cleanUsername/); assert.ok((r.match(/cleanUsername\(request\.resource\.data\)/g) || []).length >= 5);
});
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
