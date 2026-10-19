// ========================================
// POST-VOTE MODAL: the cup champion's reply to a vote (vote page)
// ========================================
// Pure helpers (no DOM, no Firebase), unit-tested in Node (tools/test-champion-modal.mjs).
// js/vote.js gathers what it knows about the vote, calls these, and puts the HTML in #vote-modal.
//
// Lines live in champion-packs/<id>.json under "modal": { "<key>": ["line", ...] } with {placeholders} ({pick} {streak}).
// A pack without a "modal" block uses the plain lines below, so any champion works on day one.

import { fillPlaceholders } from './champion-bubble.js';

export const MODAL_KEYS = ['first-vote', 'streak', 'underdog', 'early', 'close', 'behind', 'ahead', 'default'];

const FALLBACK_LINES = {
    'first-vote': ['Your first vote. Welcome in.'],
    'streak': ['{streak} days in a row. Thanks for coming back.'],
    'underdog': ['You backed the underdog. Bold.'],
    'early': ['One of the first votes here. Thanks for starting it off.'],
    'close': ['This one is close. Your vote matters.'],
    'behind': ['{pick} is behind, but there is time left.'],
    'ahead': ['{pick} is ahead. Thanks for voting.'],
    'default': ['Vote recorded. Thanks!']
};

// Which kind of vote was this? First match wins: who you are (first vote, streak) before what the match looks like,
// and "early" before "close" because in the first hours of a match every vote is close.
//   v: { isFirstEver, streak, isUnderdog, isEarly, situationType }  (situationType is the vote page's own)
export function pickModalKey(v = {}) {
    if (v.isFirstEver) return 'first-vote';
    if ((v.streak || 0) >= 2) return 'streak';
    if (v.isUnderdog) return 'underdog';
    if (v.isEarly) return 'early';
    const s = v.situationType;
    if (s === 'tied' || s === 'nailbiter' || s === 'losing-close' || s === 'winning-close') return 'close';
    if (s === 'losing-bad') return 'behind';
    if (s === 'dominating') return 'ahead';
    return 'default';
}

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

export function modalLinesFor(pack, key) {
    const own = pack?.modal?.[key];
    return Array.isArray(own) && own.length ? own : (FALLBACK_LINES[key] || FALLBACK_LINES.default);
}

/** One line for this vote; the same match + key always gives the same line. */
export function chooseModalLine(pack, key, vars = {}, seed = '') {
    const lines = modalLinesFor(pack, key);
    return fillPlaceholders(lines[hash(`${seed}|${key}`) % lines.length], vars).replace(/\s{2,}/g, ' ').trim();
}

// small tag beside "You voted for ...": what the old modal showed as its big heading
export const TAG_FOR_KEY = {
    'first-vote': 'First vote', 'streak': 'On a streak', 'underdog': 'Underdog pick', 'early': 'Early voter',
    'close': 'Close match', 'behind': 'Fighting for it', 'ahead': 'In the lead', 'default': ''
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESC[c]);

/**
 * The modal's HTML.
 * view: { situationType, line, tag, championName, portraitUrl, splashUrl, voteTitle, songNameRaw, shareContext,
 *         xp: { totalXP, baseXP, bonuses: [{type, xp}] }, rank, next: { href, label } | null, bracketHref, kofiUrl }
 */
const capital = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
const isUrl = t => /^(https?:)?\//.test(String(t || ''));

