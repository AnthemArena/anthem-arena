// Pure model for sharing a match from the vote page: which situation the viewer is in, the champion's wording for it,
// and the links for each share target. No DOM here (tested in tools/test-match-share.mjs); js/vote.js draws the panel.
// Wording lives in champion-packs/<id>.json under "share" (a few lines per kind); the plain lines below are the fallback.
import { fillPlaceholders, shortName } from './champion-bubble.js';

export const SHARE_KINDS = ['invite', 'voted', 'early', 'tied', 'nailbiter', 'losing-close', 'losing-bad', 'winning-close', 'dominating'];

// Which placeholders each kind may use ({a}/{b} = the two edits, {pick}/{other} = viewer's pick and the other one)
export const SHARE_VARS = {
    invite: ['a', 'b'],
    voted: ['pick', 'other'],
    early: ['pick', 'other', 'total'],
    tied: ['pick', 'other'],
    nailbiter: ['pick', 'other', 'voteDiff'],
    'losing-close': ['pick', 'other', 'voteDiff'],
    'losing-bad': ['pick', 'other', 'voteDiff'],
    'winning-close': ['pick', 'other', 'pct'],
    dominating: ['pick', 'other', 'pct']
};

const FALLBACK = {
    invite: ['{a} or {b}? Two Arcane edits, one vote. Pick a side on Arcane Moments.'],
    voted: ['I backed {pick} over {other} on Arcane Moments. Who gets your vote?'],
    early: ['One of the first votes on {pick} versus {other}. Come and add yours.'],
    tied: ['{pick} and {other} are dead level. Your vote breaks the tie.'],
    nailbiter: ['{pick} and {other} are {voteDiff} votes apart. Every vote counts here.'],
    'losing-close': ['{pick} is {voteDiff} behind {other} and can still win. Help it out.'],
    'losing-bad': ['{pick} is losing to {other} by {voteDiff}. It needs backup.'],
    'winning-close': ['{pick} leads {other} at {pct}%, but it is still close. Vote and help hold it.'],
    dominating: ['{pick} is dominating {other} at {pct}%. Come and pick a side.']
};

/** Which kind of share applies. Numbers are only used once the viewer has voted (results stay hidden until then). */
export function shareKind({ hasVoted, status, pickVotes = 0, otherVotes = 0, total = 0 }) {
    if (!hasVoted) return 'invite';
    if (status === 'completed') return 'voted';
    const diff = Math.abs(pickVotes - otherVotes);
    if (total < 10) return 'early';
    if (diff === 0) return 'tied';
    if (diff <= 2) return 'nailbiter';
    if (pickVotes < otherVotes) return diff <= 5 ? 'losing-close' : 'losing-bad';
    const sum = pickVotes + otherVotes || 1;
    const pctDiff = Math.abs(pickVotes - otherVotes) / sum * 100;
    return pctDiff <= 10 ? 'winning-close' : 'dominating';
}

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const enc = encodeURIComponent;
const nm = (n, max) => shortName(n, max).replace(/[\s.!?…]+$/, '');    // no trailing punctuation: the line adds its own

export function shareLines(pack, kind) {
    const own = pack?.share?.[kind];
    return Array.isArray(own) && own.length ? own : (FALLBACK[kind] || FALLBACK.voted);
}

/**
 * ctx: { kind, pack, matchId, a, b, pick, other, pickVotes, otherVotes, total, origin, seed, bump }
 * Returns { kind, url, text, copyText, targets: { x, reddit, whatsapp, facebook } }
 */
export function buildMatchShare(ctx) {
    const kind = SHARE_KINDS.includes(ctx.kind) ? ctx.kind : 'voted';
    const lines = shareLines(ctx.pack, kind);
    const diff = Math.abs((ctx.pickVotes || 0) - (ctx.otherVotes || 0));
    const sum = (ctx.pickVotes || 0) + (ctx.otherVotes || 0);
    const vars = {
        a: nm(ctx.a, 40), b: nm(ctx.b, 40),
        pick: nm(ctx.pick, 40), other: nm(ctx.other, 40),
        voteDiff: diff, total: ctx.total || sum,
        pct: sum ? Math.round(Math.max(ctx.pickVotes, ctx.otherVotes) / sum * 100) : 50
    };
    const i = (hash(`${ctx.seed || ctx.matchId || ''}|${kind}`) + (ctx.bump || 0)) % lines.length;
    const text = fillPlaceholders(lines[i], vars).replace(/\s{2,}/g, ' ').trim();
    const base = String(ctx.origin || '').replace(/\/$/, '');
    const url = `${base}/vote?match=${enc(ctx.matchId)}&ref=share`;
    return { kind, url, text, copyText: `${text} ${url}`, targets: targetsFor(text, url) };
}

// Same text, rebuilt after the viewer edits it in the box
export function targetsFor(text, url) {
    return {
        x: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
        reddit: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(String(text).slice(0, 280))}`,
        whatsapp: `https://wa.me/?text=${enc(text + ' ' + url)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`
    };
}
