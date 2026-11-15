// music-gallery.js: the Arcane Moments EDITS GALLERY (page: /music-gallery, file name kept so nav and footer links still work).
// Lists every edit that has been entered in a cup (data/edits.json, "tournaments" list not empty), with creator credit,
// standing and a click-to-play Short. Standing comes from the active cup's matches (/api/matches) via js/edit-standing.js.
// The cards show progress ("Group stage", "Finalist"), not a win-loss record.
//
// getAllTournamentStats() is also imported by js/vote.js, so it stays exported and unchanged.
import { getAllMatches } from './api-client.js';
import { cupDisplayName } from './bracket-builder.js';
import { cleanTitle } from './title-clean.js';
import { standingFor } from './edit-standing.js';
import { ARCANE_CONFIG } from './arcane-config.js';
import { removalMailto } from './creator-contact.js';

// Use shared cache if available (set by vote.js)
window.pageLoadMatchesCache = window.pageLoadMatchesCache || null;

// ========================================
// GET ALL TOURNAMENT STATS (used by vote.js)
// ========================================
export async function getAllTournamentStats() {
    try {
        console.log('📊 Loading tournament stats from edge cache...');
        
        // Check if matches cache exists from vote.js
        const allMatches = window.pageLoadMatchesCache || await getAllMatches();  // ✅ NEW
        
        // Create stats object for all songs
        const statsMap = {};
        
        allMatches.forEach(match => {
            
            // Only count completed matches
            if (match.status !== 'completed') return;
            
            const winnerId = match.winnerId || match.winner;
            const song1Id = match.song1.id;
            const song2Id = match.song2.id;
            
            // Initialize stats if not exists
            if (!statsMap[song1Id]) {
                statsMap[song1Id] = { wins: 0, losses: 0 };
            }
            if (!statsMap[song2Id]) {
                statsMap[song2Id] = { wins: 0, losses: 0 };
            }
            
            // Update win/loss records
            if (winnerId === song1Id) {
                statsMap[song1Id].wins++;
                statsMap[song2Id].losses++;
            } else if (winnerId === song2Id) {
                statsMap[song2Id].wins++;
                statsMap[song1Id].losses++;
            }
        });
        
        // Convert to readable format
        const formattedStats = {};
        for (const [songId, stats] of Object.entries(statsMap)) {
            const totalMatches = stats.wins + stats.losses;
            const winRate = totalMatches > 0 ? Math.round((stats.wins / totalMatches) * 100) : 0;
            
            formattedStats[songId] = {
                wins: stats.wins,
                losses: stats.losses,
                winRecord: `${stats.wins}-${stats.losses}`,
                winRate: `${winRate}%`,
                totalMatches
            };
        }
        
        console.log(`✅ Loaded stats for ${Object.keys(formattedStats).length} songs`);
        return formattedStats;
        
    } catch (error) {
        console.error('Error fetching tournament stats:', error);
        return {};
    }
}

// ========================================
// GALLERY
// ========================================
const grid = document.getElementById('editGrid');

const STATUS_RANK = { champion: 0, live: 1, bracket: 2, eliminated: 3, entered: 4 };
const PAGE_SIZE = 24;
// chips shown above the grid (a chip with no edits is left out, except All); counts follow the other filters
const STATUS_CHIPS = [['', 'All'], ['live', 'Live'], ['bracket', 'In the bracket'], ['eliminated', 'Finished their run'], ['entered', 'Entered'], ['champion', 'Champions']];
const state = { q: '', chars: new Set(), cup: '', status: '', sort: 'groups' };
let shown = PAGE_SIZE;
let ALL = [];
let lastFocus = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtViews = n => !n ? '0' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
const fmtDuration = s => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// ---------- blind voting ----------
// Same rule as the Matches page and the vote page: an edit in a LIVE match hides its creator and YouTube numbers until the viewer
// has voted in that match (or the match has closed, when standingFor stops reporting a live match).
// A vote is remembered under userVotes and under vote_<cup>_<match>; either counts.
function hasVoted(matchId) {
    try {
        if ((JSON.parse(localStorage.getItem('userVotes') || '{}') || {})[matchId]) return true;
        return !!localStorage.getItem(`vote_${ARCANE_CONFIG.tournamentId}_${matchId}`);
    } catch (e) { return false; }
}
export const isBlind = e => !!(e.standing?.liveMatch && !hasVoted(e.standing.liveMatch.matchId));