// What this vote changed beyond the vote XP: level-up, mastery and the things unlocked (see js/vote-progress.js).
// progress: buildProgressSummary(); skin entries may carry a `thumb` image url.
export function buildProgressHtml(progress, championName = '') {
    if (!progress) return '';
    const parts = [];
    if (progress.levelUp) {
        parts.push(`<div class="pvm-up pvm-up--level"><span class="pvm-up-tag">Level up</span> <strong>Level ${progress.levelUp.from} &rarr; ${progress.levelUp.to}</strong> <span class="pvm-up-sub">${esc(progress.levelUp.title)}</span></div>`);
    }
    const m = progress.mastery;
    if (m) {
        const name = esc(championName || capital(m.packId));
        const raised = (progress.masteryUps || []).find(x => x.packId === m.packId);
        const bar = m.isMax
            ? `<div class="pvm-level-next">Top mastery reached</div>`
            : `<div class="pvm-bar pvm-bar--mastery" role="progressbar" aria-valuenow="${m.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${m.percent}%"></span></div>
               <div class="pvm-level-next">${m.progressXp.toLocaleString()} / ${m.neededXp.toLocaleString()} XP to mastery ${m.level + 1}${m.nextSkins.length ? ` &middot; unlocks ${esc(m.nextSkins.map(x => x.name).join(', '))}` : ''}</div>`;
        parts.push(`<div class="pvm-mastery${raised ? ' pvm-mastery--up' : ''}">
            <span class="pvm-level-title">${name} mastery <small>Level ${m.level}</small>${raised ? ` <span class="pvm-up-tag">Up from ${raised.from}</span>` : ''}</span>${bar}</div>`);
    }
    const items = [];
    for (const mu of progress.masteryUps || []) {
        for (const sk of mu.skins || []) {
            items.push(`<li class="pvm-unlock pvm-unlock--skin">
                ${sk.thumb ? `<img class="pvm-unlock-img" src="${esc(sk.thumb)}" alt="" width="44" height="44" loading="lazy">` : '<span class="pvm-unlock-icon" aria-hidden="true">&#127917;</span>'}
                <span class="pvm-unlock-text"><strong>New skin: ${esc(sk.name)}</strong><small>${esc(capital(mu.packId))} mastery ${mu.to}</small></span>
                <button type="button" class="pvm-wear" data-wear-pack="${esc(mu.packId)}" data-wear-skin="${Number(sk.num)}">Wear it</button></li>`);
        }
    }
    for (const a of progress.achievements || []) {
        const icon = isUrl(a.icon) ? `<img class="pvm-unlock-img" src="${esc(a.icon)}" alt="" width="44" height="44" loading="lazy" onerror="this.outerHTML='<span class=&quot;pvm-unlock-icon&quot; aria-hidden=&quot;true&quot;>&#127942;</span>'">` : `<span class="pvm-unlock-icon" aria-hidden="true">${esc(a.icon || '\u{1F3C6}')}</span>`;
        const skinLine = (a.skins || []).map(sk => `Unlocks the ${esc(sk.name)} skin for ${esc(capital(sk.packId))}`).join('; ');
        const wear = (a.skins || [])[0];
        items.push(`<li class="pvm-unlock pvm-unlock--achievement${a.rarity ? ` pvm-unlock--${esc(a.rarity)}` : ''}">
            ${icon}
            <span class="pvm-unlock-text"><strong>Achievement: ${esc(a.name)}</strong><small>${a.xp ? `+${a.xp} XP` : 'Profile badge'}${skinLine ? ` &middot; ${skinLine}` : ''}</small></span>
            ${wear ? `<button type="button" class="pvm-wear" data-wear-pack="${esc(wear.packId)}" data-wear-skin="${Number(wear.num)}">Wear it</button>` : ''}</li>`);
    }
    if (items.length) {
        parts.push(`<div class="pvm-unlocked"><div class="pvm-unlocked-title">Unlocked</div><ul class="pvm-unlock-list">${items.join('')}</ul>${(progress.achievements || []).length ? '<a class="pvm-unlock-link" href="/profile#achievements">See all achievements</a>' : ''}</div>`);
    }
    return parts.join('');
}

