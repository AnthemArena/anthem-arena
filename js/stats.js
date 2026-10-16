// ========================================
// STATS PAGE (stats.html, body.page-stats)
// Numbers come from the same /api/matches list the bracket uses; js/stats-model.js does the sums.
// ========================================
import { getAllMatches } from './api-client.js';
import { computeStats, sortRows, compareCups } from './stats-model.js';

const REFRESH_MS = 60000;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = x => Number(x || 0).toLocaleString();
const pct = x => `${Math.round(x)}%`;
const plural = (k, one, many = one + 's') => `${n(k)} ${k === 1 ? one : many}`;

let stats = null, sortKey = 'votes', groupFilter = '', groupQuery = '';
let cups = [], activeCupId = null, selectedCup = null, allCups = null;   // selectedCup null = the active cup

// ---------- overview ----------
function overview(s) {
    const card = (icon, value, label, extra = '') => `<div class="stat-card"><i class="fa-solid ${icon}" aria-hidden="true"></i><strong data-stat="${esc(label)}">${value}</strong><span>${label}</span>${extra}</div>`;
    const rounds = s.rounds.map(r => {
        const done = r.total ? Math.round((r.completed / r.total) * 100) : 0;
        return `<li class="round-row"><span class="round-name">${esc(r.label)}</span><span class="round-bar" aria-hidden="true"><i style="width:${done}%"></i></span><span class="round-count">${r.completed}/${r.total}</span></li>`;
    }).join('');
    return `<div class="stat-grid">
            ${card('fa-check-to-slot', n(s.totalVotes), 'Votes cast')}
            ${card('fa-film', n(s.editCount), 'Edits in the cup')}
            ${card('fa-flag-checkered', `${n(s.completed)}<small> / ${n(s.totalMatches)}</small>`, 'Matches finished')}
            ${card('fa-bolt', n(s.live), 'Live now')}
        </div>
        ${s.groupCount ? `<p class="stats-note">${plural(s.groupsComplete, 'group')} of ${n(s.groupCount)} finished. The top two in each group go through to the knockout.</p>` : ''}
        ${rounds ? `<div class="panel"><h2>Progress by stage</h2><ul class="round-list">${rounds}</ul></div>` : ''}
        ${s.totalMatches ? '' : '<p class="stats-message">No matches have been built yet. Check back once the cup opens.</p>'}`;
}

// ---------- edits ----------
function editsPane(s) {
    if (!s.rows.length) return '<p class="stats-message">No edits in the cup yet.</p>';
    const rows = sortRows(s.rows, sortKey);
    const opt = (v, t) => `<option value="${v}"${sortKey === v ? ' selected' : ''}>${t}</option>`;
    return `<div class="stats-toolbar"><label for="sortEdits">Rank by</label>
            <select id="sortEdits">${opt('votes', 'Most votes')}${opt('share', 'Best vote share')}${opt('wins', 'Most wins')}</select></div>
        <ol class="edit-rank">${rows.map((e, i) => `<li class="rank-row">
            <span class="rank-pos">${i + 1}</span>
            <img src="https://img.youtube.com/vi/${esc(e.videoId)}/hqdefault.jpg" alt="" loading="lazy" decoding="async">
            <div class="rank-main"><strong class="rank-title">${esc(e.title)}</strong><span class="rank-by">${esc(e.creator)}</span>
              ${e.votes + e.against ? `<span class="share-bar" role="img" aria-label="${pct(e.share)} of the votes in their matches"><i style="width:${Math.round(e.share)}%"></i></span>` : ''}</div>
            <div class="rank-nums"><b>${n(e.votes)}</b><span>votes</span><em>${e.played ? `${e.record} · ${pct(e.share)}` : 'No result yet'}</em></div>
        </li>`).join('')}</ol>`;
}

