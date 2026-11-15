// Pure helpers: what a voter did across every real cup. No DOM, no Firebase, so it runs in Node tests.
//
//   buildCupHistory({ votes, cups, matchesByCup }) -> { cups: [row...], lifetime }
//
// votes         the user's vote docs ({ matchId, tournament, choice: 'song1' | 'song2', timestamp })
// cups          entries from data/cups.json. Only these cups count, so test cups never appear.
// viewer        { isOwner, viewerVoted(matchId) } of whoever is looking; with it, picks in open matches that viewer may not see come back
//               as { locked: true, label, matchNumber } with no title at all. Without it (tests, owner) everything is shown.
// matchesByCup  { [cupId]: match[] } as returned by /api/matches?tournament=<cupId>. A cup may be missing (request failed).

import { voteLocked, lockedLabel } from './profile-visibility.js';

// Under 1% would round to a flat 0%, which reads as nothing: show one decimal there.
const pctOf = (a, b) => { const x = (a / b) * 100; return x > 0 && x < 1 ? Math.max(0.1, Math.round(x * 10) / 10) : Math.round(x); };
const sideOf = (match, id) => (id && (id === match.song1?.id || id === 'song1') ? 1 : id && (id === match.song2?.id || id === 'song2') ? 2 : 0);
const cleanTitle = c => String(c?.shortTitle || c?.title || c?.name || '').replace(/\s*#\w+/g, '').trim();

export function buildCupHistory({ votes = [], cups = [], matchesByCup = {}, viewer = null } = {}) {
    const listed = new Map((cups || []).map(c => [c.id, c]));
    const byCup = new Map();
    for (const v of votes || []) {
        if (!v || !listed.has(v.tournament)) continue;
        if (!byCup.has(v.tournament)) byCup.set(v.tournament, new Map());
        byCup.get(v.tournament).set(v.matchId, v);          // one vote per match
    }

    const rows = [];
    for (const cup of cups || []) {
        const mine = byCup.get(cup.id);
        if (!mine || !mine.size) continue;                   // cups the user never voted in are not history
        const matches = matchesByCup[cup.id];
        const known = Array.isArray(matches) && matches.length > 0;
        const index = new Map((known ? matches : []).map(m => [m.matchId || m.id, m]));
        // Matches that have opened: a cup still building its later rounds should not count them against the voter.
        const real = known ? matches.filter(m => m.song1?.id !== 'TBD' && m.song2?.id !== 'TBD' && m.status !== 'upcoming') : [];

        let decided = 0, correct = 0, lastPick = null;
        const picks = [];
        for (const [matchId, v] of mine) {
            const m = index.get(matchId);
            if (!m) continue;
            const mySide = sideOf(m, v.choice);
            const comp = mySide === 1 ? m.song1 : mySide === 2 ? m.song2 : null;
            const won = m.status === 'completed' ? sideOf(m, m.winnerId) : 0;
            if (viewer && voteLocked(m, { isOwner: viewer.isOwner, viewerVoted: viewer.viewerVoted?.(matchId) })) {
                picks.push({ matchId, locked: true, label: m.roundLabel || '', matchNumber: Number(m.matchNumber) || 0, status: m.status, result: 'pending', timestamp: Number(v.timestamp || 0) });
                continue;                                  // no title, no side: nothing about the pick is built
            }
            const pick = { matchId, label: m.roundLabel || '', title: cleanTitle(comp), status: m.status, result: !won ? 'pending' : (won === mySide ? 'won' : 'lost'), timestamp: Number(v.timestamp || 0) };
            if (won) { decided++; if (won === mySide) correct++; }
            picks.push(pick);
            if (!lastPick || pick.timestamp > lastPick.timestamp) lastPick = pick;
        }
        // readable picks newest first; locked ones last, by match number (their order says nothing about the pick)
        picks.sort((a, b) => (a.locked ? 1 : 0) - (b.locked ? 1 : 0) || (a.locked ? a.matchNumber - b.matchNumber : b.timestamp - a.timestamp));

        const total = real.length;
        rows.push({
            id: cup.id, name: cup.name || cup.id, status: cup.status || 'complete', startDate: cup.startDate || null, champion: cup.champion || null,
            votes: mine.size,
            totalMatches: total || null,
            participation: total ? Math.min(100, pctOf(mine.size, total)) : null,
            decided, correct,
            accuracy: decided ? Math.round(correct / decided * 100) : null,
            picks
        });
    }

    // Newest cup first.
    rows.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));

    const withPct = rows.filter(r => r.participation !== null);
    const decided = rows.reduce((s, r) => s + r.decided, 0), correct = rows.reduce((s, r) => s + r.correct, 0);
    return {
        cups: rows,
        lifetime: {
            totalVotes: rows.reduce((s, r) => s + r.votes, 0),
            cupsEntered: rows.length,
            avgParticipation: withPct.length ? pctOf(withPct.reduce((s, r) => s + r.participation, 0), withPct.length * 100) : null,
            accuracy: decided ? Math.round(correct / decided * 100) : null,
            decided
        }
    };
}

