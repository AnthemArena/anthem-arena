// node tools/test-notification-visuals.mjs
import assert from 'node:assert/strict';
import { avatarSrc, viewerAvatarSrc, championBadgeUrl, accentFor, markFor, escapeHtml, circleHtml, pairHtml, stackHtml, toastHtml } from '../js/notification-visuals.js';
let pass = 0; const t = (n, f) => { f(); console.log('  ok  ', n); pass++; };

t('avatarSrc handles url, object, JSON string, emoji, nothing', () => {
    assert.equal(avatarSrc('https://x/y.png'), 'https://x/y.png');
    assert.equal(avatarSrc({ type: 'url', value: 'https://x/a.png' }), 'https://x/a.png');
    assert.equal(avatarSrc({ type: 'champion', imageUrl: 'https://x/c.png' }), 'https://x/c.png');
    assert.equal(avatarSrc(JSON.stringify({ type: 'url', value: 'https://x/j.png' })), 'https://x/j.png');
    assert.ok(avatarSrc({ type: 'emoji', value: '🎵' }).startsWith('data:image/svg+xml'));
    assert.ok(avatarSrc('🎵').startsWith('data:image/svg+xml'));
    assert.equal(avatarSrc(null), null); assert.equal(avatarSrc({}), null); assert.equal(avatarSrc('{bad json'), null);
});
t('a raw object never becomes "[object Object]"', () => assert.ok(!String(avatarSrc({ type: 'url', value: 'https://x/a.png' })).includes('object')));
t('viewer avatar comes from storage', () => {
    const st = { getItem: k => (k === 'avatar' ? JSON.stringify({ type: 'url', value: 'https://x/me.png' }) : null) };
    assert.equal(viewerAvatarSrc(st), 'https://x/me.png'); assert.equal(viewerAvatarSrc({ getItem: () => null }), null);
});
t('champion badge: skin tile for a champion pack, icon otherwise', () => {
    assert.equal(championBadgeUrl({ icon: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Jinx.png', portrait: { skin: 37 } }), 'https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Jinx_37.jpg');
    assert.equal(championBadgeUrl({ icon: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Vi.png' }), 'https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Vi_0.jpg');
    assert.equal(championBadgeUrl({ icon: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/29.png' }), 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/29.png');
    assert.equal(championBadgeUrl(null), null);
});
t('accent and marker', () => { assert.equal(accentFor('ally', { color: '#fff' }), '#4ade80'); assert.equal(accentFor('opponent', { color: '#e91e63' }), '#e91e63'); assert.equal(accentFor('opponent', null), '#ff69b4'); assert.equal(markFor('ally'), '='); assert.equal(markFor('opponent'), 'VS'); });
t('names and text are escaped', () => {
    assert.equal(escapeHtml('<b>"x"&'), '&lt;b&gt;&quot;x&quot;&amp;');
    const h = circleHtml('https://x/a.png" onerror="alert(1)', '<img>', 40);
    assert.ok(!h.includes('" onerror="alert(1)')); assert.ok(h.includes('&lt;'));
});
t('pair, stack and toast render the pieces', () => {
    const p = pairHtml({ theirSrc: 'https://x/a.png', theirName: 'Kai', yourSrc: null, relationship: 'opponent', size: 40, accent: '#ff69b4' });
    assert.ok(p.includes('VS') && p.includes('nv-you-rival') && p.includes('>K<'));
    assert.ok(pairHtml({ theirSrc: null, theirName: 'Kai', yourSrc: null, relationship: 'ally', size: 40, accent: '#4ade80' }).includes('>=<'));
    assert.equal((stackHtml([null, null, null, null], ['A', 'B', 'C', 'D']).match(/nv-stacked/g) || []).length, 3);
    const t1 = toastHtml({ relationship: 'opponent', triggerUsername: 'Kai' }, { theirSrc: null, yourSrc: null, jinxSrc: 'https://x/j.jpg', accent: '#ff69b4', headline: 'Kai voted against you', quip: 'Boom <3', cta: 'Challenge' });
    assert.ok(t1.includes('Kai voted against you') && t1.includes('Boom &lt;3') && t1.includes('handleBulletinCTA') && t1.includes('openBulletinMatch'));
});
console.log(`${pass} passed`);
