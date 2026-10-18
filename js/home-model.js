// ========================================
// HOME MODEL - pure helpers for the homepage (index.html)
// ========================================
import { computeStats } from './stats-model.js';
import { shortTitle } from './title-clean.js';

// the same rule as the gallery: an edit that has entered a cup and may be embedded
export const isEntered = e => !!e && Array.isArray(e.tournaments) && e.tournaments.length > 0
    && e.status !== 'removed' && e.status !== 'blocked' && e.embedAllowed !== false;

export const editCard = e => ({ id: e.id || e.videoId, videoId: e.videoId || '', title: shortTitle(e.shortTitle || e.title || '', 60),
    creator: e.artist || '', uploadDate: e.uploadDate || '', views: e.views || 0, likes: e.likes || 0 });

export function newestEdits(edits = [], n = 6) {
    return edits.filter(isEntered).sort((a, b) => String(b.uploadDate || '').localeCompare(String(a.uploadDate || ''))).slice(0, n).map(editCard);
}
export function mostWatched(edits = [], n = 6) {
    return edits.filter(isEntered).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, n).map(editCard);
}

const side = m => (m.winnerId && (m.winnerId === m.song1?.id || m.winnerId === 'song1') ? 1 : m.winnerId && (m.winnerId === m.song2?.id || m.winnerId === 'song2') ? 2 : 0);
const comp = c => ({ id: c?.id || '', videoId: c?.videoId || '', title: shortTitle(c?.shortTitle || c?.title || '', 60), creator: c?.artist || '' });
const votesOf = m => (m.song1?.votes || 0) + (m.song2?.votes || 0);
const endMs = m => { const t = Date.parse(m.endDate || m.endTime || ''); return Number.isFinite(t) ? t : null; };

// matches -> everything the homepage shows about the cup
export function homeState(matches = [], now = Date.now()) {
    const list = (Array.isArray(matches) ? matches : []).filter(m => m && m.song1 && m.song2);
    const stats = computeStats(list);
    const live = list.filter(m => m.status === 'live');
    const completed = list.filter(m => m.status === 'completed');
    const final = completed.find(m => /^final$/i.test(m.roundLabel || '') && side(m));

    const featuredRaw = [...live].sort((a, b) => votesOf(b) - votesOf(a))[0] || null;
    const future = live.map(endMs).filter(t => t && t > now).sort((a, b) => a - b);

    const recent = completed.map((m, i) => ({ m, i, t: endMs(m) ?? 0 }))
        .sort((a, b) => b.t - a.t || b.i - a.i).slice(0, 4)
        .map(({ m }) => { const w = side(m); return { matchId: m.matchId, label: m.roundLabel || '', total: votesOf(m),
            winner: w ? comp(w === 1 ? m.song1 : m.song2) : null, loser: w ? comp(w === 1 ? m.song2 : m.song1) : null }; });

    // finished matches only: an edit's total in a live match would show who is ahead before people have voted
    const doneStats = computeStats(completed);
    const topVoted = doneStats.rows.filter(r => r.votes > 0).sort((a, b) => b.votes - a.votes).slice(0, 6)
        .map(r => ({ id: r.id, videoId: r.videoId, title: r.title, creator: r.creator, votes: r.votes }));

    return {
        phase: !list.length ? 'soon' : final ? 'finished' : live.length ? 'live' : completed.length ? 'between' : 'upcoming',
        liveCount: live.length, completed: completed.length, total: list.length,
        votes: stats.totalVotes, editCount: stats.editCount,
        featured: featuredRaw ? { matchId: featuredRaw.matchId, label: featuredRaw.roundLabel || '', total: votesOf(featuredRaw),
            a: comp(featuredRaw.song1), b: comp(featuredRaw.song2), closesAt: endMs(featuredRaw) } : null,
        closesAt: future[0] || null,
        recent, topVoted,
        champion: final ? comp(side(final) === 1 ? final.song1 : final.song2) : null
    };
}

export function countdownText(targetMs, now = Date.now()) {
    if (!targetMs) return '';
    const s = Math.floor((targetMs - now) / 1000);
    if (s <= 0) return 'closing now';
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${Math.max(m, 1)}m`;
}
