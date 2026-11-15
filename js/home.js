// ========================================
// HOMEPAGE (index.html, body.page-home)
// What is on right now, then new and popular edits. Everything is worked out in js/home-model.js.
// ========================================
import { getAllMatches } from './api-client.js';
import { cupDisplayName } from './bracket-builder.js';
import { homeState, newestEdits, mostWatched, inLive, compactCount, hasCastVotes, statusParts, MIN_VOTES_TILE } from './home-model.js';

const REFRESH_MS = 60000;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = x => Number(x || 0).toLocaleString();
const plural = (k, one, many = one + 's') => `${n(k)} ${k === 1 ? one : many}`;
const thumb = id => `https://img.youtube.com/vi/${esc(id)}/hqdefault.jpg`;
const when = d => { const t = new Date(d); return d && !Number.isNaN(t.getTime()) ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(t) : ''; };

let edits = [], state = null, cupName = '', liveIds = new Set();

const mini = (c) => `<span class="mini"><img src="${thumb(c.videoId)}" alt="" loading="lazy" decoding="async"><b>${esc(c.title)}</b><i>${esc(c.creator)}</i></span>`;

// An edit in a match that is open right now shows no creator (blind voting): it appears once the match closes.
function editCard(e, meta) {
    const hide = inLive(e, liveIds);
    return `<a class="edit-card" href="/music-gallery?watch=${encodeURIComponent(e.id)}" aria-label="Watch ${esc(e.title)}"><img src="${thumb(e.videoId)}" alt="" loading="lazy" decoding="async">
        <b>${esc(e.title)}</b>${hide ? '' : `<i>${esc(e.creator)}</i>`}<span class="edit-meta">${esc(meta)}</span></a>`;
}

// ---- who is looking: someone who has never voted gets the full hero and "How it works" right under it; a voter gets the compact hero
const readVotes = () => { try { return JSON.parse(localStorage.getItem('userVotes') || '{}') || {}; } catch { return {}; } };
const storageKeys = () => { try { return Object.keys(localStorage); } catch { return []; } };
function applyAudience() {
    const returning = hasCastVotes(readVotes(), storageKeys());
    const hero = document.querySelector('.home-hero'), how = $('how'), main = document.querySelector('.home-page');
    if (!hero || !how || !main) return returning;
    hero.classList.toggle('is-compact', returning);
    how.classList.toggle('is-strip', !returning);
    if (!returning) { if (how.previousElementSibling !== hero) hero.after(how); }
    else if (main.lastElementChild !== how) main.append(how);
    return returning;
}

function section(id, kicker, title, body, more) {
    const el = $(id);
    if (!body) { el.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = `<div class="block-head"><div><p class="kicker">${esc(kicker)}</p><h2 id="${id}Head">${esc(title)}</h2></div>${more || ''}</div>${body}`;
    el.hidden = false;
}

function hero(s) {
    const pill = $('homePill'), lead = $('homeLead'), actions = $('homeActions'), stats = $('homeStats');
    const vote = '<a class="btn btn-primary" href="#vote">Watch &amp; Vote</a>', bracket = '<a class="btn btn-ghost" href="/brackets">See the bracket</a>', gallery = '<a class="btn btn-ghost" href="/music-gallery">Browse the edits</a>';
    const cup = cupName || 'Arcane Moments';
    if (s.phase === 'live') {
        const parts = statusParts({ cup, label: s.liveLabel, liveCount: s.liveCount, closesAt: s.closesAt });
        pill.innerHTML = parts.map((t, i) => `<span class="pill-part">${esc(t)}${i < parts.length - 1 ? ' · ' : ''}</span>`).join('');
        lead.textContent = 'Watch two edits head to head and vote for your favorite.';
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
    const items = s.phase === 'soon' ? [] : [...(s.votes >= MIN_VOTES_TILE ? [[n(s.votes), 'votes cast']] : []), [n(s.editCount), 'edits'], [n(s.liveCount), s.liveCount === 1 ? 'match live' : 'matches live']];
    stats.innerHTML = items.map(([v, l]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('');
    stats.hidden = !items.length;
}

function render() {
    if (!state) return;
    const s = state;
    liveIds = new Set(s.liveEditIds || []);
    applyAudience();
    hero(s);

    section('champion', 'Champion', 'Your Arcane Moments champion',
        s.champion ? `<div class="champion-card">${mini(s.champion)}<a class="btn btn-primary" href="/brackets">See the bracket</a></div>` : '');

    section('recent', 'Results', 'Latest results',
        s.recent.length ? `<ul class="result-list">${s.recent.map(r => r.winner ? `<li><a href="/vote?match=${encodeURIComponent(r.matchId)}"><span class="result-label">${esc(r.label)}</span>
            <span class="result-text"><b>${esc(r.winner.title)}</b> <small>${esc(r.winner.creator)}</small> beat ${esc(r.loser.title)} <small>${esc(r.loser.creator)}</small></span><span class="result-votes">${plural(r.total, 'vote')}</span></a></li>` : '').join('')}</ul>` : '',
        '<a class="more" href="/matches">All matches</a>');

    const voted = s.topVoted;
    const pop = voted.length ? voted.map(e => editCard(e, plural(e.votes, 'vote'))) : mostWatched(edits, 6, liveIds).map(e => editCard(e, `${compactCount(e.views)} views`));
    section('popular', voted.length ? 'Popular' : 'Popular on YouTube', voted.length ? 'Most voted edits' : 'Most watched edits',
        pop.length ? `<div class="edit-row">${pop.join('')}</div>` : '', '<a class="more" href="/music-gallery">Edits gallery <span aria-hidden="true">&rarr;</span></a>');

    const fresh = newestEdits(edits).map(e => editCard(e, e.uploadDate ? when(e.uploadDate) : ''));
    section('newest', 'Newest uploads', 'New edits', fresh.length ? `<div class="edit-row">${fresh.join('')}</div>` : '', '<a class="more" href="/music-gallery">Edits gallery <span aria-hidden="true">&rarr;</span></a>');
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
}

document.addEventListener('DOMContentLoaded', async () => {
    applyAudience();   // before the data arrives, so a returning voter never sees the full hero flash up
    // draw only when BOTH are in: drawing as soon as the matches arrived left "New edits" empty whenever they came back first
    await Promise.all([loadEdits(), loadMatches()]);
    render();
    setInterval(async () => { if (!document.hidden) { await loadMatches(); render(); } }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });   // a vote cast in another tab or page changes the status line
});
