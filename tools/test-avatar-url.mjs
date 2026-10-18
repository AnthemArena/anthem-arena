import assert from 'node:assert/strict';
import { fixAvatarUrl, splashFromAvatar } from '../js/avatar-url.js';
const cdn = 'https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/';
const t = (n, f) => { f(); console.log('  ok  ', n); };
t('spaces and apostrophes are repaired', () => {
    assert.equal(fixAvatarUrl(cdn + 'Lee Sin.png'), cdn + 'LeeSin.png');
    assert.equal(fixAvatarUrl(cdn + 'Lee%20Sin.png'), cdn + 'LeeSin.png');
    assert.equal(fixAvatarUrl(cdn + "Kai'Sa.png"), cdn + 'Kaisa.png');
    assert.equal(fixAvatarUrl(cdn + 'Miss Fortune.png'), cdn + 'MissFortune.png');
});
t('good urls and other hosts are untouched', () => {
    assert.equal(fixAvatarUrl(cdn + 'Jinx.png'), cdn + 'Jinx.png');
    assert.equal(fixAvatarUrl('https://x.com/my pic.png'), 'https://x.com/my pic.png');
    assert.equal(fixAvatarUrl(null), null);
});
console.log('2 passed');
t('the cover follows the skin in the avatar picture', () => {
    const sp = 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/';
    assert.equal(splashFromAvatar({ type: 'url', value: 'https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Vi_29.jpg' }), sp + 'Vi_29.jpg');
    assert.equal(splashFromAvatar({ type: 'url', value: cdn + 'Jinx.png' }), sp + 'Jinx_0.jpg');
    assert.equal(splashFromAvatar({ type: 'url', value: cdn + 'Lee Sin.png' }), sp + 'LeeSin_0.jpg');
    assert.equal(splashFromAvatar({ type: 'url', value: 'https://x/y.png', name: 'Wukong' }), sp + 'MonkeyKing_0.jpg');
    assert.equal(splashFromAvatar({ type: 'emoji', value: '🎵' }), null);
    assert.equal(splashFromAvatar(null), null);
});
