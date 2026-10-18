// Bell panel: Clear all dismisses what the tab shows (ids joined, as dismissNotification expects); achievements are saved to the bell.   node tools/test-bell-clear.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = f => fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
const c = read('notification-center.js'), a = read('achievement-tracker.js');
let pass = 0; const t = (n, f) => { f(); console.log(`  ok   ${n}`); pass++; };
t('clear passes comma-joined ids (an array would be wrapped as one id)', () => assert.ok(/dismissNotification\(inTab\.map\(n => n\.id\)\.join\(','\)\)/.test(c)));
t('button is labelled Clear all and asks before clearing', () => assert.ok(/clearBtn\.textContent = 'Clear all'/.test(c) && /Clear everything\?/.test(c)));
t('no 48-hour filter left', () => assert.ok(!/twoDaysAgo/.test(c)));
t('unlocking an achievement saves a bell notification, already marked shown', () => assert.ok(/type: 'achievement'/.test(a) && /shownAsToast: true/.test(a)));
console.log(`${pass} passed`);
