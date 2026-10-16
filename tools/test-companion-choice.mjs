// node tools/test-companion-choice.mjs
// Which companion (toast pack) a visitor gets: their own pick, or the cup's champion.
import assert from 'node:assert/strict';
import { hasChosenCompanion, resolveCompanionId } from '../js/companion-choice.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; };
const store = (obj = {}) => ({ getItem: k => (k in obj ? obj[k] : null) });

test('a brand-new visitor gets the cup champion', () => {
    assert.equal(hasChosenCompanion(store()), false);
    assert.equal(resolveCompanionId(store(), 'vi'), 'vi');
});
test('the old first-visit default (companionId = jinx, no flag) is NOT a choice, so a Vi cup reaches that visitor', () => {
    const s = store({ companionId: 'jinx', championPack: 'jinx' });
    assert.equal(hasChosenCompanion(s), false);
    assert.equal(resolveCompanionId(s, 'vi'), 'vi');
});
test('picking Jinx on purpose (flag set) keeps Jinx even when the cup champion is someone else', () => {
    const s = store({ companionId: 'jinx', companionChosen: 'true' });
    assert.equal(hasChosenCompanion(s), true);
    assert.equal(resolveCompanionId(s, 'vi'), 'jinx');
});
test('anything other than jinx can only have been chosen (the default was always jinx), flag or not', () => {
    const s = store({ companionId: 'caitlyn' });
    assert.equal(hasChosenCompanion(s), true);
    assert.equal(resolveCompanionId(s, 'jinx'), 'caitlyn');
});
test('the legacy championPack key alone is read the same way', () => {
    assert.equal(resolveCompanionId(store({ championPack: 'vi' }), 'jinx'), 'vi');
    assert.equal(resolveCompanionId(store({ championPack: 'jinx' }), 'vi'), 'vi');
});
test('a chosen flag with no stored id falls back to the cup champion instead of crashing', () => {
    assert.equal(resolveCompanionId(store({ companionChosen: 'true' }), 'jinx'), 'jinx');
});

console.log(`${passed} tests passed`);
