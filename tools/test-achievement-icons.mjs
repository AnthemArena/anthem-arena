// Achievement icons: every general achievement has a drawn icon, rarity rings, locked state, fallbacks.   node tools/test-achievement-icons.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GENERAL_ACHIEVEMENTS, RARITY_INFO } from '../js/achievements.js';
import { ACHIEVEMENT_ICONS, ACHIEVEMENT_RING, hasAchievementIcon, achievementBadgeHtml } from '../js/achievement-icons.js';
import { achievementCardHtml } from '../js/achievements-view-model.js';
import { achievementToastHtml } from '../js/notification-visuals.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const general = Array.isArray(GENERAL_ACHIEVEMENTS) ? GENERAL_ACHIEVEMENTS : Object.values(GENERAL_ACHIEVEMENTS);

t('every general achievement has a drawn icon, and no icon is for an unknown achievement', () => {
    const ids = new Set(general.map(a => a.id));
    for (const id of ids) assert.ok(hasAchievementIcon(id), `missing icon: ${id}`);
    for (const id of Object.keys(ACHIEVEMENT_ICONS)) assert.ok(ids.has(id), `icon for unknown achievement: ${id}`);
});
t('all icons are different from each other', () => {
    const shapes = Object.values(ACHIEVEMENT_ICONS);
    assert.equal(new Set(shapes).size, shapes.length);
});
t('a ring colour exists for every rarity in use', () => {
    for (const r of Object.keys(RARITY_INFO)) assert.ok(ACHIEVEMENT_RING[r], r);
});
t('badge: decorative, sized, ringed by rarity', () => {
    const h = achievementBadgeHtml('first-choice', 'rare', { size: 44 });
    assert.match(h, /aria-hidden="true"/); assert.match(h, /width:44px;height:44px/); assert.match(h, new RegExp(ACHIEVEMENT_RING.rare)); assert.match(h, /ach-badge--rare/);
});
t('locked badge is greyed and carries a lock', () => {
    const h = achievementBadgeHtml('first-choice', 'rare', { locked: true });
    assert.match(h, /ach-badge--locked/); assert.match(h, /ach-badge-lock/);
    assert.ok(!achievementBadgeHtml('first-choice', 'rare').includes('ach-badge-lock'));
});
t('an achievement with no drawn icon (a champion one) gets nothing from the badge', () => {
    assert.equal(achievementBadgeHtml('jinx-loose-cannon', 'epic'), ''); assert.equal(achievementBadgeHtml(undefined), '');
});
t('profile card: drawn badge for general, the old icon for the rest, lock when locked', () => {
    const base = { name: 'X', description: 'd', rarity: 'rare', xp: 10, skins: [], progress: null };
    assert.match(achievementCardHtml({ ...base, id: 'night-owl', icon: '🌙', unlocked: true }), /ach-badge--rare/);
    assert.ok(!achievementCardHtml({ ...base, id: 'night-owl', icon: '🌙', unlocked: true }).includes('🌙'));
    assert.match(achievementCardHtml({ ...base, id: 'night-owl', icon: '🌙', unlocked: false }), /ach-badge-lock/);
    const champ = achievementCardHtml({ ...base, id: 'jinx-loose-cannon', icon: '💣', unlocked: true });
    assert.ok(champ.includes('💣') && !champ.includes('ach-badge'));
});
t('unlock pop-up shows the badge when it knows the achievement id, else the picture it was given', () => {
    const args = { icon: 'https://x/y.png', name: 'Night Owl', line: 'hi', xp: '20', rarity: 'uncommon', description: 'd', items: [], jinxSrc: '', accent: '#f0f', cta: '' };
    assert.match(achievementToastHtml({ achievementId: 'night-owl' }, args), /ach-badge--uncommon/);
    assert.ok(!achievementToastHtml({}, args).includes('ach-badge--'));
});
t('the unlock pop-up gets the id, and the modal and profile list use the badge', () => {
    assert.ok(read('js/achievement-tracker.js').includes('achievementId: achievement.id'));
    assert.ok(read('js/champion-modal.js').includes('achievementBadgeHtml(a.id'));
    assert.ok(read('js/profile-page.js').includes('achievementBadgeHtml(ach.id'));
});
console.log(`\n${n} passed`);
