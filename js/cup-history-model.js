// Pure helpers: what a voter did across every real cup. No DOM, no Firebase, so it runs in Node tests.
//
//   buildCupHistory({ votes, cups, matchesByCup }) -> { cups: [row...], lifetime }
//
// votes         the user's vote docs ({ matchId, tournament, choice: 'song1' | 'song2', timestamp })
// cups          entries from data/cups.json. Only these cups count, so test cups never appear.
// matchesByCup  { [cupId]: match[] } as returned by /api/matches?tournament=<cupId>. A cup may be missing (request failed).

// Under 1% would round to a flat 0%, which reads as nothing: show one decimal there.
const pctOf = (a, b) => { const x = (a / b) * 100; return x > 0 && x < 1 ? Math.max(0.1, Math.round(x * 10) / 10) : Math.round(x); };
const sideOf = (match, id) => (id && (id === match.song1?.id || id === 'song1') ? 1 : id && (id === match.song2?.id || id === 'song2') ? 2 : 0);
const cleanTitle = c => String(c?.shortTitle || c?.title || c?.name || '').replace(/\s*#\w+/g, '').trim();

export function buildCupHistory({ votes = [], cups = [], matchesByCup = {} } = {}) {
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
            const pick = { matchId, label: m.roundLabel || '', title: cleanTitle(comp), status: m.status, result: !won ? 'pending' : (won === mySide ? 'won' : 'lost'), timestamp: Number(v.timestamp || 0) };
            if (won) { decided++; if (won === mySide) correct++; }
            picks.push(pick);
            if (!lastPick || pick.timestamp > lastPick.timestamp) lastPick = pick;
        }
        picks.sort((a, b) => b.timestamp - a.timestamp);

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
const resultIcon = r => r === 'won' ? '<span class="ch-won" title="Your pick won">✓</span>' : r === 'lost' ? '<span class="ch-lost" title="Your pick lost">✕</span>' : '<span class="ch-pending" title="Not decided yet">·</span>';

export function renderCupHistory(history) {
    const l = history.lifetime;
    const title = '<h3 class="section-title"><i class="fas fa-clock-rotate-left"></i> Cup History</h3>';
    if (!history.cups.length) return title + '<p class="ch-empty">No cup history yet. Votes in a cup show up here, and stay here when the next cup starts.</p>';
    const head = `<div class="ch-lifetime">${stat(l.totalVotes, 'Votes cast')}${stat(l.cupsEntered, l.cupsEntered === 1 ? 'Cup entered' : 'Cups entered')}${l.avgParticipation === null ? '' : stat(l.avgParticipation + '%', 'Avg participation')}${l.accuracy === null ? '' : stat(l.accuracy + '%', 'Picks that won')}</div>`;
    const rows = history.cups.map(c => {
        const meta = [c.status === 'active' ? 'Live now' : 'Finished', c.participation === null ? null : `${c.participation}% of matches`, c.accuracy === null ? null : `${c.correct} of ${c.decided} picks won`].filter(Boolean).join(' · ');
        const picks = c.picks.slice(0, 20).map(p => `<li>${resultIcon(p.result)}<span class="ch-pick">${esc(p.title || 'Your pick')}</span><span class="ch-round">${esc(p.label)}</span></li>`).join('');
        return `<details class="ch-cup"${c.status === 'active' ? ' open' : ''}><summary><span class="ch-name">${esc(c.name)}</span><span class="ch-votes">${c.votes} ${c.votes === 1 ? 'vote' : 'votes'}</span><span class="ch-meta">${esc(meta)}</span></summary>${picks ? `<ul class="ch-picks">${picks}</ul>${c.picks.length > 20 ? `<p class="ch-more">Showing your latest 20 of ${c.picks.length}.</p>` : ''}` : ''}</details>`;
    }).join('');
    return title + head + rows;
}
