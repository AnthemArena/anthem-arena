// firebase-cache.js: CDN caching is opted in, only public GET answers carry s-maxage, the view POST never does.   node tools/test-edge-cache.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const s = fs.readFileSync(new URL('../netlify/edge-functions/firebase-cache.js', import.meta.url), 'utf8');
let pass = 0; const t = (n, f) => { f(); console.log(`  ok   ${n}`); pass++; };
t('route config opts in to manual CDN caching', () => assert.match(s, /export const config = \{\s*cache: "manual"/));
t('every public max-age header also has s-maxage (the CDN reads s-maxage)', () => {
    const lines = s.split('\n').filter(l => /public, max-age=/.test(l) && !/STALE/.test(l));
    assert.ok(lines.length >= 5);
    for (const l of lines) assert.ok(/s-maxage=/.test(l), l.trim());
});
t('the view-tracking POST sets no cache header', () => {
    const a = s.indexOf('async function handleViewTracking'), b = s.indexOf('async function', a + 10);
    assert.ok(!/Cache-Control/i.test(s.slice(a, b)));
});
console.log(`${pass} passed`);
