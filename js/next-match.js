// ========================================
// VOTE PAGE: "NEXT MATCH" HELPERS (pure: no DOM, no Firebase, so they are tested in Node)
// ========================================
// js/vote.js uses these to (a) list the live matches the visitor has not voted in yet and (b) show a "Next match" bar once they have voted.
// Matches from /api/matches carry `matchId` (not `id`), so every lookup goes through matchKey().
import { cleanTitle, shortTitle } from './title-clean.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESC[c]);

export const matchKey = m => (m && (m.matchId ?? m.id)) ?? null;

// Live matches the visitor has not voted in, excluding the one they are on, in play order starting just AFTER the current match
// (and wrapping round), so "Next match" really is the next one rather than always the first in the list.
//   hasVoted(matchId) -> boolean
export function unvotedLiveMatches(matches, { currentId = null, hasVoted = () => false } = {}) {
    const live = (Array.isArray(matches) ? matches : []).filter(m => m && m.status === 'live' && matchKey(m) != null);
    const at = live.findIndex(m => matchKey(m) === currentId);
    const ordered = at < 0 ? live : [...live.slice(at + 1), ...live.slice(0, at + 1)];
    return ordered.filter(m => matchKey(m) !== currentId && !hasVoted(matchKey(m)));
}

// The bar shown once the visitor has voted in the match they are on.
//   remaining: the list from unvotedLiveMatches(); next = remaining[0]
export function nextMatchBarHtml(remaining) {
    const n = remaining.length;
    if (!n) {
        return `
        <div class="next-bar-text"><strong>&#10003; You've voted in every live match</strong><span>Thanks! See how the groups are shaping up.</span></div>
        <a class="next-bar-btn" href="brackets">See the bracket</a>`;
    }
    const next = remaining[0];
    return `
        <div class="next-bar-text"><strong>${n} more ${n === 1 ? 'match needs' : 'matches need'} your vote</strong><span>${esc(shortTitle(next.song1?.shortTitle || next.song1?.title || 'TBD', 28))} vs ${esc(shortTitle(next.song2?.shortTitle || next.song2?.title || 'TBD', 28))}</span></div>
        <a class="next-bar-btn" href="vote?match=${encodeURIComponent(matchKey(next))}" data-next-match="${esc(matchKey(next))}">Next match &rarr;</a>`;
}
