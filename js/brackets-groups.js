// ========================================
// BRACKETS PAGE: GROUP STAGE VIEW (pure: builds HTML strings, touches no DOM, so it is tested in Node)
// ========================================
// js/brackets.js calls these when a cup has a group stage (see describeCup in js/group-builder.js).
// A single-elimination cup never reaches this file's output, so its page is unchanged.
import { allGroupStandings } from './group-builder.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESC[c]);

// One entry per group, in group order: its standings table, its matches, and where it is up to.
//   state: 'live' (a match is open), 'complete' (all 6 closed), 'idle' (nothing open: upcoming, or between matches)
export function buildGroupViews(matches) {
    const byGroup = new Map();
    for (const m of matches.filter(m => m.stage === 'group')) {
        if (!byGroup.has(m.group)) byGroup.set(m.group, []);
        byGroup.get(m.group).push(m);
    }
    return allGroupStandings(matches).map(g => {
        const list = (byGroup.get(g.name) || []).slice().sort((a, b) => a.matchNumber - b.matchNumber);
        const live = list.filter(m => m.status === 'live').length;
        return {
            name: g.name, index: g.index, rows: g.rows, complete: g.complete, unresolvedTie: g.unresolvedTie,
            matches: list, played: list.filter(m => m.status === 'completed').length, live,
            state: live ? 'live' : g.complete ? 'complete' : 'idle'
        };
    });
}

export const groupCounts = views => ({
    all: views.length,
    live: views.filter(v => v.state === 'live').length,
    complete: views.filter(v => v.state === 'complete').length
});

const thumb = song => song?.videoId ? `https://img.youtube.com/vi/${encodeURIComponent(song.videoId)}/mqdefault.jpg` : '';
const short = song => song?.shortTitle || song?.title || 'TBD';

function rowHtml(row, rank, complete) {
    const qualifies = rank <= 2;
    // "Qualified" / "Out" are only said once the group is finished; before that the top two are just highlighted
    const badge = !complete ? '' : qualifies
        ? '<span class="gs-pill gs-pill-in">Qualified</span>'
        : '<span class="gs-pill gs-pill-out">Out</span>';
    const share = row.votesFor + row.votesAgainst ? `${Math.round(row.share * 100)}%` : '–';
    const seed = row.seed != null ? `Seed ${row.seed}` : '';
    return `
        <tr class="gs-row${qualifies ? ' gs-in-position' : ''}${complete && !qualifies ? ' gs-out' : ''}" data-rank="${rank}">
            <td class="gs-rank">${rank}</td>
            <td class="gs-edit" title="${esc([short(row.competitor), row.artist, seed].filter(Boolean).join(' · '))}">
                ${row.competitor?.videoId ? `<img class="gs-thumb" src="${thumb(row.competitor)}" alt="" loading="lazy">` : '<span class="gs-thumb gs-thumb-empty"></span>'}
                <span class="gs-edit-text">
                    <span class="gs-title">${esc(short(row.competitor))}</span>
                    ${row.artist ? `<span class="gs-creator">${esc(row.artist)}</span>` : ''}
                </span>
            </td>
            <td class="gs-num" data-label="W-L">${row.wins}-${row.losses}</td>
            <td class="gs-num gs-share" data-label="Share">${share}</td>
            <td class="gs-flag">${badge}</td>
        </tr>`;
}

// The voter's pick in a match: 'song1' | 'song2' | null. opts.userChoice(matchId) returns it (from localStorage on the page).
// Older callers pass only opts.userVoted(matchId) (a yes/no): that still counts as voted, with no side to mark.
function pickOf(m, opts) {
    const choice = opts.userChoice ? opts.userChoice(m.matchId) : null;
    const side = choice === 'song1' || choice === 'song2' ? choice : null;
    const voted = !!side || !!(opts.userChoice ? choice : opts.userVoted && opts.userVoted(m.matchId));
    return { side, voted };
}

