// The achievement pop-up must come from the new layout (an older branch used to run first).   node tools/test-achievement-toast.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../js/global-notifications.js', import.meta.url), 'utf8');
const hits = src.match(/notification\.type === 'achievement'/g) || [];
assert.equal(hits.length, 1, `expected one achievement branch in showBulletin, found ${hits.length}`);
assert.ok(/achievementToastHtml\(notification/.test(src));
assert.ok(!/achievement-badge-large"/.test(src.split('showBulletin')[1] || ''), 'old achievement markup is still built');
console.log('  ok   one achievement branch, new layout');
console.log('1 passed');