// ---- HTML (pure string building, so it is testable in Node) ----
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stat = (value, label) => `<div class="ch-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
const resultIcon = (r, own = true) => r === 'won' ? `<span class="ch-won" title="${own ? 'Your' : 'Their'} pick won">✓</span>` : r === 'lost' ? `<span class="ch-lost" title="${own ? 'Your' : 'Their'} pick lost">✕</span>` : '<span class="ch-pending" role="img" aria-label="Not decided yet" title="Not decided yet"><i class="fas fa-hourglass-half" aria-hidden="true"></i></span>';

export function renderCupHistory(history, { own = true } = {}) {
    const l = history.lifetime;
    const title = '<h3 class="section-title"><i class="fas fa-clock-rotate-left"></i> Cup History</h3>';
    if (!history.cups.length) return title + '<p class="ch-empty">No cup history yet. Votes in a cup show up here, and stay here when the next cup starts.</p>';
    const head = `<div class="ch-lifetime">${stat(l.totalVotes, 'Votes cast')}${l.cupsEntered > 1 ? stat(l.cupsEntered, 'Cups entered') : ''}${l.accuracy === null ? '' : stat(l.accuracy + '%', 'Picks that won')}</div>`;
    const rows = history.cups.map(c => {
        const meta = [c.status === 'active' ? 'Live now' : 'Finished', c.totalMatches ? `${Math.min(c.votes, c.totalMatches)} of ${c.totalMatches} voted` : null, c.accuracy === null ? null : `${c.correct} of ${c.decided} picks won`].filter(Boolean).join(' · ');
        const pickWord = own ? 'Your pick' : 'Their pick';
        const picks = c.picks.slice(0, 20).map(p => p.locked
            ? `<li class="ch-locked"><span class="ch-pending" aria-hidden="true"><i class="fas fa-lock"></i></span><span class="ch-pick">Voted in ${esc(lockedLabel({ roundLabel: p.label, matchNumber: p.matchNumber }, c.name))}</span></li>`
            : `<li>${resultIcon(p.result, own)}<span class="ch-pick"><em class="ch-yours">${pickWord}</em> ${esc(p.title || pickWord)}</span><span class="ch-round">${esc(p.label)}</span></li>`).join('');
        return `<details class="ch-cup"${c.status === 'active' ? ' open' : ''}><summary><span class="ch-name">${esc(c.name)}</span><span class="ch-votes">${c.votes} ${c.votes === 1 ? 'vote' : 'votes'}</span><span class="ch-meta">${esc(meta)}</span>${c.totalMatches ? `<span class="ch-bar" role="progressbar" aria-label="${esc(c.name)} matches voted" aria-valuenow="${Math.min(c.votes, c.totalMatches)}" aria-valuemin="0" aria-valuemax="${c.totalMatches}"><span class="ch-bar-fill" style="width:${Math.min(100, Math.round(Math.min(c.votes, c.totalMatches) / c.totalMatches * 100))}%"></span></span>` : ''}</summary>${picks ? `<ul class="ch-picks">${picks}</ul>${c.picks.length > 20 ? `<p class="ch-more">Showing your latest 20 of ${c.picks.length}.</p>` : ''}` : ''}</details>`;
    }).join('');
    return title + head + rows;
}
