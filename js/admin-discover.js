// Admin "Discover new edits": asks the discover-edits function for new YouTube Shorts that match the champion rules
// (netlify/shared/discover-model.js), and shows the ones that are not already in data/edits.json.
// "Ignore" is remembered in Firestore (discover-ignored, admin only). Adding is done with the importer: copy the links
// into data/edit-urls.txt and run tools/edits-import.js, as for any other edit.
import { db, auth } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
let groups = [], ignored = new Map(), showIgnored = false, searchDays = 14;

// Quota used today by this browser (YouTube resets at midnight Pacific time; this is a guide, not the real meter).
const quotaKey = () => 'discoverQuota_' + new Date().toISOString().slice(0, 10);
function quotaToday(add = 0) {
    let n = 0;
    try { n = (+localStorage.getItem(quotaKey())) + add; if (add) localStorage.setItem(quotaKey(), String(n)); else n = +localStorage.getItem(quotaKey()) || 0; } catch { /* storage blocked */ }
    return n;
}
const quotaNote = () => `Quota used from this browser today: about ${quotaToday().toLocaleString('en-GB')} of 10,000.`;

const importerBlock = (id, list) => list.length ? `#${id}\n${list.map(c => c.url).join('\n')}\n` : '';
const visible = g => g.candidates.filter(c => !ignored.has(c.videoId));

function card(c, isIgnored) {
    const date = c.published ? new Date(c.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    return `<div class="discover-card" data-id="${esc(c.videoId)}">
        <a href="${esc(c.url)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${esc(c.videoId)}/mqdefault.jpg" alt="" loading="lazy" width="160" height="90"></a>
        <div class="discover-info">
            <a href="${esc(c.url)}" target="_blank" rel="noopener" class="discover-title">${esc(c.title)}</a>
            <small>${esc(c.channel)} · ${esc(date)} · ${c.views.toLocaleString('en-GB')} views · ${c.seconds}s${c.arcane ? ' · <strong>mentions Arcane</strong>' : ''}</small>
            <button type="button" class="btn ${isIgnored ? 'discover-restore' : 'discover-ignore'}" data-id="${esc(c.videoId)}">${isIgnored ? 'Restore' : 'Ignore'}</button>
        </div></div>`;
}

function render() {
    const out = $('discoverResults');
    out.innerHTML = groups.map(g => {
        const list = visible(g);
        return `<h3>${esc(g.label)} (${list.length})</h3>
            ${list.length ? `<button type="button" class="btn btn-info discover-copy" data-group="${esc(g.id)}">Copy ${list.length} link${list.length === 1 ? '' : 's'} for edit-urls.txt</button>` : '<p>Nothing new.</p>'}
            <div class="discover-list">${list.map(c => card(c, false)).join('')}</div>
            ${g.more ? `<button type="button" class="btn discover-more" data-group="${esc(g.id)}">Load more ${esc(g.label)} (about 300 quota)</button>` : ''}`;
    }).join('');
    const ignoredHere = groups.flatMap(g => g.candidates.filter(c => ignored.has(c.videoId)));
    const unique = [...new Map(ignoredHere.map(c => [c.videoId, c])).values()];
    $('discoverIgnoredToggle').textContent = `${showIgnored ? 'Hide' : 'Show'} ignored (${unique.length})`;
    $('discoverIgnoredToggle').style.display = unique.length ? '' : 'none';
    $('discoverIgnored').innerHTML = showIgnored ? unique.map(c => card(c, true)).join('') : '';
}

async function search() {
    const status = $('discoverStatus'), btn = $('discoverBtn');
    const user = auth.currentUser;
    if (!user || user.isAnonymous) { status.textContent = 'Sign in as admin first.'; return; }
    btn.disabled = true; status.textContent = 'Searching YouTube... (about 10 seconds)';
    try {
        const [token, snap] = await Promise.all([user.getIdToken(), getDocs(collection(db, 'discover-ignored'))]);
        ignored = new Map(snap.docs.map(d => [d.id, d.data()]));
        const res = await fetch('/.netlify/functions/discover-edits', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ days: Number($('discoverDays').value) })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
        groups = body.groups; searchDays = Number($('discoverDays').value);
        quotaToday(body.quotaUsed);
        const fresh = new Set(groups.flatMap(g => g.candidates.map(c => c.videoId))).size;
        status.textContent = `${body.searched} videos found on YouTube, ${body.alreadyHave} already in our pool, ${fresh} new matches. This search used ${body.quotaUsed}${body.cached ? ' (cached, nothing spent)' : ''}. ${quotaNote()}`;
        render();
    } catch (e) {
        console.error(e);
        status.textContent = 'Could not search: ' + (e.message || e);
    }
    btn.disabled = false;
}

$('discoverBtn')?.addEventListener('click', search);
$('discoverIgnoredToggle')?.addEventListener('click', () => { showIgnored = !showIgnored; render(); });
$('discover')?.addEventListener('click', async e => {
    const ig = e.target.closest('.discover-ignore'), re = e.target.closest('.discover-restore'), cp = e.target.closest('.discover-copy');
    try {
        if (ig) {
            const c = groups.flatMap(g => g.candidates).find(x => x.videoId === ig.dataset.id);
            await setDoc(doc(db, 'discover-ignored', ig.dataset.id), { videoId: ig.dataset.id, title: c?.title || '', at: Date.now() });
            ignored.set(ig.dataset.id, {}); render();
        } else if (re) {
            await deleteDoc(doc(db, 'discover-ignored', re.dataset.id));
            ignored.delete(re.dataset.id); render();
        } else if (e.target.closest('.discover-more')) {
            const btn = e.target.closest('.discover-more'), g = groups.find(x => x.id === btn.dataset.group);
            btn.disabled = true; btn.textContent = 'Loading...';
            const res = await fetch('/.netlify/functions/discover-edits', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
                body: JSON.stringify({ days: searchDays, ruleId: g.id, tokens: g.tokens })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { btn.disabled = false; btn.textContent = 'Load more'; throw new Error(body.error || `Request failed (${res.status})`); }
            quotaToday(body.quotaUsed);
            const add = body.groups[0], have = new Set(g.candidates.map(c => c.videoId));
            g.candidates.push(...add.candidates.filter(c => !have.has(c.videoId)));
            g.more = add.more; g.tokens = add.tokens;
            $('discoverStatus').textContent = `Loaded ${add.candidates.length} more ${g.label} (${body.quotaUsed} quota). ${quotaNote()}`;
            render();
        } else if (cp) {
            const g = groups.find(x => x.id === cp.dataset.group);
            await navigator.clipboard.writeText(importerBlock(g.id, visible(g)));
            cp.textContent = 'Copied. Paste into data/edit-urls.txt';
        }
    } catch (err) {
        alert('That did not work: ' + (err.message || err));
    }
});
