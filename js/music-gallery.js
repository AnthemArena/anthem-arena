// music-gallery.js: the Arcane Moments EDITS GALLERY (page: /music-gallery, file name kept so nav and footer links still work).
// Lists every edit that has been entered in a cup (data/edits.json, "tournaments" list not empty), with creator credit,
// record, standing and a click-to-play Short. Records and standing come from the active cup's matches (/api/matches).
//
// getAllTournamentStats() is also imported by js/vote.js, so it stays exported and unchanged.
import { getAllMatches } from './api-client.js';
import { cupDisplayName } from './bracket-builder.js';

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
const state = { q: '', chars: new Set(), cup: '', status: '', sort: 'standing' };
let ALL = [];
let lastFocus = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtViews = n => !n ? '0' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
const fmtDuration = s => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const isFinal = m => /-finals$/.test(m.matchId || '') || m.roundLabel === 'Final';
const safeUrl = u => /^https:\/\//i.test(u || '') ? u : '';

// What this edit has done in the active cup, worked out from its matches.
function standingFor(edit, matches) {
    const mine = matches.filter(m => m.song1?.id === edit.id || m.song2?.id === edit.id)
        .sort((a, b) => (a.round || 0) - (b.round || 0));
    if (!mine.length) return { kind: 'entered', label: 'Entered', wins: 0, losses: 0, reached: '', liveMatch: null };

    let wins = 0, losses = 0, lostIn = null, champion = false;
    for (const m of mine) {
        if (m.status !== 'completed') continue;
        const winner = m.winnerId || m.winner;
        if (winner === edit.id) { wins++; if (isFinal(m)) champion = true; }
        else if (winner) { losses++; lostIn = m; }
    }
    const liveMatch = mine.find(m => m.status === 'live') || null;
    const last = mine[mine.length - 1];
    const reached = (liveMatch || last).roundLabel || '';

    if (champion) return { kind: 'champion', label: 'Champion', wins, losses, reached: 'Champion', liveMatch: null };
    if (lostIn) return { kind: 'eliminated', label: 'Out in ' + (lostIn.roundLabel || 'the cup'), wins, losses, reached: lostIn.roundLabel || '', liveMatch: null };
    if (liveMatch) return { kind: 'live', label: 'Live now', wins, losses, reached, liveMatch };
    return { kind: 'bracket', label: 'In the bracket', wins, losses, reached, liveMatch: null };
}

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

        ALL = edits
            .filter(e => Array.isArray(e.tournaments) && e.tournaments.length && e.status !== 'removed' && e.status !== 'blocked' && e.embedAllowed !== false)
            .map(e => ({ ...e, standing: standingFor(e, matches) }));

        buildFilters();
        render();
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

function visible() {
    const q = state.q.trim().toLowerCase();
    const list = ALL.filter(e =>
        (!q || `${e.shortTitle || ''} ${e.title || ''} ${e.artist || ''}`.toLowerCase().includes(q)) &&
        (!state.chars.size || (e.characters || []).some(c => state.chars.has(c))) &&
        (!state.cup || (e.tournaments || []).includes(state.cup)) &&
        (!state.status || e.standing.kind === state.status));
    const byViews = (a, b) => (b.views || 0) - (a.views || 0);
    const sorters = {
        standing: (a, b) => STATUS_RANK[a.standing.kind] - STATUS_RANK[b.standing.kind] || b.standing.wins - a.standing.wins || byViews(a, b),
        views: byViews,
        likes: (a, b) => (b.likes || 0) - (a.likes || 0) || byViews(a, b),
        wins: (a, b) => b.standing.wins - a.standing.wins || byViews(a, b),
        newest: (a, b) => String(b.uploadDate || '').localeCompare(String(a.uploadDate || '')),
        title: (a, b) => (a.shortTitle || a.title || '').localeCompare(b.shortTitle || b.title || ''),
        creator: (a, b) => (a.artist || '').localeCompare(b.artist || '')
    };
    return list.sort(sorters[state.sort] || sorters.standing);
}

