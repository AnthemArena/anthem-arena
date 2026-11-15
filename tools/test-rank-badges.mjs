// Level badges: tiers, one icon per level, clean titles, and the places that show them.   node tools/test-rank-badges.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rankTier, rankBadgeHtml, cleanRankTitle, RANK_NAMES, RANK_TIER_COLORS } from '../js/rank-badges.js';
import { RANK_SYSTEM } from '../js/rank-system.js';
import { levelLeadHtml, levelUpToastHtml } from '../js/notification-visuals.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

t('tiers follow RANK_SYSTEM.tiers for every level', () => {
    const names = { BRONZE: 'bronze', SILVER: 'silver', GOLD: 'gold', LEGEND: 'legend' };
    for (const [k, tier] of Object.entries(RANK_SYSTEM.tiers)) for (const lv of tier.levels) assert.equal(rankTier(lv), names[k], `level ${lv}`);
});
t('tier colours match the rank tiers', () => {
    assert.equal(RANK_TIER_COLORS.bronze.toLowerCase(), RANK_SYSTEM.tiers.BRONZE.color.toLowerCase());
    assert.equal(RANK_TIER_COLORS.silver.toLowerCase(), RANK_SYSTEM.tiers.SILVER.color.toLowerCase());
    assert.equal(RANK_TIER_COLORS.gold.toLowerCase(), RANK_SYSTEM.tiers.GOLD.color.toLowerCase());
    assert.equal(RANK_TIER_COLORS.legend.toLowerCase(), RANK_SYSTEM.tiers.LEGEND.color.toLowerCase());
});
t('all 10 levels have a different icon', () => {
    const icons = RANK_SYSTEM.levels.map(l => rankBadgeHtml(l.level).match(/<svg[^>]*>(.*)<\/svg>/)[1]);
    assert.equal(icons.length, 10); assert.equal(new Set(icons).size, 10);
    assert.ok(icons.every(i => i.length > 20));
});
t('rank names here match the level titles in rank-system.js', () => {
    RANK_SYSTEM.levels.forEach((l, i) => assert.equal(cleanRankTitle(l.title), RANK_NAMES[i]));
});
t('a badge is decorative (hidden from screen readers) and sized as asked', () => {
    const h = rankBadgeHtml(2, 36);
    assert.match(h, /aria-hidden="true"/); assert.match(h, /width:36px;height:36px/);
});
t('odd levels are clamped to 1-10', () => {
    assert.equal(rankBadgeHtml(0), rankBadgeHtml(1)); assert.equal(rankBadgeHtml(99), rankBadgeHtml(10)); assert.equal(rankBadgeHtml('x'), rankBadgeHtml(1));
});
t('cleanRankTitle drops emoji and keeps the words', () => {
    assert.equal(cleanRankTitle('🛤️ Undercity Regular'), 'Undercity Regular');
    assert.equal(cleanRankTitle('✨ New Arrival'), 'New Arrival');
    assert.equal(cleanRankTitle('Streetwise'), 'Streetwise');
    assert.equal(cleanRankTitle(''), ''); assert.equal(cleanRankTitle(null), '');
    assert.equal(cleanRankTitle('🔥'), '🔥');
});
t('the level-up card shows the badge, "Level N" and the title without its emoji', () => {
    assert.match(levelLeadHtml(2, '#f0f'), /rank-badge--bronze/);
    assert.match(levelLeadHtml(2, '#f0f'), /aria-label="Level 2"/);
    const card = levelUpToastHtml({}, { level: 2, rank: '🛤️ Undercity Regular', nextText: '', line: 'hi', jinxSrc: '', accent: '#f0f', cta: '' });
    assert.ok(card.includes('Undercity Regular') && !card.includes('🛤'));
});
t('the post-vote modal and the level texts use the badge and clean title', () => {
    const modal = read('js/champion-modal.js');
    assert.ok(modal.includes('rankBadgeHtml(rank.currentLevel.level') && modal.includes('cleanRankTitle(rank.currentLevel.title)'));
    assert.ok(read('js/rank-system.js').includes("You've reached ${cleanRankTitle("));
});
console.log(`\n${n} passed`);
