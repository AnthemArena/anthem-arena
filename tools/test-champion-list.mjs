import assert from 'node:assert/strict';
import { CHAMPIONS, championDisplayName, championSearchText } from '../js/champion-list.js';
import { fixAvatarUrl } from '../js/avatar-url.js';
import { profileSplashUrl } from '../js/notification-visuals.js';
import { DATA_DRAGON_VERSION } from '../js/arcane-config.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
t('the pick list has no duplicates, the newest champions, and MonkeyKing instead of the non-existent "Wukong" icon', () => {
    assert.equal(new Set(CHAMPIONS).size, CHAMPIONS.length);
    for (const c of ['Ambessa', 'Aurora', 'Locke', 'Mel', 'Yunara', 'Zaahen', 'Smolder', 'Jinx', 'Vi', 'Caitlyn', 'MonkeyKing']) assert.ok(CHAMPIONS.includes(c), c);
    assert.ok(!CHAMPIONS.includes('Wukong'));
    assert.deepEqual([...CHAMPIONS], [...CHAMPIONS].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
});
t('display and search names (Wukong is findable by the name people know)', () => {
    assert.equal(championDisplayName('TwistedFate'), 'Twisted Fate');
    assert.equal(championSearchText('MonkeyKing'), 'monkey king wukong');
    assert.equal(championSearchText('Jinx'), 'jinx');
});
t('avatars saved as "Wukong" load the MonkeyKing icon, and the profile backdrop finds his splash', () => {
    const cdn = 'https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/';
    assert.equal(fixAvatarUrl(cdn + 'Wukong.png'), cdn + 'MonkeyKing.png');
    assert.equal(fixAvatarUrl(cdn + 'MonkeyKing.png'), cdn + 'MonkeyKing.png');
    const store = o => ({ getItem: k => (k in o ? o[k] : null) });
    assert.match(profileSplashUrl({ id: 'jinx' }, store({ avatar: JSON.stringify({ type: 'url', name: 'Wukong' }) })), /MonkeyKing_0\.jpg$/);
    assert.match(profileSplashUrl({ id: 'jinx' }, store({ avatar: JSON.stringify({ type: 'url', name: 'Monkey King' }) })), /MonkeyKing_0\.jpg$/);
});
t('the version is the one checked with tools/check-ddragon.mjs', () => { assert.equal(DATA_DRAGON_VERSION, '16.20.1'); });
console.log(`\n${n} passed`);