// ---------- groups ----------
function groupsPane(s) {
    if (!s.groups.length) return '<p class="stats-message">This cup has no group stage.</p>';
    const q = groupQuery.trim().toLowerCase();
    const shown = s.groups.filter(g => (!groupFilter || (groupFilter === 'done' ? g.complete : !g.complete))
        && (!q || g.name.toLowerCase().includes(q) || g.rows.some(r => r.title.toLowerCase().includes(q) || r.artist.toLowerCase().includes(q))));
    const tools = `<div class="stats-toolbar"><label for="groupSearch">Find</label>
            <input type="search" id="groupSearch" placeholder="Group letter, edit or creator" value="${esc(groupQuery)}" autocomplete="off">
            <label for="groupState">Show</label>
            <select id="groupState"><option value="">All groups</option><option value="open"${groupFilter === 'open' ? ' selected' : ''}>Still playing</option><option value="done"${groupFilter === 'done' ? ' selected' : ''}>Finished</option></select></div>`;
    if (!shown.length) return tools + '<p class="stats-message">No groups match that.</p>';
    return tools + `<div class="group-grid">${shown.map(g => `<article class="group-card${g.complete ? ' is-done' : ''}">
        <h2>${esc(g.name)} <small>${g.complete ? 'Finished' : 'In play'}</small></h2>
        <ol>${g.rows.map(r => `<li class="${r.rank <= 2 && (r.played > 0 || g.complete) ? 'is-through' : ''}">
            <span class="g-pos">${r.rank}</span><span class="g-name"><b>${esc(r.title)}</b><i>${esc(r.artist)}</i></span>
            <span class="g-rec">${r.wins}-${r.losses}</span><span class="g-votes">${n(r.votesFor)}</span></li>`).join('')}</ol>
        ${g.unresolvedTie ? '<p class="g-tie">Level on every tie-break: decided by draw order.</p>' : ''}
    </article>`).join('')}</div>`;
}

// ---------- records ----------
function recordsPane(s) {
    const r = s.records;
    const linkOpen = m => selectedCup ? '<div class="record-card">' : `<a class="record-card" href="/vote?match=${encodeURIComponent(m.matchId)}">`, linkClose = selectedCup ? '</div>' : '</a>';   // a finished cup's matches have no vote page
    const matchCard = (icon, title, m, line) => m ? `${linkOpen(m)}<i class="fa-solid ${icon}" aria-hidden="true"></i><h2>${title}</h2>
        <p class="record-match"><b>${esc(m.edit1)}</b> <span>vs</span> <b>${esc(m.edit2)}</b></p><p class="record-line">${line(m)}</p><span class="record-label">${esc(m.label)}</span>${linkClose}` : '';
    const cards = [
        matchCard('fa-fire', 'Most voted match', r.mostVotedMatch, m => `${n(m.total)} votes (${n(m.votes1)} to ${n(m.votes2)})`),
        matchCard('fa-scale-balanced', 'Closest finish', r.closest, m => `${pct(m.percent1)} to ${pct(m.percent2)}, ${plural(m.gap, 'vote')} apart`),
        r.upset ? `${linkOpen(r.upset)}<i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i><h2>Biggest upset</h2><p class="record-match"><b>${esc(r.upset.winnerName)}</b> <span>beat</span> <b>${esc(r.upset.loserName)}</b></p><p class="record-line">Seed ${r.upset.winnerSeed} over seed ${r.upset.loserSeed}</p><span class="record-label">${esc(r.upset.label)}</span>${linkClose}` : '',
        matchCard('fa-burst', 'Biggest landslide', r.blowout, m => `${pct(Math.max(m.percent1, m.percent2))} to ${pct(Math.min(m.percent1, m.percent2))}`),
        r.mostVotedEdit ? `<div class="record-card"><i class="fa-solid fa-crown" aria-hidden="true"></i><h2>Most voted edit</h2><p class="record-match"><b>${esc(r.mostVotedEdit.title)}</b></p><p class="record-line">${plural(r.mostVotedEdit.votes, 'vote')} across ${plural(r.mostVotedEdit.played || 1, 'match', 'matches')}</p><span class="record-label">${esc(r.mostVotedEdit.creator)}</span></div>` : '',
        r.bestShare ? `<div class="record-card"><i class="fa-solid fa-heart" aria-hidden="true"></i><h2>Fan favourite</h2><p class="record-match"><b>${esc(r.bestShare.title)}</b></p><p class="record-line">${pct(r.bestShare.share)} of the votes in their finished matches</p><span class="record-label">${esc(r.bestShare.creator)}</span></div>` : ''
    ].filter(Boolean);
    return cards.length ? `<div class="record-grid">${cards.join('')}</div>` : '<p class="stats-message">Records appear once the first votes are in.</p>';
}