const safeUrl = u => /^https:\/\//i.test(u || '') ? u : '';

async function loadGallery() {
    grid.setAttribute('aria-busy', 'true');
    try {
        const [res, matchesRaw] = await Promise.all([
            fetch('/data/edits.json', { cache: 'no-cache' }),
            window.pageLoadMatchesCache ? Promise.resolve(window.pageLoadMatchesCache) : getAllMatches().catch(() => [])
        ]);
        // the site redirects unknown paths to the homepage with status 200, so read as text and check
        let edits;
        try { edits = JSON.parse(await res.text()); } catch { throw new Error('data/edits.json is not available'); }
        const matches = Array.isArray(matchesRaw) ? matchesRaw : [];

        // cups whose id contains "test" are internal and never shown (an edit that is only in a test cup is left out)
        ALL = edits
            .map(e => ({ ...e, tournaments: Array.isArray(e.tournaments) ? e.tournaments.filter(t => !/test/i.test(t)) : [] }))
            .filter(e => e.tournaments.length && e.status !== 'removed' && e.status !== 'blocked' && e.embedAllowed !== false)
            .map(e => ({ ...e, standing: standingFor(e, matches) }));

        buildFilters();
        render();
        openFromLink();
    } catch (err) {
        console.error('Gallery failed to load:', err);
        grid.innerHTML = '<div class="gallery-message"><h3>The gallery could not load</h3><p>Please check your connection and try again.</p><button type="button" class="gallery-retry" id="galleryRetry">Try again</button></div>';
        document.getElementById('galleryRetry')?.addEventListener('click', loadGallery);
        document.getElementById('editCount').textContent = '';
    } finally {
        grid.removeAttribute('aria-busy');
    }
}

