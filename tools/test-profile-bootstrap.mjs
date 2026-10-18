// profile-bootstrap.js: new-visitor profile helpers.   node tools/test-profile-bootstrap.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateUsername, isPlaceholderName, waitForAuthUid } from '../js/profile-bootstrap.js';
let pass = 0;
const t = async (n, f) => { await f(); console.log(`  ok   ${n}`); pass++; };
await t('generated names look like AdjectiveNounNumber', () => assert.match(generateUsername(), /^[A-Z][a-z]+[A-Z][a-z]+\d{1,3}$/));
await t('placeholder names', () => { for (const n of [null, '', 'null', 'undefined', 'Anonymous']) assert.ok(isPlaceholderName(n)); assert.ok(!isPlaceholderName('FierceWatcher229')); });
await t('already signed in: returns the uid at once', async () => assert.equal(await waitForAuthUid({ currentUser: { uid: 'u1' } }), 'u1'));
await t('vote page uses the sign-in id for first-time visitors', () => {
    const v = fs.readFileSync(new URL('../js/vote.js', import.meta.url), 'utf8');
    assert.ok(/waitForAuthUid\(auth\)/.test(v) && /ensureOwnProfile\(\)/.test(v));
});
await t('feed repairs a missing profile before loading users', () => {
    const f = fs.readFileSync(new URL('../js/feed-page.js', import.meta.url), 'utf8');
    assert.ok(/await repairMissingProfile\(\);\s*await loadAllUsers\(\);/.test(f));
});
console.log(`${pass} passed`);
