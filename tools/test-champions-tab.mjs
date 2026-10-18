import assert from 'node:assert/strict';
import { voteShares, buildChampionsView, championsHtml, avatarKeyOf, skinAvatar, masteryChipHtml, requirementText } from '../js/champions-tab-model.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const votes = (spec) => Object.entries(spec).flatMap(([id, c]) => Array.from({ length: c }, () => ({ championId: id === 'none' ? undefined : id })));

t('vote shares: whole percentages that add to 100, old votes count as Jinx, unknown packs ignored', () => {
    const s = voteShares([...votes({ jinx: 1, vi: 1, caitlyn: 1 })]);
    assert.equal(s.reduce((a, r) => a + r.percent, 0), 100);
    assert.deepEqual(voteShares(votes({ none: 2, vi: 2 })).map(r => [r.packId, r.votes, r.percent]), [['jinx', 2, 50], ['vi', 2, 50], ['caitlyn', 0, 0]]);
    assert.equal(voteShares([{ championId: 'ekko' }, { championId: 'vi' }]).find(r => r.packId === 'vi').percent, 100);
    assert.deepEqual(voteShares([]).map(r => r.percent), [0, 0, 0]);
    assert.deepEqual(voteShares(votes({ jinx: 6, vi: 3, caitlyn: 1 })).map(r => r.percent), [60, 30, 10]);
});
t('avatar key reads champion and skin from the picture address', () => {
    assert.equal(avatarKeyOf({ type: 'url', value: 'https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Jinx_37.jpg' }), 'jinx:37');
    assert.equal(avatarKeyOf({ type: 'url', value: 'https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/Vi.png' }), 'vi:0');
    assert.equal(avatarKeyOf({ type: 'url', value: 'https://x/champion/Ekko.png' }), null);
    assert.equal(avatarKeyOf({ type: 'emoji', value: '🎵' }), null);
    assert.equal(avatarKeyOf(null), null);
    assert.equal(avatarKeyOf(skinAvatar('caitlyn', 28)), 'caitlyn:28');
    assert.deepEqual(Object.keys(skinAvatar('vi', 29)), ['type', 'value', 'name', 'skin']);
});
t('view: mastery from pack XP, skins locked or open, the current avatar marked', () => {
    const v = buildChampionsView({ votes: votes({ jinx: 3 }), packXp: { jinx: 150, vi: 0 }, achievements: [], activePack: 'jinx', avatarKey: 'jinx:37' });
    const jinx = v.rows.find(r => r.packId === 'jinx');
    assert.equal(jinx.mastery.level, 2);
    assert.deepEqual(jinx.skins.filter(s => s.unlocked).map(s => s.num), [0, 37]);
    assert.equal(jinx.skins.find(s => s.num === 37).current, true);
    assert.equal(jinx.next.mastery, 3);
    assert.equal(jinx.skins.find(s => s.num === 40).requirement, 'Achievement: coming soon');
    assert.equal(v.rows.find(r => r.packId === 'vi').mastery.level, 1);
    assert.equal(v.total, 3);
    assert.equal(requirementText({ mastery: 5 }), 'Mastery 5');
});
t('html: own profile gets clickable unlocked skins, visitors do not; locked ones show the requirement', () => {
    const v = buildChampionsView({ votes: votes({ vi: 4 }), packXp: { vi: 100 }, activePack: 'vi' });
    const own = championsHtml(v, { own: true }), other = championsHtml(v, { own: false });
    assert.match(own, /data-action="avatar" data-pack="vi" data-skin="29"/);
    assert.doesNotMatch(own, /data-skin="48"/);          // Arcane Brawler is locked at Mastery 2
    assert.doesNotMatch(other, /data-action=/);
    assert.match(other, /Mastery 10/); assert.match(other, /100%/); assert.match(other, /Vi_29\.jpg/);
    assert.match(championsHtml(buildChampionsView({}), {}), /No votes yet/);
});
t('names are escaped and the settings chip shows level, progress and next reward', () => {
    assert.match(masteryChipHtml('jinx', 150), /Mastery 2/);
    assert.match(masteryChipHtml('jinx', 150), /width:25%/);
    assert.match(masteryChipHtml('jinx', 150), /Crime City \+ Firecracker at Mastery 3/);
    assert.match(masteryChipHtml('vi', 99999), /All mastery skins unlocked/);
    assert.equal(masteryChipHtml('default', 50), '');
});
console.log(`\n${n} passed`);
