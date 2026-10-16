// About page: the current cup's numbers, the companion tiles, and smooth scrolling for #links.
// Nothing here is needed to read the page: if the matches cannot be loaded the numbers stay as dashes.
import { getAllMatches } from './api-client.js';
import { COMPANION_PACKS, getChampionTileUrl } from './arcane-config.js';

/** { edits, matches, votes } from a list of match documents. Pure, exported for tests. */
export function summarizeCup(matches) {
    const list = Array.isArray(matches) ? matches : [];
    const edits = new Set();
    let votes = 0;
    for (const m of list) {
        for (const s of [m.song1, m.song2]) if (s?.id) edits.add(s.id);
        votes += Number(m.totalVotes) || 0;
    }
    return { edits: edits.size, matches: list.length, votes };
}

async function fillCupStats() {
    const root = document.getElementById('aboutLive');
    if (!root) return;
    try {
        const s = summarizeCup(await getAllMatches());
        if (!s.matches) return;
        const set = (k, v) => { const el = root.querySelector(`[data-stat="${k}"]`); if (el) el.textContent = v.toLocaleString(); };
        set('edits', s.edits); set('matches', s.matches); set('votes', s.votes);
    } catch (e) {
        console.warn('About: cup numbers not loaded', e);
    }
}

async function fillCompanions() {
    const grid = document.getElementById('companionGrid');
    if (!grid) return;
    let blurbs = {};
    try {
        const res = await fetch('/champion-packs/champion-manifest.json', { cache: 'no-store' });
        if (res.ok) for (const p of (await res.json()).packs || []) blurbs[p.id] = p.description || '';
    } catch { /* tiles still show the names */ }
    grid.innerHTML = COMPANION_PACKS.filter(p => p.enabled).map(p => `
        <li class="companion">
            <img src="${getChampionTileUrl(p.championId, 0)}" alt="" width="64" height="64" loading="lazy">
            <div><h3>${p.name}</h3><p>${blurbs[p.id] || ''}</p></div>
        </li>`).join('');
}

function smoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
}

if (typeof document !== 'undefined') {
    const start = () => { fillCupStats(); fillCompanions(); smoothAnchors(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