function matchRowHtml(m, opts) {
    const done = m.status === 'completed', live = m.status === 'live';
    const { side, voted } = pickOf(m, opts);
    const showPct = done || voted;
    const total = m.totalVotes || ((m.song1?.votes || 0) + (m.song2?.votes || 0));
    const pct = song => (showPct && total > 0) ? `<b class="gs-pct">${Math.round(((song.votes || 0) / total) * 100)}%</b>` : '';
    const win1 = done && m.winnerId === m.song1.id, win2 = done && m.winnerId === m.song2.id;
    // the voter's pick is marked with a tick; in a live match the other edit is dimmed (a finished match keeps its winner styling)
    const sideClass = (n, win) => `gs-side${win ? ' gs-win' : ''}${side === n ? ' gs-picked' : ''}${live && side && side !== n ? ' gs-dimmed' : ''}`;
    const tick = n => side === n ? '<span class="gs-check" title="Your vote" aria-label="Your vote">&#10003;</span>' : '';
    const tag = done ? '<span class="gs-tag gs-tag-done">Final</span>'
        : live && voted ? '<span class="gs-tag gs-tag-voted">&#10003; Voted</span>'
        : live ? '<span class="gs-tag gs-tag-live"><span class="live-dot"></span>Vote</span>'
        : '<span class="gs-tag gs-tag-soon">Soon</span>';
    return `
        <li class="gs-match ${esc(m.status)}${voted ? ' gs-voted' : ''}">
            <a href="vote?match=${encodeURIComponent(m.matchId)}" data-match-id="${esc(m.matchId)}" data-status="${esc(m.status)}"${voted ? ' data-voted="true"' : ''}>
                <span class="${sideClass('song1', win1)}">${tick('song1')}<span class="gs-side-name">${esc(short(m.song1))}</span>${pct(m.song1)}</span>
                <span class="gs-vs">vs</span>
                <span class="${sideClass('song2', win2)}">${tick('song2')}<span class="gs-side-name">${esc(short(m.song2))}</span>${pct(m.song2)}</span>
                ${tag}
            </a>
        </li>`;
}

export function groupCardHtml(view, opts = {}) {
    const total = view.matches.length;
    const votedCount = view.matches.filter(m => pickOf(m, opts).voted).length;
    const openCount = view.matches.filter(m => m.status === 'live').length;
    const progress = view.complete ? 'Finished' : `${view.played} of ${total} played`;
    // while matches are open, say how many of them this visitor has voted in; the count inside the Matches list is "voted / total"
    const votedNote = openCount && !view.complete
        ? `<span class="gs-voted-note${votedCount === total ? ' gs-voted-all' : ''}">${votedCount === total ? '&#10003; ' : ''}You voted ${votedCount}/${total}</span>` : '';
    return `
        <article class="gs-card" id="group-${esc(view.name)}" data-group="${esc(view.name)}" data-state="${view.state}" data-voted="${votedCount}">
            <header class="gs-card-head">
                <h3 class="gs-card-title">Group ${esc(view.name)}</h3>
                <span class="gs-progress${view.live ? ' gs-progress-live' : ''}${view.complete ? ' gs-progress-done' : ''}">
                    ${view.live ? '<span class="live-dot"></span>' : ''}${view.live ? `${view.live} live` : progress}
                </span>
            </header>
            ${votedNote}
            <table class="gs-table">
                <caption class="gs-sr">Group ${esc(view.name)} standings</caption>
                <thead><tr><th class="gs-rank">#</th><th>Edit</th><th class="gs-num">W-L</th><th class="gs-num">Share</th><th class="gs-flag"><span class="gs-sr">Status</span></th></tr></thead>
                <tbody>${view.rows.map((r, i) => rowHtml(r, i + 1, view.complete)).join('')}</tbody>
            </table>
            ${view.unresolvedTie ? '<p class="gs-note">Places 2 and 3 were level on everything: decided by draw position.</p>' : ''}
            <details class="gs-matches"${view.live ? ' open' : ''}>
                <summary>Matches <span class="gs-count">${votedCount}/${total} voted</span></summary>
                <ul class="gs-match-list">${view.matches.map(m => matchRowHtml(m, opts)).join('')}</ul>
            </details>
        </article>`;
}

export function groupStageHtml(views, info, opts = {}) {
    const counts = groupCounts(views);
    const chip = (key, label, n) => `<button type="button" class="gs-chip${key === 'all' ? ' active' : ''}" data-filter="${key}" aria-pressed="${key === 'all'}">${label} <span class="gs-chip-count">${n}</span></button>`;
    return `
        <div class="container">
            <div class="gs-head">
                <div>
                    <h2 class="gs-title-main">Group Stage</h2>
                    <p class="gs-sub">${info.groups} groups of 4 &middot; everyone plays everyone &middot; the top 2 of each group go through to the knockout (${info.qualifiers} edits)</p>
                </div>
                <div class="gs-chips" role="group" aria-label="Filter groups">
                    ${chip('all', 'All groups', counts.all)}${chip('live', 'Live now', counts.live)}${chip('complete', 'Finished', counts.complete)}
                </div>
            </div>
            <div class="gs-grid" id="groupGrid">
                ${views.map(v => groupCardHtml(v, opts)).join('')}
            </div>
            <p class="gs-empty" id="groupEmpty" hidden>No groups match this filter yet.</p>
        </div>`;
}