// ---------- all cups ----------
function allCupsPane(a) {
    if (!a) return '<p class="stats-message">Loading every cup...</p>';
    if (!a.cups.length) return '<p class="stats-message">No cups yet.</p>';
    const card = (icon, value, label) => `<div class="stat-card"><i class="fa-solid ${icon}" aria-hidden="true"></i><strong>${value}</strong><span>${label}</span></div>`;
    const rec = (icon, title, r, line) => r ? `<div class="record-card"><i class="fa-solid ${icon}" aria-hidden="true"></i><h2>${title}</h2>
        <p class="record-match"><b>${esc(r.edit1 || r.winnerName)}</b> <span>${r.winnerName ? 'beat' : 'vs'}</span> <b>${esc(r.edit2 || r.loserName)}</b></p><p class="record-line">${line(r)}</p><span class="record-label">${esc(r.cupName)} · ${esc(r.label)}</span></div>` : '';
    const records = [
        rec('fa-fire', 'Most voted match ever', a.records.mostVotedMatch, r => `${n(r.total)} votes`),
        rec('fa-scale-balanced', 'Closest finish ever', a.records.closest, r => `${pct(r.percent1)} to ${pct(r.percent2)}`),
        rec('fa-burst', 'Biggest landslide ever', a.records.blowout, r => `${pct(Math.max(r.percent1, r.percent2))} to ${pct(Math.min(r.percent1, r.percent2))}`),
        rec('fa-arrow-trend-up', 'Biggest upset ever', a.records.upset, r => `Seed ${r.winnerSeed} over seed ${r.loserSeed}`)
    ].filter(Boolean);
    const rows = a.cups.map(c => `<li class="cup-row"><div class="cup-row-main"><strong>${esc(c.name)}</strong><span>${c.status === 'active' ? 'Live now' : 'Finished'}${c.champion ? ' · Champion: ' + esc(c.champion) : ''}</span></div>
        ${c.loaded ? `<div class="cup-row-nums"><b>${n(c.votes)}</b><span>votes</span></div><div class="cup-row-nums"><b>${n(c.finished)}/${n(c.matches)}</b><span>matches done</span></div><div class="cup-row-nums"><b>${n(c.edits)}</b><span>edits</span></div>`
        : '<div class="cup-row-nums"><span>Could not load</span></div>'}</li>`).join('');
    return `<div class="stat-grid">${card('fa-check-to-slot', n(a.totals.votes), 'Votes, all cups')}${card('fa-trophy', n(a.totals.cups), a.totals.cups === 1 ? 'Cup so far' : 'Cups so far')}${card('fa-flag-checkered', n(a.totals.finished), 'Matches finished')}</div>
        <div class="panel"><h2>Cup by cup</h2><ul class="cup-list">${rows}</ul></div>
        ${records.length ? `<div class="record-grid">${records.join('')}</div>` : ''}`;
}

// ---------- page ----------
function render() {
    if (!stats) return;
    const keep = document.activeElement?.id;
    $('pane-overview').innerHTML = overview(stats);
    $('pane-edits').innerHTML = editsPane(stats);
    $('pane-groups').innerHTML = groupsPane(stats);
    $('pane-records').innerHTML = recordsPane(stats);
    $('pane-allcups').innerHTML = allCupsPane(allCups);
    $('pane-overview').removeAttribute('aria-busy');
    $('sortEdits')?.addEventListener('change', e => { sortKey = e.target.value; render(); $('sortEdits')?.focus(); });
    $('groupSearch')?.addEventListener('input', e => { groupQuery = e.target.value; const p = e.target.selectionStart; render(); const el = $('groupSearch'); el?.focus(); el?.setSelectionRange(p, p); });
    $('groupState')?.addEventListener('change', e => { groupFilter = e.target.value; render(); $('groupState')?.focus(); });
    if (keep && !['sortEdits', 'groupSearch', 'groupState'].includes(keep)) document.getElementById(keep)?.focus();
}

