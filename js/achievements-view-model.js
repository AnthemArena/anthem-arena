// ========================================
// ACHIEVEMENTS TAB: what to show (pure, no DOM, no Firebase)
// ========================================
// Sections: General first, then one per champion that has achievements. Own profile: locked ones are shown too (greyed, with
// progress when the numbers are known; hidden ones only as a count). Someone else's profile: unlocked only, so nothing is
// spoiled and no private progress is needed.
// Tested in tools/test-achievements-view-model.mjs.

import { GENERAL_ACHIEVEMENTS } from './achievements.js';
import { CHAMPION_ACHIEVEMENTS } from './champion-achievements/index.js';
import { skinsForAchievement } from './vote-progress.js';

const RARITY_ORDER = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
const capital = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

const byRarityThenXp = (a, b) => (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0) || (b.xp || 0) - (a.xp || 0);

function item(a, unlocked, stats) {
    let progress = null;
    if (!unlocked && stats && typeof a.progress === 'function') {
        try { const p = a.progress(stats); if (p && p.target > 0) progress = { current: Math.min(p.current || 0, p.target), target: p.target }; } catch (e) { /* no progress */ }
    }
    return {
        id: a.id, name: a.name, description: a.description, icon: a.icon, rarity: a.rarity, xp: a.xp || 0,
        unlocked, hidden: !!a.hidden, champion: a.champion || null,
        skins: skinsForAchievement(a.id), progress
    };
}

function section(key, title, list, have, own, stats) {
    const unlockedItems = list.filter(a => have.has(a.id)).map(a => item(a, true, stats)).sort(byRarityThenXp);
    const locked = own ? list.filter(a => !have.has(a.id)) : [];
    const lockedShown = locked.filter(a => !a.hidden).map(a => item(a, false, stats)).sort(byRarityThenXp);
    return {
        key, title, unlocked: unlockedItems.length, total: list.length,
        items: [...unlockedItems, ...lockedShown],
        hiddenLeft: locked.filter(a => a.hidden).length
    };
}

// unlockedIds: from the profile. own: viewing your own profile. stats: calculateAchievementStats() output (own only, optional).
// packName(id): display name of a champion.
export function buildAchievementsView({ unlockedIds = [], own = false, stats = null, packName = capital } = {}) {
    const have = new Set(unlockedIds);
    const sections = [section('general', 'General', Object.values(GENERAL_ACHIEVEMENTS), have, own, stats)];
    for (const [packId, list] of Object.entries(CHAMPION_ACHIEVEMENTS)) {
        const all = Object.values(list);
        if (!all.length) continue;
        const s = section(packId, packName(packId), all, have, own, stats);
        // someone else's profile: only champions they have earned something with; own profile: every champion
        if (own || s.unlocked > 0) sections.push(s);
    }
    // ids saved on the profile that no longer exist in the code are ignored (they used to render as "undefined")
    const known = new Set([...Object.keys(GENERAL_ACHIEVEMENTS), ...Object.values(CHAMPION_ACHIEVEMENTS).flatMap(l => Object.keys(l))]);
    const unlockedKnown = [...have].filter(id => known.has(id)).length;
    return { sections, unlockedTotal: unlockedKnown };
}

// ---------- HTML (pure, so it is tested without a browser) ----------
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function achievementCardHtml(it) {
    const isUrl = typeof it.icon === 'string' && /^(https?:)?\//.test(it.icon);
    const icon = isUrl
        ? `<img src="${esc(it.icon)}" alt="" class="achievement-icon-img" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.textContent='\u{1F3C6}';">`
        : esc(it.icon);
    const skinNote = it.skins.length ? `<div class="ach-skin-note">Unlocks the ${it.skins.map(s => esc(s.name)).join(', ')} skin</div>` : '';
    const progress = !it.unlocked && it.progress
        ? `<div class="ach-progress" role="progressbar" aria-valuenow="${it.progress.current}" aria-valuemin="0" aria-valuemax="${it.progress.target}"><span style="width:${Math.round((it.progress.current / it.progress.target) * 100)}%"></span></div>
           <div class="ach-progress-text">${it.progress.current} / ${it.progress.target}</div>`
        : '';
    return `
        <div class="achievement-card${it.unlocked ? '' : ' achievement-card--locked'}">
            <div class="achievement-header">
                <div class="achievement-icon">${icon}</div>
                <div class="achievement-info">
                    <div class="achievement-name">${esc(it.name)}</div>
                    <span class="achievement-rarity ${esc(it.rarity)}">${esc(it.rarity)}</span>
                </div>
            </div>
            <div class="achievement-description">${esc(it.skins.length ? it.description.replace(/\.?\s*Unlocks .*$/, '') : it.description)}</div>
            ${progress}
            ${skinNote}
            <div class="achievement-xp">${it.unlocked ? '+' + it.xp + ' XP' : it.xp + ' XP to earn'}</div>
        </div>`;
}

export function renderAchievementsHtml(view) {
    return view.sections.map(sec => `
        <section class="ach-section" data-section="${esc(sec.key)}">
            <div class="ach-section-head">
                <h3>${esc(sec.title)}</h3>
                <span class="ach-section-count">${sec.unlocked} / ${sec.total}</span>
            </div>
            <div class="achievements-grid">${sec.items.map(achievementCardHtml).join('')}</div>
            ${sec.hiddenLeft ? `<p class="ach-hidden-note">${sec.hiddenLeft} hidden achievement${sec.hiddenLeft === 1 ? '' : 's'} left to discover</p>` : ''}
        </section>`).join('');
}
