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
    assert.match(own, /data-action="use" data-pack="vi" data-skin="29"/);
    assert.doesNotMatch(own, /data-action="(avatar|look)"/);
    assert.doesNotMatch(own, /data-skin="48"/);          // Arcane Brawler is locked at Mastery 2
    assert.doesNotMatch(other, /data-action=/);
    assert.match(other, /100%/); assert.match(other, /Vi_29\.jpg/);
    assert.match(championsHtml(v, { filters: { vi: 'locked' } }), /Mastery 10/);
    assert.match(championsHtml(buildChampionsView({}), {}), /No votes yet/);
});
t('filters: unlocked by default, locked in the order they are earned, all lists unlocked first', () => {
    const v = buildChampionsView({ packXp: { vi: 100 }, activePack: 'vi' });
    const grid = (h) => { const c = h.split('data-pack="vi">')[1].split('<article')[0]; return [...c.matchAll(/class="cm-skin-name">([^<]+)/g)].map(m => m[1]); };
    const names = f => grid(championsHtml(v, { filters: { vi: f } }));
    assert.deepEqual(names(undefined), ['Classic', 'Arcane Undercity']);
    const locked = names('locked');
    assert.equal(locked.length, 12); assert.equal(locked[0], 'Neon Strike'); assert.equal(locked.at(-1), 'Arcane Brawler');
    const all = names('all');
    assert.equal(all.length, 14); assert.deepEqual(all.slice(0, 2), ['Classic', 'Arcane Undercity']);
    assert.match(championsHtml(v, { filters: { vi: 'locked' } }), /data-filter="locked" data-pack="vi" aria-pressed="true">Locked <span>12<\/span>/);
    assert.match(championsHtml(buildChampionsView({ packXp: { vi: 99999 } }), { filters: { vi: 'locked' } }), /Everything is unlocked/);
});
t('look: Arcane by default once unlocked, a chosen look wins, shown as pressed', () => {
    const v = buildChampionsView({ packXp: { jinx: 1700 }, looks: {} });
    assert.equal(v.rows[0].skins.find(s => s.look).num, 37);
    const w = buildChampionsView({ packXp: { jinx: 1700 }, looks: { jinx: 13 }, avatarKey: 'jinx:13' });
    assert.equal(w.rows[0].skins.find(s => s.look).num, 13);
    assert.match(championsHtml(w, { own: true }), /class="cm-act on" data-action="use" data-pack="jinx" data-skin="13" aria-pressed="true" title="[^"]*">In use/);
    assert.equal(buildChampionsView({}).rows[0].skins.find(s => s.look).num, 0);
});
t('names are escaped and the settings chip shows level, progress and next reward', () => {
    assert.match(masteryChipHtml('jinx', 150), /Mastery 2/);
    assert.match(masteryChipHtml('jinx', 150), /width:25%/);
    assert.match(masteryChipHtml('jinx', 150), /Crime City \+ Firecracker at Mastery 3/);
    assert.match(masteryChipHtml('vi', 99999), /All mastery skins unlocked/);
    assert.equal(masteryChipHtml('default', 50), '');
});
console.log(`\n${n} passed`);
