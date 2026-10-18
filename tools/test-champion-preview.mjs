import assert from 'node:assert/strict';
import { PREVIEW_STEPS, buildPreview } from '../js/champion-preview.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const voice = {
    alert: (type, d) => ({ message: `${type} line`, detail: `${type} detail ${d.userPct ?? ''}`, cta: `${type} button` }),
    achievement: (id) => ({ message: `${id} line`, detail: `${id} detail`, cta: `${id} button` }),
    custom: (type) => ({ message: `${type} line`, detail: 'd', cta: 'c' })
};
const dismiss = () => 'closed';

t('seven different events, in the order they are cycled', () => {
    assert.deepEqual(PREVIEW_STEPS.map(s => s.id), ['nailbiter', 'winning', 'comeback', 'welcome', 'achievement', 'level-up', 'mastery-up']);
});
t('every sample uses the champion\'s voice, only closes on click and never points at a page', () => {
    for (let i = 0; i < PREVIEW_STEPS.length; i++) {
        const { bulletin, step } = buildPreview(i, { voice, packId: 'vi', dismiss });
        assert.equal(typeof bulletin.ctaAction, 'function', step.id);
        assert.equal(bulletin.ctaAction(), 'closed', step.id);
        assert.ok(!('targetUrl' in bulletin) && !('ctaUrl' in bulletin) && bulletin.action !== 'navigate', step.id);
        assert.ok(String(bulletin.message).length > 0 && /line|Mastery|Welcome|Achievement|rank/i.test(bulletin.message), step.id);
        assert.ok(bulletin.cta, step.id);
    }
});
t('match samples carry the shapes the alert cards read', () => {
    const b = buildPreview(0, { voice, packId: 'jinx', dismiss }).bulletin;
    assert.equal(b.type, 'nailbiter'); assert.equal(b.matchId, 'preview'); assert.equal(b.userPct, 49); assert.equal(b.opponentPct, 51);
    assert.equal(b.message, 'nailbiter line'); assert.equal(b.detail, 'nailbiter detail 49'); assert.equal(b.cta, 'nailbiter button');
});
t('achievement and level-up use the real alert types', () => {
    const a = buildPreview(4, { voice, packId: 'jinx', dismiss }).bulletin;
    assert.equal(a.type, 'achievement'); assert.equal(a.achievementName, 'Spark'); assert.equal(a.rarity, 'common');
    const l = buildPreview(5, { voice, packId: 'jinx', dismiss }).bulletin;
    assert.equal(l.type, 'level-up'); assert.equal(l.level, 5);
});
t('mastery-up lists the skins that mastery 3 unlocks for that champion, with splash art', () => {
    const m = buildPreview(6, { voice, packId: 'jinx', dismiss }).bulletin;
    assert.equal(m.type, 'mastery-up'); assert.equal(m.detail, 'Unlocked: Crime City, Firecracker');
    assert.deepEqual(m.strip.thumbs, ['https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jinx_1.jpg', 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jinx_2.jpg']);
    assert.equal(buildPreview(6, { voice, packId: 'vi', dismiss }).bulletin.detail, 'Unlocked: Neon Strike, Officer');
});
t('the index wraps round and tolerates junk', () => {
    assert.equal(buildPreview(7, { voice, packId: 'vi', dismiss }).step.id, 'nailbiter');
    assert.equal(buildPreview(-1, { voice, packId: 'vi', dismiss }).step.id, 'mastery-up');
    assert.equal(buildPreview('x', { voice, packId: 'vi', dismiss }).number, 1);
});
t('with no voice found the cards still say something', () => {
    const none = { alert: () => null, achievement: () => null, custom: () => null };
    for (let i = 0; i < PREVIEW_STEPS.length; i++) assert.ok(buildPreview(i, { voice: none, packId: 'caitlyn', dismiss }).bulletin.message);
});
console.log(`\n${n} passed`);
