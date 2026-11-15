// ========================================
// BRACKETS PAGE: GROUP STAGE VIEW (pure: builds HTML strings, touches no DOM, so it is tested in Node)
// ========================================
// js/brackets.js calls these when a cup has a group stage (see describeCup in js/group-builder.js).
// A single-elimination cup never reaches this file's output, so its page is unchanged.
import { allGroupStandings } from './group-builder.js';
import { cleanTitle } from './title-clean.js';
import { isOpenNow } from './vote-closed.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESC[c]);

// One entry per group, in group order: its standings table, its matches, and where it is up to.
//   state: 'live' (a match is open), 'complete' (all 6 closed), 'upcoming' (nothing played and nothing open yet), 'idle' (between matches)
//   closes: when the first open match closes (ms), opens: when the group's first match opens (ms), null when the data has no time
export function buildGroupViews(matches) {
    const byGroup = new Map();
    for (const m of matches.filter(m => m.stage === 'group')) {
        if (!byGroup.has(m.group)) byGroup.set(m.group, []);
        byGroup.get(m.group).push(m);
    }
    return allGroupStandings(matches).map(g => {
        const list = (byGroup.get(g.name) || []).slice().sort((a, b) => a.matchNumber - b.matchNumber);
        const live = list.filter(m => isOpenNow(m)).length;
        const played = list.filter(m => m.status === 'completed').length;
        const times = (pick, only) => list.filter(only).map(pick).map(v => Date.parse(v || '')).filter(Number.isFinite);
        const closeTimes = times(m => m.endDate || m.endTime, m => isOpenNow(m));
        const openTimes = times(m => m.startDate || m.date, m => m.status === 'upcoming');
        return {
            name: g.name, index: g.index, rows: g.rows, complete: g.complete, unresolvedTie: g.unresolvedTie,
            matches: list, played, live,
            closes: closeTimes.length ? Math.min(...closeTimes) : null,
            opens: openTimes.length ? Math.min(...openTimes) : null,
            state: live ? 'live' : g.complete ? 'complete' : played === 0 ? 'upcoming' : 'idle'
        };
    });
}

export const groupCounts = views => ({
    all: views.length,
    live: views.filter(v => v.state === 'live').length,
    upcoming: views.filter(v => v.state === 'upcoming').length,
    complete: views.filter(v => v.state === 'complete').length
});

// "Opens in 31h" / "Opens in 3d"; with no time in the data, "Not open yet" (never "0 of 6 played" for a group nobody can vote in yet)
export function opensLabel(ms, now = Date.now()) {
    if (!Number.isFinite(ms)) return 'Not open yet';
    const left = ms - now;
    if (left <= 0) return 'Opens soon';
    const hours = Math.ceil(left / 3600000);
    return hours < 48 ? `Opens in ${Math.max(1, hours)}h` : `Opens in ${Math.round(hours / 24)}d`;
}

// The line for someone who has voted in everything that is open: "You're all caught up. Next group opens in 31h."
// '' when there is still something open to vote in, or nothing is open at all.
export function caughtUpNote(views, opts = {}, now = Date.now()) {
    const open = views.flatMap(v => v.matches.filter(m => isOpenNow(m, now)));
    if (!open.length || !open.every(m => pickOf(m, opts).voted)) return '';
    const next = views.filter(v => v.state === 'upcoming').map(v => v.opens).filter(Number.isFinite).sort((a, b) => a - b)[0];
    const upcoming = views.some(v => v.state === 'upcoming');
    return `You're all caught up.${upcoming ? ` Next group ${Number.isFinite(next) ? opensLabel(next, now).replace('Opens', 'opens') : 'is not open yet'}.` : ''}`;
}

const thumb = song => song?.videoId ? `https://img.youtube.com/vi/${encodeURIComponent(song.videoId)}/mqdefault.jpg` : '';
// display name: the title without its trailing hashtags (js/title-clean.js); the hover tooltip keeps the full title
const short = song => cleanTitle(song?.shortTitle || song?.title || 'TBD');

