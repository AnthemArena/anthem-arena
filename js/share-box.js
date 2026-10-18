// The share box: the champion's line for this moment plus the share targets. One piece of code used by the page panel and
// by the post-vote / share modals, so they can never drift apart. (The wording itself: js/match-share.js.)
//
// mountShareBox(box, { getShare, onShare, notify, onText, showText })
//   getShare(bump) -> { kind, text, url }   what to say right now (asked again when the situation may have changed)
//   onShare(platform, kind)                 called after a share was started (XP / counting)
//   notify(message, type)                   small toast
//   onText(text)                            the line changed (the slim modal shows it as the champion's speech bubble)
//   showText                                draw the line inside the box too (page panel, post-vote modal)
// Returns { refresh() }.
import { targetsFor } from './match-share.js';

export function mountShareBox(box, { getShare, onShare = () => {}, notify = () => {}, onText = () => {}, showText = true } = {}) {
    let bump = 0;
    box.innerHTML = `
        ${showText ? '<p class="share-quote"></p>' : ''}
        <div class="share-buttons">
            ${typeof navigator !== 'undefined' && navigator.share ? '<button type="button" class="share-btn" data-share="native">Share…</button>' : ''}
            <button type="button" class="share-btn twitter" data-share="x">X</button>
            <button type="button" class="share-btn reddit" data-share="reddit">Reddit</button>
            <button type="button" class="share-btn whatsapp" data-share="whatsapp">WhatsApp</button>
            <button type="button" class="share-btn facebook" data-share="facebook">Facebook</button>
            <button type="button" class="share-btn copy" data-share="copy">Copy link</button>
            <button type="button" class="share-btn reword" data-share="reword" title="Another line">New line</button>
        </div>`;
    const quote = box.querySelector('.share-quote');

    function refresh() {
        const s = getShare(bump);
        if (quote) quote.textContent = s.text;
        onText(s.text, s);
        return s;
    }

    box.addEventListener('click', async e => {
        const b = e.target.closest('[data-share]');
        if (!b || !box.contains(b)) return;
        const what = b.dataset.share;
        if (what === 'reword') { bump++; refresh(); return; }
        const cur = getShare(bump);
        if (what === 'native') {
            try { await navigator.share({ text: cur.text, url: cur.url }); onShare('native', cur.kind); } catch (err) { /* cancelled */ }
        } else if (what === 'copy') {
            try { await navigator.clipboard.writeText(`${cur.text} ${cur.url}`); notify('Copied. Paste it anywhere.', 'success'); onShare('copy-link', cur.kind); }
            catch (err) { notify('Could not copy. Long-press the link instead.', 'info'); }
        } else {
            const t = targetsFor(cur.text, cur.url)[what];
            if (t) { window.open(t, '_blank', 'noopener,width=600,height=500'); onShare(what, cur.kind); }
        }
    });

    refresh();
    return { refresh };
}
