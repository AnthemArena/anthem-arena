// ========================================
// CHAMPION SPEECH BUBBLE (vote page)
// ========================================
// The cup's champion (ARCANE_CONFIG.cupChampion) says one short line that fits where the viewer is:
// match not open yet, open and not voted, voted and ahead / behind / close, closing soon, finished and won / lost.
//
// Lines live in champion-packs/<id>.json under "bubble": { "<state>": ["line", ...] } with {placeholders}.
// A pack without a "bubble" block (or without a state) falls back to the plain lines below, so a new cup champion
// works on day one and only sounds like themselves once their lines are written.
//
// Rule: BEFORE the viewer has voted the line never says who is ahead (the page hides results until you vote).

import { ARCANE_CONFIG, getCupChampionId, getCompanionPack, getChampionTileUrl, getChampionImageUrl } from './arcane-config.js';

export const BUBBLE_STATES = [
    'upcoming', 'prevote', 'prevote-empty', 'closing-24h', 'closing-3h', 'closing-final',
    'voted-early', 'voted-ahead', 'voted-close', 'voted-tied', 'voted-behind',
    'closed-won', 'closed-lost', 'closed-tied', 'closed-unvoted'
];

const FALLBACK_LINES = {
    'upcoming': ['Not open yet. Check back soon.'],
    'prevote': ['Watch both, then pick the one that stays with you.'],
    'prevote-empty': ['No votes yet. Be the first.'],
    'closing-24h': ['Less than a day left to vote.'],
    'closing-3h': ['A few hours left. Make your call.'],
    'closing-final': ['Final hour. Vote now.'],
    'voted-early': ['You are one of the first to vote here.'],
    'voted-ahead': ['{pick} is ahead, {pct}% to {otherPct}%.'],
    'voted-close': ['Very close: {pct}% to {otherPct}%.'],
    'voted-tied': ['A perfect tie right now.'],
    'voted-behind': ['{pick} is behind, {pct}% to {otherPct}%.'],
    'closed-won': ['{pick} won. Nicely picked.'],
    'closed-lost': ['{pick} lost this one.'],
    'closed-tied': ['This one ended in a tie.'],
    'closed-unvoted': ['Voting is over. {winner} took it.']
};

const HOUR = 3600 * 1000;

/**
 * Decide which state the viewer is in. Pure: pass what the page knows, get a state name.
 * ctx: { status: 'upcoming'|'live'|'completed', hasVoted, pickVotes, otherVotes, total, endDate (ms or ISO), now,
 *        pickIsWinner (completed matches), tied (completed) }
 */
export function pickBubbleState(ctx) {
    const { status, hasVoted } = ctx;
    const total = ctx.total || 0;
    const now = ctx.now ?? Date.now();

    if (status === 'upcoming') return 'upcoming';

    if (status === 'completed') {
        if (!hasVoted) return 'closed-unvoted';
        if (ctx.tied) return 'closed-tied';
        return ctx.pickIsWinner ? 'closed-won' : 'closed-lost';
    }

    // open match
    if (!hasVoted) {
        // never reveal the standings before a vote: only the clock and "nobody has voted" are safe to talk about
        const end = ctx.endDate ? new Date(ctx.endDate).getTime() : NaN;
        if (Number.isFinite(end) && end > now) {
            const left = end - now;
            if (left <= 1 * HOUR) return 'closing-final';
            if (left <= 3 * HOUR) return 'closing-3h';
            if (left <= 24 * HOUR) return 'closing-24h';
        }
        return total === 0 ? 'prevote-empty' : 'prevote';
    }

    const pick = ctx.pickVotes || 0, other = ctx.otherVotes || 0;
    if (total <= 3) return 'voted-early';
    if (pick === other) return 'voted-tied';
    const pickPct = Math.round(pick / total * 100), otherPct = Math.round(other / total * 100);
    const diff = pickPct - otherPct;
    if (diff > 10) return 'voted-ahead';
    if (diff < -10) return 'voted-behind';
    return 'voted-close';
}

/** "Bro tried to rizz Jinx 💀 - JINX EDIT || Britney Spears - Toxic" -> "Bro tried to rizz Jinx 💀" (first part, short). */
export function shortName(name, max = 34) {
    const first = String(name || '').split(/\s+[-–—]\s+|\s*\|\|?\s*/)[0].trim() || String(name || '').trim();
    return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first;
}

export function fillPlaceholders(line, vars) {
    return String(line).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
}

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/** The lines for a state from a pack, or the plain fallback. */
export function linesFor(pack, state) {
    const own = pack?.bubble?.[state];
    return Array.isArray(own) && own.length ? own : (FALLBACK_LINES[state] || []);
}

/**
 * Choose a line. The same match + state always starts on the same line (no flicker when the page refreshes);
 * `bump` moves to the next one (the viewer tapped the portrait).
 */
export function chooseLine(pack, state, vars, seed = '', bump = 0) {
    const lines = linesFor(pack, state);
    if (!lines.length) return '';
    const i = (hash(`${seed}|${state}`) + bump) % lines.length;
    return fillPlaceholders(lines[i], vars).replace(/\s{2,}/g, ' ').trim();
}

// ---------------- DOM ----------------

const packCache = new Map();
async function fetchPack(id) {
    if (packCache.has(id)) return packCache.get(id);
    let pack = null;
    try {
        const res = await fetch(`/champion-packs/${encodeURIComponent(id)}.json`);
        if (res.ok) pack = await res.json();
    } catch (e) { /* the bubble just uses the plain lines */ }
    packCache.set(id, pack);
    return pack;
}

let bump = 0, lastKey = '', lastCtx = null, wired = false;

/**
 * Show / update the bubble in `#champion-bubble`.
 * ctx = what pickBubbleState needs, plus { matchId, pickName, otherName, winnerName }.
 */
export async function renderChampionBubble(ctx) {
    const root = document.getElementById('champion-bubble');
    if (!root) return;
    lastCtx = ctx;

    const championId = getCupChampionId();
    const pack = await fetchPack(championId);
    const state = pickBubbleState(ctx);

    const total = ctx.total || 0;
    const pickPct = total ? Math.round((ctx.pickVotes || 0) / total * 100) : 0;
    const otherPct = total ? Math.round((ctx.otherVotes || 0) / total * 100) : 0;
    const vars = {
        pick: shortName(ctx.pickName), other: shortName(ctx.otherName), winner: shortName(ctx.winnerName),
        pct: pickPct, otherPct, diff: Math.abs(pickPct - otherPct), total
    };

    const key = `${ctx.matchId}|${state}`;
    if (key !== lastKey) { bump = 0; lastKey = key; }
    const text = chooseLine(pack, state, vars, ctx.matchId || '', bump);
    if (!text) { root.hidden = true; return; }

    const textEl = root.querySelector('.cb-text');
    const img = root.querySelector('.cb-portrait img');
    const meta = getCompanionPack(championId);
    const skin = pack?.portrait?.skin ?? 0;
    const champ = meta?.championId || 'Jinx';
    if (img && !img.dataset.ready) {
        img.dataset.ready = '1';
        img.alt = pack?.name || champ;
        img.onerror = () => { img.onerror = null; img.src = getChampionImageUrl(champ); };
        img.src = getChampionTileUrl(champ, skin);
    }
    root.dataset.state = state;
    if (textEl && textEl.textContent !== text) textEl.textContent = text;
    root.hidden = false;

    if (!wired) {
        wired = true;
        root.querySelector('.cb-portrait')?.addEventListener('click', () => {
            if (!lastCtx) return;
            bump += 1;
            renderChampionBubble(lastCtx);
        });
    }
}