function rowHtml(row, rank, complete, started) {
    // Before the first result, and for an edit that has no votes yet, the order means nothing: dashes and no "advance" marker
    const ranked = started && (row.votesFor + row.votesAgainst) > 0;
    const qualifies = ranked && rank <= 2;
    // "Qualified" / "Out" are only said once the group is finished; before that the top two are just highlighted
    const badge = !complete ? '' : qualifies
        ? '<span class="gs-pill gs-pill-in">Qualified</span>'
        : '<span class="gs-pill gs-pill-out">Out</span>';
    const share = row.votesFor + row.votesAgainst ? `${Math.round(row.share * 100)}%` : '–';
    const seed = row.seed != null ? `Seed ${row.seed}` : '';
    return `
        <tr class="gs-row${qualifies ? ' gs-in-position' : ''}${complete && !qualifies ? ' gs-out' : ''}" data-rank="${ranked ? rank : ''}">
            <td class="gs-rank">${ranked ? rank : '&ndash;'}</td>
            <td class="gs-edit" title="${esc([row.competitor?.title || short(row.competitor), row.artist, seed].filter(Boolean).join(' · '))}">
                ${row.competitor?.videoId ? `<img class="gs-thumb" src="${thumb(row.competitor)}" alt="" loading="lazy">` : '<span class="gs-thumb gs-thumb-empty"></span>'}
                <span class="gs-edit-text">
                    <span class="gs-title">${esc(short(row.competitor))}</span>
                    ${row.artist ? `<span class="gs-creator">${esc(row.artist)}</span>` : ''}
                </span>
            </td>
            <td class="gs-num" data-label="W-L">${row.wins}-${row.losses}</td>
            <td class="gs-num gs-share" data-label="Vote %">${share}</td>
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
    const done = m.status === 'completed', live = isOpenNow(m);
    const { side, voted } = pickOf(m, opts);
    const showPct = done || voted;
    const total = m.totalVotes || ((m.song1?.votes || 0) + (m.song2?.votes || 0));
    const pct = song => (showPct && total > 0) ? `<b class="gs-pct">${Math.round(((song.votes || 0) / total) * 100)}%</b>` : '';
    const win1 = done && m.winnerId === m.song1.id, win2 = done && m.winnerId === m.song2.id;
    // the voter's pick is marked with a tick; in a live match the other edit is dimmed (a finished match keeps its winner styling)
    const sideClass = (n, win) => `gs-side${win ? ' gs-win' : ''}${side === n ? ' gs-picked' : ''}${live && side && side !== n ? ' gs-dimmed' : ''}`;
    const tick = n => side === n ? '<span class="gs-check" title="Your pick" aria-label="Your pick">&#10003;<span class="gs-check-text">Your pick</span></span>' : '';
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
    const openCount = view.matches.filter(m => isOpenNow(m)).length;
    const progress = view.complete ? 'Finished' : view.state === 'upcoming' ? opensLabel(view.opens, opts.now) : `${view.played} of ${total} played`;
    // "0/6 voted" only makes sense while there is something open to vote in; a finished or not-yet-open group with no votes of yours just says how many matches it has
    const countLabel = (votedCount || openCount) ? `${votedCount}/${total} voted` : `${total} matches`;
    // while matches are open, say how many of them this visitor has voted in; the count inside the Matches list is "voted / total"
    const votedNote = openCount && !view.complete
        ? `<span class="gs-voted-note${votedCount === total ? ' gs-voted-all' : ''}">${votedCount === total ? '&#10003; ' : ''}You voted ${votedCount}/${total}</span>` : '';
    return `
        <article class="gs-card" id="group-${esc(view.name)}" data-group="${esc(view.name)}" data-state="${view.state}" data-voted="${votedCount}"${view.closes ? ` data-closes="${view.closes}"` : ''}${opts.hidden ? ' hidden' : ''}${opts.order != null ? ` style="order:${opts.order}"` : ''}>
            <header class="gs-card-head">
                <h3 class="gs-card-title">Group ${esc(view.name)}</h3>
                <span class="gs-progress${view.live ? ' gs-progress-live' : ''}${view.complete ? ' gs-progress-done' : ''}">
                    ${view.live ? '<span class="live-dot"></span>' : ''}${view.live ? `${view.live} live` : progress}
                </span>
            </header>
            ${votedNote}
            <table class="gs-table">
                <caption class="gs-sr">Group ${esc(view.name)} standings</caption>
                <thead><tr><th class="gs-rank">#</th><th>Edit</th><th class="gs-num">W-L</th><th class="gs-num">Vote %</th><th class="gs-flag"><span class="gs-sr">Status</span></th></tr></thead>
                <tbody>${view.rows.map((r, i) => rowHtml(r, i + 1, view.complete, view.played > 0)).join('')}</tbody>
            </table>
            ${view.unresolvedTie ? '<p class="gs-note">Places 2 and 3 were level on everything: decided by draw position.</p>' : ''}
            <details class="gs-matches"${view.live ? ' open' : ''}>
                <summary>Matches <span class="gs-count">${countLabel}</span></summary>
                <ul class="gs-match-list">${view.matches.map(m => matchRowHtml(m, opts)).join('')}</ul>
            </details>
        </article>`;
}

export function groupStageHtml(views, info, opts = {}) {
    const counts = groupCounts(views);
    // Open on what can be voted in now (closing soonest first); only when nothing is open, show every group
    const initial = counts.live ? 'live' : 'all';
    const chip = (key, label, n) => `<button type="button" class="gs-chip${key === initial ? ' active' : ''}" data-filter="${key}" aria-pressed="${key === initial}">${label} <span class="gs-chip-count">${n}</span></button>`;
    const liveOrder = views.filter(v => v.state === 'live').sort((a, b) => (a.closes ?? Infinity) - (b.closes ?? Infinity)).map(v => v.name);
    const caught = caughtUpNote(views, opts, opts.now);
    return `
        <div class="container">
            <div class="gs-head">
                <div>
                    <h2 class="gs-title-main">Group Stage</h2>
                    <p class="gs-sub">${info.groups} groups of 4 &middot; everyone plays everyone &middot; the top 2 of each group go through to the knockout (${info.qualifiers} edits)</p>
                </div>
                <div class="gs-chips" role="group" aria-label="Filter groups">
                    ${chip('all', 'All groups', counts.all)}${chip('live', 'Live now', counts.live)}${chip('upcoming', 'Upcoming', counts.upcoming)}${chip('complete', 'Finished', counts.complete)}
                </div>
            </div>
            <p class="gs-caught-up" id="groupCaughtUp" data-note="${esc(caught)}"${caught && initial === 'live' ? '' : ' hidden'}>${esc(caught)}</p>
            <div class="gs-grid" id="groupGrid">
                ${views.map(v => groupCardHtml(v, { ...opts, hidden: initial !== 'all' && v.state !== initial, order: initial === 'live' && v.state === 'live' ? liveOrder.indexOf(v.name) : null })).join('')}
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

// When the last group match closes (ms), or null when no unfinished group match carries an end time.
export function groupsCloseAt(matches) {
    const t = matches.filter(m => m.stage === 'group' && m.status !== 'completed')
        .map(m => Date.parse(m.endDate || m.endTime || '')).filter(Number.isFinite);
    return t.length ? Math.max(...t) : null;
}
export function groupsCloseLabel(closeAt, now = Date.now()) {
    if (!Number.isFinite(closeAt) || closeAt <= now) return '';
    const days = Math.ceil((closeAt - now) / 86400000);
    return days <= 1 ? 'Groups close today' : `Groups close in ${days} days`;
}

// Shown in the Knockout tab until the knockout has been built: the pairing rule with an example, then the road to the final.
//   roundName(round) names a knockout round (js/brackets.js); closeAt = groupsCloseAt(matches)
export function knockoutNoteHtml(info, { roundName = r => `Round ${r}`, closeAt = null, now = Date.now() } = {}) {
    const first = info.firstKnockoutRound || 2;
    const ladder = Array.from({ length: info.knockoutRounds }, (_, i) => ({
        name: roundName(first + i), matches: info.qualifiers / 2 ** (i + 1)
    }));
    const close = groupsCloseLabel(closeAt, now);
    const slot = (label, cls) => `<span class="ko-slot ${cls}">${label}</span>`;
    return `
        <div class="container">
            <div class="ko-note">
                <h3>The knockout starts when the group stage ends</h3>
                <p>The top 2 edits from each of the ${info.groups} groups (${info.qualifiers} in all) go through.${close ? ` <strong class="ko-close">${esc(close)}.</strong>` : ''}</p>
                <div class="ko-rule">
                    <p class="ko-rule-text">Groups are paired (A with B, C with D, and so on). A winner never meets their own group in round one:</p>
                    <div class="ko-pair">${slot('Winner of Group A', 'ko-slot-win')}<span class="ko-vs">v</span>${slot('Runner-up of Group B', 'ko-slot-run')}</div>
                    <div class="ko-pair">${slot('Winner of Group B', 'ko-slot-win')}<span class="ko-vs">v</span>${slot('Runner-up of Group A', 'ko-slot-run')}</div>
                </div>
                <ol class="ko-ladder" aria-label="Knockout rounds">
                    ${ladder.map(r => `<li class="ko-step"><span class="ko-step-name">${esc(r.name)}</span><span class="ko-step-n">${r.matches} ${r.matches === 1 ? 'match' : 'matches'}</span></li>`).join('')}
                </ol>
            </div>
        </div>`;
}

// Which tab to open first: the knockout once it exists and anything in it is open or finished, otherwise the groups.
export function defaultStage(matches, info) {
    if (!info.isGroupCup) return null;
    if (!info.knockoutBuilt) return 'groups';
    const ko = matches.filter(m => m.stage === 'knockout');
    return ko.some(m => isOpenNow(m) || m.status === 'completed') ? 'knockout'
        : matches.some(m => m.stage === 'group' && isOpenNow(m)) ? 'groups' : 'knockout';
}

// The info panel at the top of the page (Status / Edits / Progress / Format) for a group-stage cup.
//   roundName(round) names a knockout round, formatDate(str) formats a match date (both from js/brackets.js).
// Returns { statusText, statusClass, liveDot, edits, progress, format } (statusText is plain text; the page escapes it).
export function cupSummary(matches, info, { roundName, formatDate }) {
    const total = matches.length, done = matches.filter(m => m.status === 'completed').length;
    const group = matches.filter(m => m.stage === 'group');
    const groupDone = group.filter(m => m.status === 'completed').length;
    const live = matches.filter(m => isOpenNow(m));
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
        const inRound = live.filter(m => m.round === round), n = inRound.length;
        const g = new Set(inRound.map(m => m.group)).size;
        // group stage: say groups first, with the matches in brackets, so the info card matches the "Live now" chip and the tab
        const statusText = round === 1
            ? `${g} ${g === 1 ? 'group' : 'groups'} live (${n} ${n === 1 ? 'match' : 'matches'})`
            : `${name(round)} - ${n} Live ${n === 1 ? 'Match' : 'Matches'}`;
        return { ...base, statusText, statusClass: 'status-live', liveDot: true };
    }
    if (upcoming.length) {
        const round = Math.min(...upcoming.map(m => m.round));
        const next = upcoming.filter(m => m.round === round).sort((a, b) => a.matchNumber - b.matchNumber)[0];
        return { ...base, statusText: `📅 ${name(round)} Opens ${next?.date ? formatDate(next.date) : 'soon'}`, statusClass: 'status-upcoming', liveDot: false };
    }
    // everything built so far is finished, but the knockout has not been built yet
    return { ...base, statusText: '✅ Groups complete - knockout next', statusClass: 'status-upcoming', liveDot: false };
}
