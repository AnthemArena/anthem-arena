// ========================================
// HOMEPAGE (index.html, body.page-home)
// What is on right now, then new and popular edits. Everything is worked out in js/home-model.js.
// ========================================
import { getAllMatches } from './api-client.js';
import { cupDisplayName } from './bracket-builder.js';
import { homeState, newestEdits, mostWatched, countdownText } from './home-model.js';

const REFRESH_MS = 60000;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = x => Number(x || 0).toLocaleString();
const plural = (k, one, many = one + 's') => `${n(k)} ${k === 1 ? one : many}`;
const thumb = id => `https://img.youtube.com/vi/${esc(id)}/hqdefault.jpg`;
const when = d => { const t = new Date(d); return d && !Number.isNaN(t.getTime()) ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(t) : ''; };

let edits = [], state = null, cupName = '';

const mini = (c) => `<span class="mini"><img src="${thumb(c.videoId)}" alt="" loading="lazy" decoding="async"><b>${esc(c.title)}</b><i>${esc(c.creator)}</i></span>`;

function editCard(e, meta) {
    return `<a class="edit-card" href="/music-gallery?watch=${encodeURIComponent(e.id)}" aria-label="Watch ${esc(e.title)}"><img src="${thumb(e.videoId)}" alt="" loading="lazy" decoding="async">
        <b>${esc(e.title)}</b><i>${esc(e.creator)}</i><span class="edit-meta">${esc(meta)}</span></a>`;
}

function section(id, kicker, title, body, more) {
    const el = $(id);
    if (!body) { el.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = `<div class="block-head"><div><p class="kicker">${esc(kicker)}</p><h2 id="${id}Head">${esc(title)}</h2></div>${more || ''}</div>${body}`;
    el.hidden = false;
}

function hero(s) {
    const pill = $('homePill'), lead = $('homeLead'), actions = $('homeActions'), stats = $('homeStats');
    const vote = '<a class="btn btn-primary" href="/live">Vote now</a>', bracket = '<a class="btn btn-ghost" href="/brackets">See the bracket</a>', gallery = '<a class="btn btn-ghost" href="/music-gallery">Browse the edits</a>';
    const cup = cupName || 'Arcane Moments';
    if (s.phase === 'live') {
        pill.textContent = `${cup}: ${plural(s.liveCount, 'match', 'matches')} live now`;
        lead.textContent = 'Watch two edits head to head and vote for your favourite.';
        actions.innerHTML = vote + bracket;
    } else if (s.phase === 'between') {
        pill.textContent = `${cup}: next matches open soon`;
        lead.textContent = 'The latest round is done. See how it went while the next one is set up.';
        actions.innerHTML = bracket + gallery;
    } else if (s.phase === 'upcoming') {
        pill.textContent = `${cup}: voting opens soon`;
        lead.textContent = 'The groups are drawn. See who is in and get ready to vote.';
        actions.innerHTML = bracket + gallery;
    } else if (s.phase === 'finished') {
        pill.textContent = `${cup}: complete`;
        lead.textContent = 'The cup has a champion. Revisit the bracket and the edits that got there.';
        actions.innerHTML = bracket + gallery;
    } else {
        pill.textContent = 'Opening soon';
        lead.textContent = 'A fan-made tournament where you vote for the best Arcane edits. The first cup is being prepared.';
        actions.innerHTML = gallery + '<a class="btn btn-ghost" href="#how">How it works</a>';
    }
    const items = s.phase === 'soon' ? [] : [[n(s.votes), 'votes cast'], [n(s.editCount), 'edits'], [n(s.liveCount), 'live now']];
    stats.innerHTML = items.map(([v, l]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('');
    stats.hidden = !items.length;
}

function render() {
    if (!state) return;
    const s = state, now = Date.now();
    hero(s);

    section('champion', 'Champion', 'Your Arcane Moments champion',
        s.champion ? `<div class="champion-card">${mini(s.champion)}<a class="btn btn-primary" href="/brackets">See the bracket</a></div>` : '');

    const f = s.featured;
    section('featured', 'Match of the day', 'The most voted match right now',
        f ? `<div class="match-card"><p class="match-label">${esc(f.label)}${f.closesAt ? ` &middot; closes in ${esc(countdownText(f.closesAt, now))}` : ''}</p>
            <div class="match-pair">${mini(f.a)}<span class="match-vs">vs</span>${mini(f.b)}</div>
            <p class="match-votes">${plural(f.total, 'vote')} so far</p>
            <a class="btn btn-primary" href="/vote?match=${encodeURIComponent(f.matchId)}">Vote on this match</a></div>` : '');

    section('recent', 'Results', 'Latest results',
        s.recent.length ? `<ul class="result-list">${s.recent.map(r => r.winner ? `<li><a href="/vote?match=${encodeURIComponent(r.matchId)}"><span class="result-label">${esc(r.label)}</span>
            <span class="result-text"><b>${esc(r.winner.title)}</b> <small>${esc(r.winner.creator)}</small> beat ${esc(r.loser.title)} <small>${esc(r.loser.creator)}</small></span><span class="result-votes">${plural(r.total, 'vote')}</span></a></li>` : '').join('')}</ul>` : '',
        '<a class="more" href="/matches">All matches</a>');

    const voted = s.topVoted;
    const pop = voted.length ? voted.map(e => editCard(e, plural(e.votes, 'vote'))) : mostWatched(edits).map(e => editCard(e, `${n(e.views)} views on YouTube`));
    section('popular', voted.length ? 'Popular' : 'Popular on YouTube', voted.length ? 'Most voted edits' : 'Most watched edits',
        pop.length ? `<div class="edit-row">${pop.join('')}</div>` : '', '<a class="more" href="/music-gallery">Edits gallery</a>');

    const fresh = newestEdits(edits).map(e => editCard(e, e.uploadDate ? `Uploaded ${when(e.uploadDate)}` : ''));
    section('newest', 'New', 'New edits', fresh.length ? `<div class="edit-row">${fresh.join('')}</div>` : '', '<a class="more" href="/music-gallery">Edits gallery</a>');
}

async function loadEdits() {
    try {
        const res = await fetch('/data/edits.json', { cache: 'no-cache' });
        const list = JSON.parse(await res.text());   // unknown paths return the homepage with status 200, so read as text and check
        edits = Array.isArray(list) ? list : [];
    } catch { edits = []; }
}

async function loadMatches() {
    try {
        const matches = await getAllMatches();
        const named = matches.find(m => m.tournamentName)?.tournamentName || (matches[0]?.tournament ? cupDisplayName(matches[0].tournament) : '');
        cupName = named || '';
        state = homeState(matches);
    } catch (err) {
        console.error('Homepage matches failed to load', err);
        state = state || homeState([]);
    }
    render();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadEdits(), loadMatches()]);
    setInterval(() => { if (!document.hidden) loadMatches(); }, REFRESH_MS);
});
