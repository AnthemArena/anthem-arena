// Profile "Champions" tab: how a person's votes spread across the companions, each companion's mastery and its skins.
// Pure (no Firebase, no DOM) so it can be tested: tools/test-champions-tab.mjs.
import { SKIN_UNLOCKS, masteryLevel, skinsFor, isSkinUnlocked, nextUnlock, resolveLook } from './champion-unlocks.js';
import { getChampionTileUrl } from './arcane-config.js';

export const PACK_ORDER = ['jinx', 'vi', 'caitlyn'];
const NAMES = { jinx: 'Jinx', vi: 'Vi', caitlyn: 'Caitlyn' };

const tile = (packId, num) => getChampionTileUrl(SKIN_UNLOCKS[packId].championId, num);

export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Votes per companion (a vote's `championId`; votes from before that was saved count as Jinx, the default).
// Percentages are whole numbers that add up to 100 (largest remainder).
export function voteShares(votes) {
    const counts = Object.fromEntries(PACK_ORDER.map(id => [id, 0]));
    for (const v of votes || []) { const id = PACK_ORDER.includes(v?.championId) ? v.championId : (v?.championId ? null : 'jinx'); if (id) counts[id]++; }
    const total = PACK_ORDER.reduce((s, id) => s + counts[id], 0);
    const rows = PACK_ORDER.map(id => {
        const exact = total ? (counts[id] / total) * 100 : 0;
        return { packId: id, votes: counts[id], percent: Math.floor(exact), rest: exact - Math.floor(exact) };
    });
    let left = total ? 100 - rows.reduce((s, r) => s + r.percent, 0) : 0;
    [...rows].sort((a, b) => b.rest - a.rest).forEach(r => { if (left > 0) { r.percent++; left--; } });
    return rows.map(({ rest, ...r }) => r).sort((a, b) => b.votes - a.votes || PACK_ORDER.indexOf(a.packId) - PACK_ORDER.indexOf(b.packId));
}

// Which skin is this avatar? 'jinx:37' for a Jinx skin tile, 'vi:0' for a plain champion picture, null for anything else.
export function avatarKeyOf(avatar) {
    if (!avatar || avatar.type !== 'url') return null;
    const m = /\/champion\/(?:tiles\/)?([A-Za-z]+?)(?:_(\d+))?\.(?:png|jpg)/.exec(String(avatar.value || ''));
    const id = m ? m[1].toLowerCase() : null;
    return id && PACK_ORDER.includes(id) ? `${id}:${m[2] ? Number(m[2]) : 0}` : null;
}

// The avatar object saved when someone picks a skin (same shape as the settings modal: type, value, name).
export function skinAvatar(packId, num) {
    return { type: 'url', value: tile(packId, num), name: SKIN_UNLOCKS[packId].championId, skin: num };
}

export function requirementText(skin, achievementNames = {}) {
    return skin.achievement ? `Achievement: ${achievementNames[skin.achievement] || 'coming soon'}` : `Mastery ${skin.mastery}`;
}

// view = { total, shares, rows } for one person.
export function buildChampionsView({ votes = [], packXp = {}, achievements = [], activePack = null, avatarKey = null, looks = {}, achievementNames = {} } = {}) {
    const shares = voteShares(votes);
    const rows = PACK_ORDER.map(id => {
        const mastery = masteryLevel(packXp[id]);
        const state = { level: mastery.level, achievements };
        const look = resolveLook(id, looks[id], state);
        const skins = skinsFor(id).map(s => ({
            ...s, unlocked: isSkinUnlocked(s, state), requirement: requirementText(s, achievementNames),
            current: avatarKey === `${id}:${s.num}`, look: look === s.num
        }));
        return {
            packId: id, name: NAMES[id], mastery, active: id === activePack, next: nextUnlock(id, mastery.level),
            unlockedCount: skins.filter(s => s.unlocked).length, skinCount: skins.length, skins,
            faceSkin: (skins.find(s => s.current) || skins[0]).num
        };
    });
    return { total: shares.reduce((s, r) => s + r.votes, 0), shares, rows };
}

export const FILTERS = [['unlocked', 'Unlocked'], ['locked', 'Locked'], ['all', 'All']];

// Unlocked skins first (lowest mastery first), then the locked ones in the order they will be earned (achievements last).
const earnOrder = s => (s.achievement ? 99 : s.mastery) * 1000 + s.num;

export function championsHtml(view, { own = false, filters = {} } = {}) {
    if (!view) return '';
    const byId = Object.fromEntries(view.rows.map(r => [r.packId, r]));
    const spread = view.total
        ? view.shares.map(s => `<div class="cm-share"><img class="cm-face" src="${escapeHtml(tile(s.packId, byId[s.packId].faceSkin))}" alt="" loading="lazy"><span class="cm-share-name">${escapeHtml(byId[s.packId].name)}</span><span class="cm-bar" role="img" aria-label="${s.percent}% of votes"><span style="width:${s.percent}%"></span></span><span class="cm-pct">${s.percent}%</span><span class="cm-votes">${s.votes} ${s.votes === 1 ? 'vote' : 'votes'}</span></div>`).join('')
        : `<p class="cm-empty">No votes yet. Votes are counted for the companion that was active when they were cast.</p>`;
    const cards = view.rows.map(r => {
        const m = r.mastery;
        const next = r.next ? `Next: ${r.next.skins.map(s => escapeHtml(s.name)).join(' + ')} at Mastery ${r.next.mastery}` : 'Every mastery skin unlocked';
        const filter = FILTERS.some(([k]) => k === filters[r.packId]) ? filters[r.packId] : 'unlocked';
        const shown = r.skins.filter(s => filter === 'all' || (filter === 'unlocked') === s.unlocked)
            .sort((a, b) => (filter === 'all' ? (b.unlocked - a.unlocked) : 0) || earnOrder(a) - earnOrder(b));
        const count = k => k === 'all' ? r.skinCount : k === 'unlocked' ? r.unlockedCount : r.skinCount - r.unlockedCount;
        const chips = `<div class="cm-filters" role="group" aria-label="Show ${escapeHtml(r.name)} skins">${FILTERS.map(([k, label]) => `<button type="button" class="cm-chip${k === filter ? ' on' : ''}" data-filter="${k}" data-pack="${r.packId}" aria-pressed="${k === filter}">${label} <span>${count(k)}</span></button>`).join('')}</div>`;
        const skins = shown.map(s => {
            const label = `${s.name}${s.unlocked ? '' : ` (${s.requirement})`}`;
            const buttons = own && s.unlocked
                ? `<span class="cm-skin-actions"><button type="button" class="cm-act${s.current ? ' on' : ''}" data-action="avatar" data-pack="${r.packId}" data-skin="${s.num}" aria-pressed="${s.current}" title="Use ${escapeHtml(s.name)} as my avatar">Avatar</button><button type="button" class="cm-act${s.look ? ' on' : ''}" data-action="look" data-pack="${r.packId}" data-skin="${s.num}" aria-pressed="${s.look}" title="Use ${escapeHtml(s.name)} as ${escapeHtml(r.name)}'s look in alerts">Look</button></span>`
                : (s.unlocked ? [s.current ? '<span class="cm-skin-tag">Avatar</span>' : '', s.look ? '<span class="cm-skin-tag">Look</span>' : ''].join('') : '');
            return `<div class="cm-skin${s.unlocked ? '' : ' locked'}${s.current ? ' current' : ''}${s.look ? ' look' : ''}"><img src="${escapeHtml(tile(r.packId, s.num))}" alt="" loading="lazy"><span class="cm-skin-name">${escapeHtml(s.name)}</span>${s.unlocked ? buttons : `<span class="cm-skin-lock" title="${escapeHtml(label)}">🔒 ${escapeHtml(s.requirement)}</span>`}</div>`;
        }).join('');
        return `<article class="cm-card${r.active ? ' active' : ''}" data-pack="${r.packId}">
            <header class="cm-head"><img class="cm-face big" src="${escapeHtml(tile(r.packId, r.faceSkin))}" alt="" loading="lazy">
              <div class="cm-head-text"><h3>${escapeHtml(r.name)}${r.active ? ' <span class="cm-active">Companion</span>' : ''}</h3>
              <div class="cm-level">Mastery ${m.level}${m.isMax ? ' · Max' : ''}</div>
              <div class="cm-bar thin" role="img" aria-label="${m.percent}% to the next mastery level"><span style="width:${m.percent}%"></span></div>
              <div class="cm-xp">${m.isMax ? `${m.xp.toLocaleString()} XP` : `${m.progressXp.toLocaleString()} / ${m.neededXp.toLocaleString()} XP to Mastery ${m.level + 1}`}</div></div></header>
            <p class="cm-next">${next} · ${r.unlockedCount}/${r.skinCount} skins</p>
            ${chips}
            <div class="cm-skins">${skins || `<p class="cm-empty">${filter === 'locked' ? 'Everything is unlocked.' : 'Nothing unlocked yet.'}</p>`}</div></article>`;
    }).join('');
    return `<section class="cm-spread" aria-label="Vote spread"><h3 class="cm-title">Vote spread</h3>${spread}</section><div class="cm-cards">${cards}</div>`;
}

// Mastery chip + thin bar + next reward for a companion card in the settings modal ('' for a pack without skins).
export function masteryChipHtml(packId, xp) {
    if (!SKIN_UNLOCKS[packId]) return '';
    const m = masteryLevel(xp), next = nextUnlock(packId, m.level);
    const hint = next ? `Next: ${next.skins.map(x => escapeHtml(x.name)).join(' + ')} at Mastery ${next.mastery}` : 'All mastery skins unlocked';
    return `<div class="champion-mastery"><span class="champion-mastery-level">Mastery ${m.level}${m.isMax ? ' · Max' : ''}</span><span class="champion-mastery-bar"><span style="width:${m.percent}%"></span></span><span class="champion-mastery-next">${hint}</span></div>`;
}