function cardHTML(e) {
    const s = e.standing;
    const title = e.shortTitle || e.title || 'Untitled edit';
    const record = s.wins + s.losses ? `${s.wins}\u2013${s.losses}` : '\u2013';
    const creatorUrl = safeUrl(e.creatorUrl);
    const creator = creatorUrl
        ? `<a class="edit-creator" href="${esc(creatorUrl)}" target="_blank" rel="noopener noreferrer">${esc(e.artist || 'Unknown creator')}</a>`
        : `<span class="edit-creator">${esc(e.artist || 'Unknown creator')}</span>`;
    const cups = (e.tournaments || []).map(c => `<span class="pill pill-cup">${esc(cupDisplayName(c))}</span>`).join('');
    const chars = (e.characters || []).map(c => `<span class="pill">${esc(c)}</span>`).join('');
    // every card ends with one button so rows line up: Vote now when live, otherwise a link to the bracket
    const vote = s.liveMatch
        ? `<a class="edit-vote" href="/vote.html?match=${encodeURIComponent(s.liveMatch.matchId)}">Vote now</a>`
        : `<a class="edit-vote edit-bracket" href="/brackets">View in bracket</a>`;
    return `<article class="edit-card" data-id="${esc(e.id)}">
        <button type="button" class="edit-thumb" data-watch="${esc(e.id)}" aria-label="Watch ${esc(title)}">
            <img src="https://img.youtube.com/vi/${esc(e.videoId)}/hqdefault.jpg" alt="" style="${thumbStyle(e)}" loading="lazy" decoding="async">
            <span class="edit-badge status-${s.kind}">${s.kind === 'champion' ? '<i class="fa-solid fa-trophy" aria-hidden="true"></i> ' : ''}${esc(s.label)}</span>
            ${e.duration != null ? `<span class="edit-duration">${fmtDuration(e.duration)}</span>` : ''}
            <span class="edit-play" aria-hidden="true"><i class="fa-solid fa-play"></i></span>
        </button>
        <div class="edit-body">
            <h3 class="edit-title">${esc(title)}</h3>
            ${creator}
            <dl class="edit-stats">
                <div><dt>Record</dt><dd>${record}</dd></div>
                <div><dt>Views</dt><dd>${fmtViews(e.views)}</dd></div>
                <div><dt>Likes</dt><dd>${e.likes == null ? '\u2013' : fmtViews(e.likes)}</dd></div>
                <div><dt>Year</dt><dd>${esc(e.year || '\u2013')}</dd></div>
            </dl>
            <div class="edit-pills">${chars}${cups}</div>
            ${vote}
        </div>
    </article>`;
}

function render() {
    const list = visible();
    document.getElementById('editCount').textContent = `${list.length} ${list.length === 1 ? 'edit' : 'edits'}`;
    if (!ALL.length) {
        grid.innerHTML = '<div class="gallery-message"><h3>No edits have entered a cup yet</h3><p>The first cup is on its way. Check back soon, or <a href="/live">see what is live</a>.</p></div>';
        return;
    }
    if (!list.length) {
        grid.innerHTML = '<div class="gallery-message"><h3>No edits match</h3><p>Try a different search or clear the filters.</p><button type="button" class="gallery-retry" id="clearFilters">Clear filters</button></div>';
        document.getElementById('clearFilters')?.addEventListener('click', resetFilters);
        return;
    }
    grid.innerHTML = list.map(cardHTML).join('');
}

function resetFilters() {
    state.q = ''; state.chars.clear(); state.cup = ''; state.status = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('cupFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.querySelectorAll('#charFilters .chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
    render();
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
    document.getElementById('watchTitle').textContent = e.shortTitle || e.title || '';
    const creatorUrl = safeUrl(e.creatorUrl);
    document.getElementById('watchMeta').innerHTML =
        (creatorUrl ? `<a href="${esc(creatorUrl)}" target="_blank" rel="noopener noreferrer">${esc(e.artist || '')}</a>` : esc(e.artist || '')) +
        ` <span aria-hidden="true">\u2022</span> <a href="https://www.youtube.com/shorts/${esc(e.videoId)}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>` +
        (e.standing.liveMatch ? ` <span aria-hidden="true">\u2022</span> <a href="/vote.html?match=${encodeURIComponent(e.standing.liveMatch.matchId)}">Vote now</a>` : '');
    // the frame takes the edit's own shape so square and wide edits have no black bars
    const ar = aspectOf(e);
    document.querySelector('#watchDialog .watch-frame-wrap').style.setProperty('--ar', ar.toFixed(4));
    dialog.classList.toggle('is-wide', ar > 1.2);
    document.getElementById('watchFrame').src = `https://www.youtube.com/embed/${encodeURIComponent(e.videoId)}?autoplay=1&rel=0&playsinline=1`;
    dialog.showModal();
}
function closeWatch() {
    const dialog = document.getElementById('watchDialog');
    if (dialog?.open) dialog.close();
}

function setup() {
    document.getElementById('searchInput').addEventListener('input', e => { state.q = e.target.value; render(); });
    document.getElementById('cupFilter').addEventListener('change', e => { state.cup = e.target.value; render(); });
    document.getElementById('statusFilter').addEventListener('change', e => { state.status = e.target.value; render(); });
    document.getElementById('sortSelect').addEventListener('change', e => { state.sort = e.target.value; render(); });
    document.getElementById('charFilters').addEventListener('click', e => {
        const b = e.target.closest('.chip'); if (!b) return;
        const c = b.dataset.char, on = !state.chars.has(c);
        on ? state.chars.add(c) : state.chars.delete(c);
        b.setAttribute('aria-pressed', String(on));
        render();
    });
    grid.addEventListener('click', e => {
        const b = e.target.closest('[data-watch]');
        if (b) openWatch(b.dataset.watch, b);
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
