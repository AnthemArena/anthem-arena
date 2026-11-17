// Admin "Discover new edits": asks the discover-edits function for new YouTube Shorts that match the champion rules
// (netlify/shared/discover-model.js), and shows the ones that are not already in data/edits.json.
// "Not for <champion>" is remembered in Firestore (discover-ignored, admin only), per champion (js/discover-view.js).
// Adding is done with the importer: copy the links into data/edit-urls.txt and run tools/edits-import.js, as for any other edit.
import { db, auth } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { ignoreKey, visibleFor, championsFor, importerText, ignoredList } from './discover-view.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
let groups = [], ignored = new Map(), showIgnored = false, searchDays = 14;

// Quota used today by this browser (YouTube resets at midnight Pacific time; this is a guide, not the real meter).
const quotaKey = () => 'discoverQuota_' + new Date().toISOString().slice(0, 10);
function quotaToday(add = 0) {
    try {
        const n = (+localStorage.getItem(quotaKey()) || 0) + add;
        if (add) localStorage.setItem(quotaKey(), String(n));
        return n;
    } catch { return 0; }   // storage blocked
}
const quotaNote = () => `Quota used from this browser today: about ${quotaToday().toLocaleString('en-GB')} of 10,000.`;

function card(c, g, restore, scope = g.id) {
    const date = c.published ? new Date(c.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    const also = championsFor(groups, ignored, c.videoId).filter(x => x.id !== g.id).map(x => x.label);
    return `<div class="discover-card" data-id="${esc(c.videoId)}">
        <a href="${esc(c.url)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${esc(c.videoId)}/mqdefault.jpg" alt="" loading="lazy" width="160" height="90"></a>
        <div class="discover-info">
            <a href="${esc(c.url)}" target="_blank" rel="noopener" class="discover-title">${esc(c.title)}</a>
            <small>${esc(c.channel)} · ${esc(date)} · ${c.views.toLocaleString('en-GB')} views · ${c.seconds}s${c.arcane ? ' · <strong>mentions Arcane</strong>' : ''}${also.length && !restore ? ` · <strong>Also: ${esc(also.join(', '))}</strong>` : ''}</small>
            ${restore
                ? `<button type="button" class="btn discover-restore" data-id="${esc(c.videoId)}" data-rule="${esc(scope)}">${scope === '*' ? 'Restore everywhere' : `Restore for ${esc(g.label)}`}</button>`
                : `<span class="discover-actions"><button type="button" class="btn discover-ignore" data-id="${esc(c.videoId)}" data-rule="${esc(g.id)}">Not for ${esc(g.label)}</button>
                   <button type="button" class="btn discover-ignore" data-id="${esc(c.videoId)}" data-rule="*" title="Not about any of our champions: hide it for every champion">Ignore everywhere</button></span>`}
        </div></div>`;
}

function render() {
    $('discoverResults').innerHTML = groups.map(g => {
        const list = visibleFor(groups, ignored, g.id);
        return `<h3>${esc(g.label)} (${list.length})</h3>
            ${list.length ? `<button type="button" class="btn btn-info discover-copy" data-group="${esc(g.id)}">Copy ${list.length} link${list.length === 1 ? '' : 's'} for edit-urls.txt</button>` : '<p>Nothing new.</p>'}
            <div class="discover-list">${list.map(c => card(c, g, false)).join('')}</div>
            ${g.more ? `<button type="button" class="btn discover-more" data-group="${esc(g.id)}">Load more ${esc(g.label)} (about 300 quota)</button>` : ''}`;
    }).join('');
    const hidden = ignoredList(groups, ignored);
    $('discoverIgnoredToggle').textContent = `${showIgnored ? 'Hide' : 'Show'} ignored (${hidden.length})`;
    $('discoverIgnoredToggle').style.display = hidden.length ? '' : 'none';
    $('discoverIgnored').innerHTML = showIgnored ? hidden.map(h => card(h.candidate, h.group, true, h.ruleId)).join('') : '';
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
    const ig = e.target.closest('.discover-ignore'), re = e.target.closest('.discover-restore'), cp = e.target.closest('.discover-copy'), more = e.target.closest('.discover-more');
    try {
        if (ig) {
            const c = groups.flatMap(g => g.candidates).find(x => x.videoId === ig.dataset.id);
            const key = ig.dataset.rule === '*' ? ig.dataset.id : ignoreKey(ig.dataset.rule, ig.dataset.id);   // '*' = everywhere (the bare video id)
            await setDoc(doc(db, 'discover-ignored', key), { videoId: ig.dataset.id, ruleId: ig.dataset.rule, title: c?.title || '', at: Date.now() });
            ignored.set(key, {}); render();
        } else if (re) {
            const key = re.dataset.rule === '*' ? re.dataset.id : ignoreKey(re.dataset.rule, re.dataset.id);
            await deleteDoc(doc(db, 'discover-ignored', key)); ignored.delete(key);
            render();
        } else if (more) {
            const g = groups.find(x => x.id === more.dataset.group);
            more.disabled = true; more.textContent = 'Loading...';
            const res = await fetch('/.netlify/functions/discover-edits', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
                body: JSON.stringify({ days: searchDays, ruleId: g.id, tokens: g.tokens })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { more.disabled = false; more.textContent = 'Load more'; throw new Error(body.error || `Request failed (${res.status})`); }
            quotaToday(body.quotaUsed);
            const add = body.groups[0], have = new Set(g.candidates.map(c => c.videoId));
            g.candidates.push(...add.candidates.filter(c => !have.has(c.videoId)));
            g.more = add.more; g.tokens = add.tokens;
            $('discoverStatus').textContent = `Loaded ${add.candidates.length} more ${g.label} (${body.quotaUsed} quota). ${quotaNote()}`;
            render();
        } else if (cp) {
            await navigator.clipboard.writeText(importerText(groups, ignored, cp.dataset.group));
            cp.textContent = 'Copied. Paste into data/edit-urls.txt';
        }
    } catch (err) {
        alert('That did not work: ' + (err.message || err));
    }
});
