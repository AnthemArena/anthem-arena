import assert from 'node:assert/strict';
import fs from 'node:fs';
import { championSelectedBulletin } from '../js/champion-selected.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

t('the alert says who, which skin and the mastery level, with that skin\'s splash art', () => {
    const b = championSelectedBulletin({ packId: 'vi', skinNum: 29, mastery: 3, voiced: { message: 'Good. I\'ve got your back.', cta: 'Let\'s go' } });
    assert.equal(b.type, 'champion-selected'); assert.equal(b.packId, 'vi');
    assert.equal(b.message, 'Good. I\'ve got your back.'); assert.equal(b.cta, 'Let\'s go');
    assert.equal(b.detail, 'Vi · Arcane Undercity · Mastery 3');
    assert.deepEqual(b.strip, { thumbs: ['https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Vi_29.jpg'], more: 0 });
});
t('the classic skin is not named, and a missing voice falls back to plain words', () => {
    const b = championSelectedBulletin({ packId: 'jinx', skinNum: 0, mastery: 1 });
    assert.equal(b.detail, 'Jinx · Mastery 1'); assert.equal(b.message, 'Jinx is now your champion.'); assert.equal(b.cta, 'View champions');
});
t('every pack has a champion-selected voice, and the alert type is wired into the toast', () => {
    for (const p of ['jinx', 'vi', 'caitlyn']) {
        const e = JSON.parse(fs.readFileSync(new URL(`../champion-packs/${p}.json`, import.meta.url), 'utf8')).achievements['champion-selected'];
        assert.ok(e && e.messages.length >= 2 && e.details.length >= 2 && e.buttons.length >= 2, p);
    }
    const g = fs.readFileSync(new URL('../js/global-notifications.js', import.meta.url), 'utf8');
    assert.match(g, /allowedWithoutMatch = \[[^\]]*'champion-selected'/); assert.match(g, /notification\.type === 'champion-selected'\) \{/);
});
console.log(`\n${n} passed`);
