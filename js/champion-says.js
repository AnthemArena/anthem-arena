// ========================================
// THE CUP CHAMPION ON OTHER PAGES (live page, brackets page, empty states)
// ========================================
// The same speech bubble as the vote page (css .champion-bubble), with a line that fits where the visitor is on THAT page.
// Pure helpers (pickLiveState, pickBracketsState, chooseSay, formatLeft) are unit-tested in Node (tools/test-champion-says.mjs);
// mountSay() is the only DOM part.
//
// Lines live in champion-packs/<id>.json under "pages": { "<state>": ["line", ...] } with {placeholders}
// ({unvoted} {voted} {live} {timeLeft}). A pack without "pages" (or a state) uses the plain lines below.

import { getCupChampionId, getCompanionPack, getChampionTileUrl, getChampionImageUrl } from './arcane-config.js';
import { fillPlaceholders, loadChampionPack } from './champion-bubble.js';

export const SAY_STATES = [
    'live-fresh', 'live-some', 'live-few', 'live-one', 'live-closing', 'live-done', 'live-none',
    'brackets-groups', 'brackets-knockout-soon', 'brackets-knockout-live', 'brackets-bracket', 'brackets-complete', 'brackets-empty'
];

const FALLBACK_LINES = {
    'live-fresh': ['{unvoted} matches are open. Pick a side.'],
    'live-some': ['{voted} done, {unvoted} to go.'],
    'live-few': ['Only {unvoted} left to vote in.'],
    'live-one': ['One match left to vote in.'],
    'live-closing': ['Some matches close in {timeLeft}. {unvoted} still need your vote.'],
    'live-done': ['You have voted in every live match.'],
    'live-none': ['No matches are live right now. Check back soon.'],
    'brackets-groups': ['Groups come first. The top two from each go through.'],
    'brackets-knockout-soon': ['The knockout starts once the groups finish.'],
    'brackets-knockout-live': ['The knockout is live. One loss and you are out.'],
    'brackets-bracket': ['Follow the bracket round by round.'],
    'brackets-complete': ['The cup is finished. Thanks for voting.'],
    'brackets-empty': ['No bracket yet. The draw has not happened.']
};

const HOUR = 3600 * 1000;

/** "2h 10m", "45m", "30s": the time left, short. */
export function formatLeft(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0m';
    const m = Math.floor(ms / 60000);
    if (m < 1) return `${Math.max(1, Math.floor(ms / 1000))}s`;
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return r ? `${h}h ${r}m` : `${h}h`;
    const d = Math.floor(h / 24), hh = h % 24;
    return hh ? `${d}d ${hh}h` : `${d}d`;
}

/**
 * Live page. ctx: { live (live matches), unvoted, voted, msLeft (earliest deadline among the matches NOT yet voted in, or null) }
 */
export function pickLiveState(ctx = {}) {
    const live = ctx.live || 0, unvoted = ctx.unvoted || 0, voted = ctx.voted || 0;
    if (live === 0) return 'live-none';
    if (unvoted === 0) return 'live-done';
    if (Number.isFinite(ctx.msLeft) && ctx.msLeft > 0 && ctx.msLeft <= 6 * HOUR) return 'live-closing';
    if (unvoted === 1) return 'live-one';
    if (unvoted <= 3) return 'live-few';
    return voted === 0 ? 'live-fresh' : 'live-some';
}

/**
 * Brackets page. ctx: { empty, isGroupCup, knockoutBuilt, stage ('groups'|'knockout'), anyLive, finished }
 */
export function pickBracketsState(ctx = {}) {
    if (ctx.empty) return 'brackets-empty';
    if (ctx.finished) return 'brackets-complete';
    if (ctx.isGroupCup) {
        if (!ctx.knockoutBuilt) return ctx.stage === 'knockout' ? 'brackets-knockout-soon' : 'brackets-groups';
        return ctx.stage === 'groups' ? 'brackets-groups' : 'brackets-knockout-live';
    }
    return 'brackets-bracket';
}

export function saysFor(pack, state) {
    const own = pack?.pages?.[state];
    return Array.isArray(own) && own.length ? own : (FALLBACK_LINES[state] || []);
}

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/** One line. Same page + state + seed starts on the same line (no flicker on refresh); `bump` moves on (the visitor tapped the portrait). */
export function chooseSay(pack, state, vars = {}, seed = '', bump = 0) {
    const lines = saysFor(pack, state);
    if (!lines.length) return '';
    return fillPlaceholders(lines[(hash(`${seed}|${state}`) + bump) % lines.length], vars).replace(/\s{2,}/g, ' ').trim();
}

// ---------------- DOM ----------------

const mounted = new WeakMap();   // element -> { bump, last }

/**
 * Show (or update) the champion's line in `host`'s bubble. `place(el)` puts a NEW bubble into the page the first time.
 *   opts: { id, state, vars, seed, place }
 * Returns the bubble element, or null if there is nothing to say.
 */
export async function mountSay(opts) {
    const { id, state, vars = {}, seed = '', place } = opts;
    const championId = getCupChampionId();
    const pack = await loadChampionPack(championId);

    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.className = 'champion-bubble champion-say';
        el.innerHTML = '<button type="button" class="cb-portrait" aria-label="Hear another line"><img alt="" width="60" height="60"></button>'
            + '<div class="cb-speech" role="status" aria-live="polite"><p class="cb-text"></p></div>';
        if (typeof place === 'function') place(el);
        else document.body.appendChild(el);
        const portrait = el.querySelector('.cb-portrait');
        mounted.set(el, { bump: 0, last: null });
        portrait.addEventListener('click', () => {
            const s = mounted.get(el);
            s.bump += 1;
            if (s.last) mountSay(s.last);
        });
    }
    const s = mounted.get(el) || { bump: 0, last: null };
    mounted.set(el, s);
    if (s.last && s.last.state !== state) s.bump = 0;
    s.last = opts;

    const text = chooseSay(pack, state, vars, seed, s.bump);
    if (!text) { el.hidden = true; return null; }

    const meta = getCompanionPack(championId);
    const champ = meta?.championId || 'Jinx';
    const img = el.querySelector('.cb-portrait img');
    if (img && !img.dataset.ready) {
        img.dataset.ready = '1';
        img.alt = pack?.name || champ;
        img.onerror = () => { img.onerror = null; img.src = getChampionImageUrl(champ); };
        img.src = getChampionTileUrl(champ, pack?.portrait?.skin ?? 0);
    }
    el.dataset.state = state;
    const textEl = el.querySelector('.cb-text');
    if (textEl && textEl.textContent !== text) textEl.textContent = text;
    el.hidden = false;
    return el;
}
