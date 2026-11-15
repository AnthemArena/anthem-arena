// Site-wide security settings: headers on every response, project files not served, one-off admin pages gone.
//   node tools/test-security-config.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message.split('\n')[0]); } };
const toml = read('netlify.toml');

t('every response carries the basic security headers', () => {
    const block = /\[\[headers\]\]\s*for = "\/\*"\s*\[headers\.values\]([\s\S]*?)(?=\n\[\[|\n#)/.exec(toml);
    assert.ok(block, 'a [[headers]] block for /*');
    for (const h of ['X-Content-Type-Options = "nosniff"', 'Referrer-Policy', 'X-Frame-Options = "SAMEORIGIN"', 'Permissions-Policy']) assert.ok(block[1].includes(h), h);
});
t('project files are answered with 404, before the catch-all', () => {
    const catchAll = toml.indexOf('from = "/*"');
    for (const p of ['/docs/*', '/tools/*', '/netlify/*', '/node_modules/*', '/netlify.toml', '/firestore.rules', '/package.json']) {
        const i = toml.indexOf(`from = "${p}"`); assert.ok(i > -1 && i < catchAll, p);
        const rule = toml.slice(i, toml.indexOf('[[redirects]]', i) > -1 ? toml.indexOf('[[redirects]]', i) : undefined);
        assert.ok(/status = 404/.test(rule) && /force = true/.test(rule), p + ' must be a forced 404');
    }
});
t('a 404 page exists and is not indexed', () => assert.ok(/noindex/.test(read('404.html'))));
t('the one-off fix/backfill pages and the embed test are gone', () => {
    for (const f of ['fix-activity-data.html', 'fix-activity-timestamps.html', 'fix-timestamp-format.html', 'backfill-activity.html', 'backfill-legacy-users.html', 'embed-test.html']) assert.ok(!fs.existsSync(new URL(f, root)), f);
});
t('admin and test pages are not indexed', () => { for (const f of ['admin.html', 'test-toasts.html']) assert.match(read(f), /name="robots" content="noindex/); });
t('robots.txt keeps crawlers out of the test page and project folders', () => { const r = read('robots.txt'); for (const p of ['/admin', '/test-toasts.html', '/docs/', '/tools/']) assert.ok(r.includes('Disallow: ' + p), p); });
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
