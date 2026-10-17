import assert from 'node:assert/strict';
import { fixAvatarUrl } from '../js/avatar-url.js';
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
