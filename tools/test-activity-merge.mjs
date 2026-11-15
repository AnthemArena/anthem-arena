// The Activity page was merged into the Feed.   node tools/test-activity-merge.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const walk = (d, out = []) => { for (const e of fs.readdirSync(new URL(d, root), { withFileTypes: true })) { if (['node_modules', '.git', 'docs', 'tools'].includes(e.name)) continue; const p = path.posix.join(d, e.name); e.isDirectory() ? walk(p + '/', out) : out.push(p); } return out; };
const files = walk('./').filter(f => /\.(html|js|css|toml|xml|txt|json|webmanifest)$/.test(f));
const toml = read('netlify.toml');

t('the page and its script are gone (so the 200-vote read is gone too)', () => { assert.ok(!fs.existsSync(new URL('activity.html', root))); assert.ok(!fs.existsSync(new URL('js/activity.js', root))); });
t('activity.css stays: the vote page uses it', () => { assert.ok(fs.existsSync(new URL('css/activity.css', root))); assert.match(read('vote.html'), /activity\.css/); });
t('/activity and /activity.html both redirect to /feed, permanently, ahead of anything else', () => {
    for (const from of ['/activity', '/activity.html']) {
        const i = toml.indexOf(`from = "${from}"`); assert.ok(i > -1, from);
        const rule = toml.slice(i, toml.indexOf('[[redirects]]', i) > -1 ? toml.indexOf('[[redirects]]', i) : undefined);
        assert.ok(/to = "\/feed"/.test(rule) && /status = 301/.test(rule) && /force = true/.test(rule), from);
        assert.ok(i < toml.indexOf('from = "/*"'), from + ' must come before the catch-all');
    }
});
t('nothing links to the old page', () => {
    for (const f of files) { if (f === 'netlify.toml') continue; const s = read(f); assert.ok(!/href="\/activity(\.html)?"/.test(s) && !/'activity\.html'/.test(s), f); }
});
t('the nav no longer has a Live item', () => assert.ok(!/>\s*Live\s*<\/a>/.test(read('js/navigation.js'))));
t('the music note is no longer the stand-in avatar (it stays in the avatar picker and the badges)', () => {
    const allowed = new Set(['js/username-system.js', 'js/achievement-tracker.js', 'js/global-notifications.js', 'js/music-video-page.js']);
    for (const f of files.filter(f => f.startsWith('js/') && f.endsWith('.js') && !allowed.has(f))) {
        const s = read(f);
        assert.ok(!/value: '🎵'/.test(s) && !/\|\| '🎵'/.test(s) && !/createEmojiAvatar\('🎵'\)/.test(s), f);
    }
    assert.ok(read('js/navigation.js').includes("avatar?.value || '👤'"));
});
t('a locked vote in the Feed says how to unlock it', () => assert.match(read('js/feed-page.js'), /Vote in it to see who they picked/));
console.log(`\n${n} passed`);
