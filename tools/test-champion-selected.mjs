import assert from 'node:assert/strict';
import fs from 'node:fs';
import { championSelectedBulletin, markChampionSelected, takePendingChampion } from '../js/champion-selected.js';
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
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
t('the note left by Save is read once, then gone; junk and champions without levels are ignored', () => {
    const s = mem();
    assert.equal(takePendingChampion(s), null);
    markChampionSelected('caitlyn', 28, s);
    assert.deepEqual(takePendingChampion(s), { packId: 'caitlyn', skinNum: 28 });
    assert.equal(takePendingChampion(s), null);
    markChampionSelected('ekko', 0, s); assert.equal(takePendingChampion(s), null);
    s.setItem('championSelectedPending', '{bad'); assert.equal(takePendingChampion(s), null);
    assert.equal(takePendingChampion({ getItem() { throw new Error('blocked'); } }), null);
});
t('a routine alert cannot wipe the champion card for its first seconds', () => {
    const g = fs.readFileSync(new URL('../js/global-notifications.js', import.meta.url), 'utf8');
    assert.match(g, /currentBulletin\?\.type === 'champion-selected' && notification\.type !== 'champion-selected' && Date\.now\(\) - currentBulletinShownAt < 6000/);
    assert.match(g, /currentBulletinShownAt = Date\.now\(\)/);
});
console.log(`\n${n} passed`);
