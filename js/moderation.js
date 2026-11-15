// moderation.js: report a post or comment, block a person, and slow down floods. The rules live in js/moderation-model.js.
//
// Reports go to the "reports" collection (only the admin can read it, see firestore.rules) and add 1 to the target's reportCount
// in the same batch. Three reports from three different people hide the item from everyone but its author until the admin has
// looked (admin.html > Reports). Blocking is private: it only hides that person for you, and lives on this device.
import { REPORT_REASONS, REASON_KEYS, reportId, validTargetId, addBlock, removeBlock, blockedEntries, isHiddenFor, checkRate, rateMessage } from './moderation-model.js';

const BLOCK_KEY = 'blockedUsers';
const RATE_KEY = 'rateLog';
const FIRESTORE = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: the setting just lasts until the page closes */ } };
const me = () => { try { return localStorage.getItem('tournamentUserId') || ''; } catch (e) { return ''; } };
const tell = (msg, type = 'success') => { if (window.showNotification) window.showNotification(msg, type); };

// ---------- blocking ----------
export const getBlocked = () => read(BLOCK_KEY, {});
export function blockUser(userId, name) { write(BLOCK_KEY, addBlock(getBlocked(), userId, name)); }
export function unblockUser(userId) { write(BLOCK_KEY, removeBlock(getBlocked(), userId)); }
export const isHidden = item => isHiddenFor(item, { blocked: getBlocked(), viewerId: me() });

// ---------- posting limits ----------
// Returns true if allowed (and counts it). Otherwise tells the person to wait and returns false.
export function allowedToSend(kind) {
    const r = checkRate(read(RATE_KEY, {}), kind, Date.now(), true);
    if (!r.ok) { tell(rateMessage(kind, r.waitSeconds), 'error'); return false; }
    write(RATE_KEY, r.log);
    return true;
}

// ---------- reporting ----------
export async function submitReport({ targetType, targetId, authorId, authorName, reason, postId }) {
    const uid = me();
    if (!uid) throw new Error('not signed in');
    if (!['post', 'comment'].includes(targetType) || !validTargetId(targetId) || !REASON_KEYS.includes(reason)) throw new Error('bad report');
    if (!authorId || authorId === uid) throw new Error('cannot report your own content');
    const { db } = await import('./firebase-config.js');
    const { doc, writeBatch, increment, Timestamp } = await import(FIRESTORE);
    const batch = writeBatch(db);
    batch.set(doc(db, 'reports', reportId(targetType, targetId, uid)), {
        reporterId: uid, targetType, targetId, authorId, authorName: String(authorName || '').slice(0, 40), reason,
        ...(postId ? { postId } : {}), timestamp: Timestamp.now()
    });
    // the counter goes up only together with the report (firestore.rules: isReportBump)
    batch.update(doc(db, targetType === 'post' ? 'posts' : 'comments', targetId), { reportCount: increment(1) });
    await batch.commit();
}

// ---------- dialogs ----------
function dialog(html) {
    document.getElementById('modDialog')?.remove();
    const d = document.createElement('dialog');
    d.id = 'modDialog'; d.className = 'mod-dialog';
    d.innerHTML = html;
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => d.remove());
    document.body.appendChild(d);
    d.showModal();
    return d;
}

export function openReportDialog({ targetType, targetId, authorId, authorName, postId, onDone }) {
    const noun = targetType === 'comment' ? 'comment' : 'post';
    const d = dialog(`
        <form method="dialog" class="mod-form">
            <h2>Report this ${noun}</h2>
            <p class="mod-sub">Why are you reporting ${esc(authorName || 'this person')}'s ${noun}?</p>
            <div class="mod-reasons" role="radiogroup" aria-label="Reason">
                ${REPORT_REASONS.map(([k, label], i) => `<label class="mod-reason"><input type="radio" name="reason" value="${k}"${i === 0 ? ' checked' : ''}> <span>${esc(label)}</span></label>`).join('')}
            </div>
            <p class="mod-error" role="alert" hidden></p>
            <div class="mod-actions">
                <button type="button" class="mod-cancel">Cancel</button>
                <button type="submit" class="mod-send">Send report</button>
            </div>
        </form>`);
    d.querySelector('.mod-cancel').addEventListener('click', () => d.close());
    d.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault();
        const send = d.querySelector('.mod-send'), err = d.querySelector('.mod-error');
        send.disabled = true; send.textContent = 'Sending...'; err.hidden = true;
        try {
            await submitReport({ targetType, targetId, authorId, authorName, postId, reason: d.querySelector('input[name="reason"]:checked').value });
            d.close(); tell('Thanks. Your report has been sent and will be looked at.');
            onDone?.();
        } catch (ex) {
            const already = /permission|exists|denied/i.test(String(ex?.message || ex));
            err.textContent = already ? 'You have already reported this, or it can no longer be reported.' : 'The report could not be sent. Please try again.';
            err.hidden = false; send.disabled = false; send.textContent = 'Send report';
        }
    });
    return d;
}

export function openBlockDialog({ userId, name, onDone }) {
    const d = dialog(`
        <form method="dialog" class="mod-form">
            <h2>Block ${esc(name || 'this person')}?</h2>
            <p class="mod-sub">Their posts and comments will be hidden for you on this device. They are not told. You can unblock them any time from "Blocked people" at the end of the feed.</p>
            <div class="mod-actions">
                <button type="button" class="mod-cancel">Cancel</button>
                <button type="submit" class="mod-send">Block</button>
            </div>
        </form>`);
    d.querySelector('.mod-cancel').addEventListener('click', () => d.close());
    d.querySelector('form').addEventListener('submit', e => {
        e.preventDefault(); blockUser(userId, name); d.close();
        tell(`${name || 'They'} ${name ? 'is' : 'are'} blocked.`); onDone?.();
    });
    return d;
}

export function openBlockedList(onChange) {
    const entries = blockedEntries(getBlocked());
    const d = dialog(`
        <div class="mod-form">
            <h2>Blocked people</h2>
            ${entries.length ? `<ul class="mod-blocked">${entries.map(b => `<li><span>${esc(b.name)}</span><button type="button" class="mod-unblock" data-id="${esc(b.id)}">Unblock</button></li>`).join('')}</ul>` : '<p class="mod-sub">You have not blocked anyone.</p>'}
            <div class="mod-actions"><button type="button" class="mod-cancel">Close</button></div>
        </div>`);
    d.querySelector('.mod-cancel').addEventListener('click', () => d.close());
    d.addEventListener('click', e => {
        const b = e.target.closest('.mod-unblock'); if (!b) return;
        unblockUser(b.dataset.id); b.closest('li').remove(); onChange?.();
        if (!d.querySelector('li')) d.querySelector('.mod-form h2').insertAdjacentHTML('afterend', '<p class="mod-sub">You have not blocked anyone.</p>');
    });
    return d;
}
