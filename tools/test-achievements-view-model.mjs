import assert from 'node:assert/strict';
import { buildAchievementsView, renderAchievementsHtml } from '../js/achievements-view-model.js';
import { GENERAL_ACHIEVEMENTS } from '../js/achievements.js';

const generalIds = Object.keys(GENERAL_ACHIEVEMENTS);

// someone else's profile: unlocked only, champion sections only when earned
let v = buildAchievementsView({ unlockedIds: [generalIds[0], 'caitlyn-close-calls', 'gone-forever'], own: false });
assert.deepEqual(v.sections.map(s => s.key), ['general', 'caitlyn']);
assert.equal(v.sections[0].items.length, 1); assert.equal(v.sections[0].total, generalIds.length);
assert.equal(v.sections[1].items[0].id, 'caitlyn-close-calls');
assert.equal(v.sections[1].items[0].champion, 'caitlyn');
assert.deepEqual(v.sections[1].items[0].skins.map(s => s.name), ['Prestige Arcade']);
assert.equal(v.unlockedTotal, 2);                                   // the unknown id is not counted or shown
assert.ok(!JSON.stringify(v).includes('gone-forever'));
assert.equal(v.sections[0].hiddenLeft, 0);

// own profile: every champion, locked visible ones greyed with progress, hidden ones as a count
v = buildAchievementsView({ unlockedIds: [], own: true, stats: { totalVotes: 3, underdogVotes: 4, byChampion: { caitlyn: { closeVotes: 4, streak: 2 } } } });
assert.deepEqual(v.sections.map(s => s.key), ['general', 'jinx', 'caitlyn']);
const caitlyn = v.sections[2];
assert.equal(caitlyn.items.length, 3);
assert.ok(caitlyn.items.every(i => !i.unlocked));
const close = caitlyn.items.find(i => i.id === 'caitlyn-close-calls');
assert.deepEqual(close.progress, { current: 4, target: 10 });
const general = v.sections[0];
assert.equal(general.hiddenLeft, generalIds.filter(id => GENERAL_ACHIEVEMENTS[id].hidden).length);
assert.ok(general.items.every(i => !i.hidden), 'hidden locked achievements are never listed');

// no stats: no progress, no crash
v = buildAchievementsView({ unlockedIds: [], own: true });
assert.ok(v.sections.every(s => s.items.every(i => i.progress === null)));

// unlocked first, then by rarity
v = buildAchievementsView({ unlockedIds: ['caitlyn-close-calls', 'caitlyn-deciding-shot'], own: true });
assert.deepEqual(v.sections[2].items.map(i => i.id).slice(0, 2), ['caitlyn-deciding-shot', 'caitlyn-close-calls']);
assert.equal(v.sections[2].items[2].unlocked, false);

// html
let html = renderAchievementsHtml(buildAchievementsView({ unlockedIds: ['caitlyn-close-calls'], own: true, stats: { byChampion: { caitlyn: { closeVotes: 1, streak: 1 } } } }));
assert.match(html, /data-section="caitlyn"/); assert.match(html, /Unlocks the Prestige Arcade skin/);
assert.match(html, /achievement-card--locked/); assert.match(html, /ach-progress-text">1 \/ 7/);
assert.match(html, /hidden achievements? left to discover/);
assert.ok(!/description">[^<]*Unlocks/.test(html), 'the skin is named once, in the note');
html = renderAchievementsHtml({ sections: [{ key: 'x', title: '<b>T</b>', unlocked: 1, total: 1, hiddenLeft: 0, items: [{ id: 'a', name: '<i>N</i>', description: 'd', icon: 'https://x/y.png', rarity: 'epic', xp: 5, unlocked: true, skins: [], progress: null }] }] });
assert.ok(!html.includes('<b>T') && !html.includes('<i>N')); assert.match(html, /<img src="https:\/\/x\/y.png"/);
console.log('achievements view model tests passed');