function setTab(name, focus = false) {
    document.querySelectorAll('.stats-tab').forEach(b => {
        const on = b.dataset.tab === name;
        b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
    });
    document.querySelectorAll('.stats-pane').forEach(p => { p.hidden = p.id !== `pane-${name}`; });
    try { history.replaceState(null, '', `#${name}`); } catch { /* ignore */ }
}

function wireTabs() {
    const tabs = [...document.querySelectorAll('.stats-tab')];
    tabs.forEach((b, i) => {
        b.addEventListener('click', () => setTab(b.dataset.tab));
        b.addEventListener('keydown', e => {
            const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (d) { e.preventDefault(); setTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true); }
        });
    });
    const start = location.hash.slice(1);
    if (tabs.some(b => b.dataset.tab === start)) setTab(start);
}

async function loadCups() {
    try {
        const res = await fetch('/data/cups.json', { cache: 'no-cache' });
        cups = res.ok ? ((await res.json()).cups || []) : [];
    } catch { cups = []; }
    activeCupId = (cups.find(c => c.status === 'active') || cups[cups.length - 1] || {}).id || null;
    const asked = new URLSearchParams(location.search).get('cup');
    selectedCup = asked && asked !== activeCupId && cups.some(c => c.id === asked) ? asked : null;
    // The picker only matters once there is more than one cup.
    if (cups.length > 1) {
        $('cupSelect').innerHTML = [...cups].reverse().map(c => `<option value="${esc(c.id)}"${(selectedCup || activeCupId) === c.id ? ' selected' : ''}>${esc(c.name)}${c.status === 'active' ? ' (live)' : ''}</option>`).join('');
        $('cupPick').hidden = false;
        $('cupSelect').addEventListener('change', e => {
            selectedCup = e.target.value === activeCupId ? null : e.target.value;
            try { history.replaceState(null, '', (selectedCup ? `?cup=${encodeURIComponent(selectedCup)}` : location.pathname) + location.hash); } catch { /* ignore */ }
            stats = null; load(true);
        });
    }
}

// Every listed cup, once per visit: finished cups never change, and the all-cups tab only needs the totals.
async function loadAllCups() {
    if (!cups.length) return;
    const entries = await Promise.all(cups.map(async c => {
        try { return { cup: c, matches: c.id === activeCupId ? await getAllMatches() : await getAllMatches(false, c.id) }; }
        catch { return { cup: c, matches: null }; }
    }));
    allCups = compareCups(entries);
    $('pane-allcups').innerHTML = allCupsPane(allCups);
}

async function load(first = false) {
    try {
        const matches = await getAllMatches(false, selectedCup);
        stats = computeStats(matches);
        const name = selectedCup ? (cups.find(c => c.id === selectedCup) || {}).name : (matches.find(m => m.tournamentName) || {}).tournamentName;
        if (name) $('cupSubtitle').textContent = selectedCup ? `Final numbers from ${name}: votes, rankings, group tables and records.` : `Live numbers from ${name}: votes, rankings, group tables and records.`;
        $('statsUpdated').textContent = selectedCup ? 'This cup is finished, so the numbers do not change.' : `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Refreshes every minute.`;
        render();
    } catch (err) {
        console.error('Stats failed to load', err);
        if (!stats) {
            $('pane-overview').innerHTML = '<p class="stats-message">Could not load the stats. <button type="button" class="stats-retry" id="statsRetry">Try again</button></p>';
            $('statsRetry')?.addEventListener('click', () => load(true));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    wireTabs();
    loadCups().then(() => { load(true); loadAllCups().catch(e => console.warn('All cups unavailable', e)); });
    setInterval(() => { if (!document.hidden && !selectedCup) load(); }, REFRESH_MS);
});