export function stageTabsHtml({ active, info, groupViews }) {
    const c = groupCounts(groupViews);
    const tab = (id, label, meta) => `<button type="button" role="tab" class="stage-tab${active === id ? ' active' : ''}" data-stage="${id}" aria-selected="${active === id}">${label}<span class="stage-tab-meta">${meta}</span></button>`;
    return `
        <div class="container">
            <div class="stage-tabs" role="tablist" aria-label="Tournament stage">
                ${tab('groups', 'Group stage', `${info.groups} groups${c.live ? ` &middot; ${c.live} live` : ''}`)}
                ${tab('knockout', 'Knockout', info.knockoutBuilt ? `${info.qualifiers} edits` : 'after the groups')}
            </div>
        </div>`;
}

// Shown in the Knockout tab until the knockout has been built.
export function knockoutNoteHtml(info, firstRoundName) {
    return `
        <div class="container">
            <div class="ko-note">
                <div class="ko-note-icon">&#9876;&#65039;</div>
                <h3>The knockout starts when the group stage ends</h3>
                <p>The top 2 edits from each of the ${info.groups} groups (${info.qualifiers} in all) go through to the ${esc(firstRoundName)}. Group winners face runners-up from another group. The bracket appears here as soon as the last group closes.</p>
                <button type="button" class="ko-note-btn" data-stage="groups">See the groups</button>
            </div>
        </div>`;
}

// Which tab to open first: the knockout once it exists and anything in it is open or finished, otherwise the groups.
export function defaultStage(matches, info) {
    if (!info.isGroupCup) return null;
    if (!info.knockoutBuilt) return 'groups';
    const ko = matches.filter(m => m.stage === 'knockout');
    return ko.some(m => m.status === 'live' || m.status === 'completed') ? 'knockout'
        : matches.some(m => m.stage === 'group' && m.status === 'live') ? 'groups' : 'knockout';
}

// The info panel at the top of the page (Status / Edits / Progress / Format) for a group-stage cup.
//   roundName(round) names a knockout round, formatDate(str) formats a match date (both from js/brackets.js).
// Returns { statusText, statusClass, liveDot, edits, progress, format } (statusText is plain text; the page escapes it).
export function cupSummary(matches, info, { roundName, formatDate }) {
    const total = matches.length, done = matches.filter(m => m.status === 'completed').length;
    const group = matches.filter(m => m.stage === 'group');
    const groupDone = group.filter(m => m.status === 'completed').length;
    const live = matches.filter(m => m.status === 'live');
    const upcoming = matches.filter(m => m.status === 'upcoming');
    const name = round => round === 1 ? 'Group Stage' : roundName(round);
    const base = {
        edits: info.entries,
        format: 'Group Stage + Knockout',
        progress: info.knockoutBuilt ? `${done} / ${total} Matches` : `${groupDone} / ${group.length} Group Matches`
    };

    if (info.knockoutBuilt && done === total) {
        const final = matches.find(m => m.round === info.totalRounds);
        const champ = final && (final.winnerId === final.song1.id ? final.song1 : final.song2);
        return { ...base, statusText: `🏆 Champion: ${champ?.shortTitle || 'TBD'}`, statusClass: 'status-completed', liveDot: false };
    }
    if (live.length) {
        const round = Math.max(...live.map(m => m.round));
        const n = live.filter(m => m.round === round).length;
        return { ...base, statusText: `${name(round)} - ${n} Live ${n === 1 ? 'Match' : 'Matches'}`, statusClass: 'status-live', liveDot: true };
    }
    if (upcoming.length) {
        const round = Math.min(...upcoming.map(m => m.round));
        const next = upcoming.filter(m => m.round === round).sort((a, b) => a.matchNumber - b.matchNumber)[0];
        return { ...base, statusText: `📅 ${name(round)} Opens ${next?.date ? formatDate(next.date) : 'soon'}`, statusClass: 'status-upcoming', liveDot: false };
    }
    // everything built so far is finished, but the knockout has not been built yet
    return { ...base, statusText: '✅ Groups complete - knockout next', statusClass: 'status-upcoming', liveDot: false };
}