export function buildPostVoteModalHtml(view) {
    const xp = view.xp || { totalXP: 0, baseXP: 0, bonuses: [] };
    const progress = view.progress || null;
    const shownXp = progress ? progress.totalXp : xp.totalXP;
    const rank = view.rank || { currentLevel: { title: '', level: 1 }, nextLevel: null };
    const chips = [`<span class="pvm-chip">+${xp.baseXP} vote</span>`]
        .concat((xp.bonuses || []).map(b => `<span class="pvm-chip pvm-chip--bonus">+${b.xp} ${esc(b.type)}</span>`))
        .concat(progress && progress.achievementXp ? [`<span class="pvm-chip pvm-chip--bonus">+${progress.achievementXp} achievements</span>`] : []).join('');
    const level = rank.nextLevel
        ? `<div class="pvm-bar" role="progressbar" aria-valuenow="${Math.round(rank.progressPercentage || 0)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${rank.progressPercentage || 0}%"></span></div>
           <div class="pvm-level-next">${(rank.progressXP || 0).toLocaleString()} / ${(rank.xpForNextLevel || 0).toLocaleString()} XP to level ${rank.nextLevel.level}</div>`
        : `<div class="pvm-level-next">Maximum level reached</div>`;

    const primary = view.next
        ? `<a class="pvm-btn pvm-btn--primary" href="${esc(view.next.href)}">${esc(view.next.label || 'Next match')} <span aria-hidden="true">&rarr;</span></a>`
        : `<a class="pvm-btn pvm-btn--primary" href="${esc(view.bracketHref || 'brackets')}">See the bracket <span aria-hidden="true">&rarr;</span></a>`;

    const share = `
        <div class="pvm-share" role="group" aria-label="Share this match">
            <span class="pvm-share-label">Share</span>
            <div class="pvm-share-box" data-share-box></div>
            <a class="pvm-kofi" href="${esc(view.kofiUrl || 'https://ko-fi.com/arcanemoments')}" target="_blank" rel="noopener noreferrer">Support on Ko-fi</a>
        </div>`;

    return `
        <div class="modal-overlay" onclick="closePostVoteModal()"></div>
        <div class="modal-content post-vote-content pvm ${esc(view.situationType || '')}" role="dialog" aria-modal="true" aria-label="Vote recorded">
            <button class="modal-close" onclick="closePostVoteModal()" aria-label="Close">&times;</button>
            <div class="pvm-hero"${view.splashUrl ? ` style="--pvm-splash:url('${esc(view.splashUrl)}')"` : ''}>
                <div class="pvm-hero-row">
                    ${view.portraitUrl ? `<img class="pvm-portrait" src="${esc(view.portraitUrl)}" alt="${esc(view.championName || '')}" width="64" height="64">` : ''}
                    <div class="pvm-speech"><p class="pvm-line">${esc(view.line)}</p></div>
                </div>
            </div>
            <div class="pvm-body">
                <p class="pvm-voted">You voted for <strong>${esc(view.voteTitle)}</strong>${view.tag ? ` <span class="pvm-tag">${esc(view.tag)}</span>` : ''}</p>
                <div class="pvm-xp">
                    <div class="pvm-xp-row"><span class="pvm-xp-total">+${shownXp} XP</span><span class="pvm-chips">${chips}</span></div>
                    <div class="pvm-level"><span class="pvm-level-title">${esc(rank.currentLevel.title)} <small>Level ${rank.currentLevel.level}</small></span></div>
                    ${level}
                    ${buildProgressHtml(progress, view.championName)}
                </div>
                <div class="pvm-actions">
                    ${primary}
                    <a class="pvm-btn pvm-btn--ghost" href="/matches.html">View all matches</a>
                </div>
                ${share}
            </div>
        </div>`;
}


/**
 * The slim "share" version of the modal (opened from an alert button): the champion's face and line, then the share box.
 * view: { line, championName, portraitUrl, splashUrl, heading }  (the line is the share text itself: the champion says it, the buttons send it)
 */
export function buildShareModalHtml(view) {
    return `
        <div class="modal-overlay" onclick="closePostVoteModal()"></div>
        <div class="modal-content post-vote-content pvm pvm--share" role="dialog" aria-modal="true" aria-label="Share this match">
            <button class="modal-close" onclick="closePostVoteModal()" aria-label="Close">&times;</button>
            <div class="pvm-hero"${view.splashUrl ? ` style="--pvm-splash:url('${esc(view.splashUrl)}')"` : ''}>
                <div class="pvm-hero-row">
                    ${view.portraitUrl ? `<img class="pvm-portrait" src="${esc(view.portraitUrl)}" alt="${esc(view.championName || '')}" width="64" height="64">` : ''}
                    <div class="pvm-speech"><p class="pvm-line">${esc(view.line)}</p></div>
                </div>
            </div>
            <div class="pvm-body">
                <p class="pvm-voted"><strong>${esc(view.heading || 'Share the match and rally support')}</strong></p>
                <div class="pvm-share-box" data-share-box></div>
            </div>
        </div>`;
}