function buildFilters() {
    const chars = [...new Set(ALL.flatMap(e => e.characters || []))].sort();
    const charBox = document.getElementById('charFilters');
    charBox.innerHTML = chars.map(c => `<button type="button" class="chip" data-char="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('');
    charBox.hidden = chars.length < 2;

    const cups = [...new Set(ALL.flatMap(e => e.tournaments || []))].sort();
    const cupSel = document.getElementById('cupFilter');
    cupSel.innerHTML = '<option value="">All cups</option>' + cups.map(c => `<option value="${esc(c)}">${esc(cupDisplayName(c))}</option>`).join('');
    cupSel.closest('.toolbar-field').hidden = cups.length < 2;
}

// everything except the status chip, so the chip counts follow the search, character and cup filters
function baseList() {
    const q = state.q.trim().toLowerCase();
    return ALL.filter(e =>
        // a creator name in the search would reveal the creator of a hidden live edit
        (!q || `${e.shortTitle || ''} ${e.title || ''} ${isBlind(e) ? '' : e.artist || ''}`.toLowerCase().includes(q)) &&
        (!state.chars.size || (e.characters || []).some(c => state.chars.has(c))) &&
        (!state.cup || (e.tournaments || []).includes(state.cup)));
}

function visible() {
    const list = baseList().filter(e => !state.status || e.standing.kind === state.status);
    // views, likes and creator of a hidden live edit must not leak through the sort order either
    const views = e => isBlind(e) ? 0 : e.views || 0;
    const likes = e => isBlind(e) ? 0 : e.likes || 0;
    const byViews = (a, b) => views(b) - views(a);
    const groupOrder = e => e.standing.groupIndex ?? (e.standing.group ? 1e6 : 2e6);
    const sorters = {
        // live edits first, then by group (the order the groups appear on Brackets); no result is implied
        groups: (a, b) => (b.standing.kind === 'live') - (a.standing.kind === 'live') || groupOrder(a) - groupOrder(b) || String(a.standing.group || '').localeCompare(String(b.standing.group || '')) || (a.shortTitle || a.title || '').localeCompare(b.shortTitle || b.title || ''),
        standing: (a, b) => STATUS_RANK[a.standing.kind] - STATUS_RANK[b.standing.kind] || b.standing.wins - a.standing.wins || byViews(a, b),
        views: byViews,
        likes: (a, b) => likes(b) - likes(a) || byViews(a, b),
        wins: (a, b) => b.standing.wins - a.standing.wins || byViews(a, b),
        newest: (a, b) => String(b.uploadDate || '').localeCompare(String(a.uploadDate || '')),
        title: (a, b) => (a.shortTitle || a.title || '').localeCompare(b.shortTitle || b.title || ''),
        creator: (a, b) => (isBlind(a) ? '' : a.artist || '').localeCompare(isBlind(b) ? '' : b.artist || '')
    };
    return list.sort(sorters[state.sort] || sorters.groups);
}

function cardHTML(e, tags) {
    const s = e.standing;
    const blind = isBlind(e);
    const title = cleanTitle(e.shortTitle || e.title || 'Untitled edit');
    const creatorUrl = safeUrl(e.creatorUrl);
    const creator = blind
        ? '<span class="edit-creator is-hidden">Shown after you vote</span>'
        : creatorUrl
            ? `<a class="edit-creator" href="${esc(creatorUrl)}" target="_blank" rel="noopener noreferrer">${esc(e.artist || 'Unknown creator')}</a>`
            : `<span class="edit-creator">${esc(e.artist || 'Unknown creator')}</span>`;
    const cups = tags.cups ? (e.tournaments || []).map(c => `<span class="pill pill-cup">${esc(cupDisplayName(c))}</span>`).join('') : '';
    const chars = tags.chars ? (e.characters || []).map(c => `<span class="pill">${esc(c)}</span>`).join('') : '';
    const pills = chars + cups;
    const hidden = '<dd class="is-hidden" title="Shown after you vote">Hidden</dd>';
    // live: one filled Vote now button. Everyone else: the card itself opens the player and "View in bracket" is a quiet text link
    const vote = s.liveMatch
        ? `<a class="edit-vote" href="/vote.html?match=${encodeURIComponent(s.liveMatch.matchId)}">Vote now</a>`
        : `<a class="edit-bracket-link" href="/brackets">View in bracket</a>`;
    return `<article class="edit-card${s.liveMatch ? ' is-live' : ''}" data-id="${esc(e.id)}">
        <button type="button" class="edit-thumb" data-watch="${esc(e.id)}" aria-label="Play ${esc(title)}">
            <img src="https://img.youtube.com/vi/${esc(e.videoId)}/hqdefault.jpg" alt="Thumbnail for ${esc(title)}" style="${thumbStyle(e)}" loading="lazy" decoding="async">
            <span class="edit-badge status-${s.kind}">${s.kind === 'champion' ? '<i class="fa-solid fa-trophy" aria-hidden="true"></i> ' : ''}${esc(s.label)}</span>
            ${e.duration != null ? `<span class="edit-duration">${fmtDuration(e.duration)}</span>` : ''}
            <span class="edit-play" aria-hidden="true"><i class="fa-solid fa-play"></i></span>
        </button>
        <div class="edit-body">
            <h3 class="edit-title">${esc(title)}</h3>
            ${creator}
            <dl class="edit-stats">
                <div><dt>Views</dt>${blind ? hidden : `<dd>${fmtViews(e.views)}</dd>`}</div>
                <div><dt>Likes</dt>${blind ? hidden : `<dd>${e.likes == null ? 'n/a' : fmtViews(e.likes)}</dd>`}</div>
                <div><dt>Year</dt><dd>${esc(e.year || 'n/a')}</dd></div>
            </dl>
            ${pills ? `<div class="edit-pills">${pills}</div>` : ''}
            ${vote}
        </div>
    </article>`;
}

// character and cup tags carry no information while every edit has the same one
function tagFlags() {
    return {
        chars: new Set(ALL.flatMap(e => e.characters || [])).size > 1,
        cups: new Set(ALL.flatMap(e => e.tournaments || [])).size > 1
    };
}

function renderStatusChips() {
    const box = document.getElementById('statusChips');
    if (!box) return;
    const counts = {};
    baseList().forEach(e => { counts[e.standing.kind] = (counts[e.standing.kind] || 0) + 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    box.innerHTML = STATUS_CHIPS
        .filter(([key]) => !key || counts[key] || state.status === key)
        .map(([key, label]) => `<button type="button" class="chip" data-status="${key}" aria-pressed="${state.status === key}">${label} <span class="chip-count">${key ? counts[key] || 0 : total}</span></button>`)
        .join('');
}

function updateShowMore(total) {
    const wrap = document.getElementById('showMoreWrap');
    if (!wrap) return;
    const left = total - shown;
    wrap.hidden = left <= 0;
    const btn = document.getElementById('showMoreBtn');
    if (btn) btn.textContent = `Show ${Math.min(PAGE_SIZE, Math.max(left, 0))} more`;
}

function render() {
    const list = visible();
    const count = document.getElementById('editCount');
    renderStatusChips();
    if (!ALL.length) {
        count.textContent = '';
        grid.innerHTML = '<div class="gallery-message"><h3>No edits have entered a cup yet</h3><p>The first cup is on its way. Check back soon, or <a href="/#vote">see what is live</a>.</p></div>';
        updateShowMore(0);
        return;
    }
    if (!list.length) {
        count.textContent = '0 edits';
        grid.innerHTML = '<div class="gallery-message"><h3>No edits match</h3><p>Try a different search or clear the filters.</p><button type="button" class="gallery-retry" id="clearFilters">Clear filters</button></div>';
        document.getElementById('clearFilters')?.addEventListener('click', resetFilters);
        updateShowMore(0);
        return;
    }
    const n = Math.min(shown, list.length);
    count.textContent = n < list.length ? `${n} of ${list.length} edits` : `${list.length} ${list.length === 1 ? 'edit' : 'edits'}`;
    const tags = tagFlags();
    grid.innerHTML = list.slice(0, n).map(e => cardHTML(e, tags)).join('');
    updateShowMore(list.length);
}

// Show more: append the next page instead of redrawing, so the cards already read stay where they are
function showMore() {
    const list = visible();
    const from = Math.min(shown, list.length);
    shown += PAGE_SIZE;
    const tags = tagFlags();
    grid.insertAdjacentHTML('beforeend', list.slice(from, shown).map(e => cardHTML(e, tags)).join(''));
    const n = Math.min(shown, list.length);
    document.getElementById('editCount').textContent = n < list.length ? `${n} of ${list.length} edits` : `${list.length} ${list.length === 1 ? 'edit' : 'edits'}`;
    updateShowMore(list.length);
    grid.children[from]?.querySelector('.edit-thumb')?.focus({ preventScroll: true });
}

// a filter or sort change starts again from the first page
function refresh() { shown = PAGE_SIZE; render(); }

function resetFilters() {
    state.q = ''; state.chars.clear(); state.cup = ''; state.status = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('cupFilter').value = '';
    document.querySelectorAll('#charFilters .chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
    refresh();
}

// ---------- picture shape ----------
// Each edit has an "aspect" in data/edits.json ("1:1", "4:5", "3:4", "9:16", "4:3", "16:9", set by tools/edits-aspect.js).
// Missing or unreadable values fall back to 9:16, which is what the gallery assumed before aspect existed.
const DEFAULT_ASPECT = 9 / 16;
const CARD_RATIO = 4 / 5;               // every card thumbnail uses this shape (keep in step with .edit-thumb in css/edits-gallery.css)
function aspectOf(e) {
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(e.aspect || '');
    return m && +m[1] > 0 && +m[2] > 0 ? +m[1] / +m[2] : DEFAULT_ASPECT;
}
// hqdefault.jpg is a 4:3 frame with the picture centred between black bars. Size the image inside the card so the picture
// fills the card and the bars fall outside it (a little extra zoom hides the soft edge of the bar).
function thumbStyle(e) {
    const ar = aspectOf(e);
    const pictureW = Math.min(1, ar * 0.75), pictureH = Math.min(1, (4 / 3) / ar);   // share of the image the picture covers
    const w = 1.02 * Math.max(1 / pictureW, 1 / (CARD_RATIO * 0.75 * pictureH));     // image width in card widths
    return `width:${(w * 100).toFixed(1)}%;height:${(w * 0.75 * CARD_RATIO * 100).toFixed(1)}%`;
}

// ---------- video dialog ----------
function openWatch(id, trigger) {
    const e = ALL.find(x => x.id === id);
    const dialog = document.getElementById('watchDialog');
    if (!e || !dialog) return;
    lastFocus = trigger || null;
    document.getElementById('watchTitle').textContent = cleanTitle(e.shortTitle || e.title || '');
    const creatorUrl = safeUrl(e.creatorUrl);
    const dot = ' <span aria-hidden="true">\u2022</span> ';
    const vote = e.standing.liveMatch ? `<a href="/vote.html?match=${encodeURIComponent(e.standing.liveMatch.matchId)}">Vote now</a>` : '';
    const removal = `<a class="watch-removal" href="${esc(removalMailto(cleanTitle(e.shortTitle || e.title || '')))}">Request removal</a>`;
    // a live edit you have not voted on shows neither the creator nor the YouTube link (which would show its views and likes)
    document.getElementById('watchMeta').innerHTML = (isBlind(e)
        ? ['<span class="is-hidden">Creator shown after you vote</span>', vote, removal]
        : [creatorUrl ? `<a href="${esc(creatorUrl)}" target="_blank" rel="noopener noreferrer">${esc(e.artist || '')}</a>` : esc(e.artist || ''),
           `<a href="https://www.youtube.com/shorts/${esc(e.videoId)}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>`, vote, removal]
    ).filter(Boolean).join(dot);
    // the frame takes the edit's own shape so square and wide edits have no black bars
    const ar = aspectOf(e);
    document.querySelector('#watchDialog .watch-frame-wrap').style.setProperty('--ar', ar.toFixed(4));
    dialog.classList.toggle('is-wide', ar > 1.2);
    document.getElementById('watchFrame').src = `https://www.youtube.com/embed/${encodeURIComponent(e.videoId)}?autoplay=1&rel=0&playsinline=1`;
    dialog.showModal();
}
// /music-gallery?watch=<edit id> (links from the homepage) opens that edit's player straight away
function openFromLink() {
    const id = new URLSearchParams(location.search).get('watch');
    if (id && ALL.some(x => x.id === id)) openWatch(id, null);
}
function closeWatch() {
    const dialog = document.getElementById('watchDialog');
    if (dialog?.open) dialog.close();
}

function setup() {
    document.getElementById('searchInput').addEventListener('input', e => { state.q = e.target.value; refresh(); });
    document.getElementById('cupFilter').addEventListener('change', e => { state.cup = e.target.value; refresh(); });
    document.getElementById('sortSelect').addEventListener('change', e => { state.sort = e.target.value; refresh(); });
    document.getElementById('statusChips').addEventListener('click', e => {
        const b = e.target.closest('.chip'); if (!b) return;
        state.status = b.dataset.status; refresh();
    });
    document.getElementById('showMoreBtn').addEventListener('click', showMore);
    document.getElementById('charFilters').addEventListener('click', e => {
        const b = e.target.closest('.chip'); if (!b) return;
        const c = b.dataset.char, on = !state.chars.has(c);
        on ? state.chars.add(c) : state.chars.delete(c);
        b.setAttribute('aria-pressed', String(on));
        refresh();
    });
    grid.addEventListener('click', e => {
        if (e.target.closest('a, button')) { const b = e.target.closest('[data-watch]'); if (b && !e.target.closest('a')) openWatch(b.dataset.watch, b); return; }
        // the whole card opens the player (links inside it keep their own job)
        const card = e.target.closest('.edit-card');
        if (card) openWatch(card.dataset.id, card.querySelector('.edit-thumb'));
    });
    const dialog = document.getElementById('watchDialog');
    dialog.addEventListener('click', e => { if (e.target === dialog) closeWatch(); });   // click on the backdrop
    document.getElementById('watchClose').addEventListener('click', closeWatch);
    dialog.addEventListener('close', () => {
        document.getElementById('watchFrame').src = '';                                 // stop playback
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    });
}

// vote.js imports this module for getAllTournamentStats, so only start the gallery on the gallery page
document.addEventListener('DOMContentLoaded', () => {
    if (!grid) return;
    setup();
    loadGallery();
});
