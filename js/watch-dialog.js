// ========================================
// WATCH DIALOG + EDIT SHAPES (vote page)
// ========================================
// Two small jobs that share one idea: an edit should be shown in its own shape, as large as the screen allows.
//   1. editAspects(): data/edits.json knows each edit's "aspect" ("1:1", "4:5", "9:16" ...). The vote page used to force every
//      player into 9:16, so the square edits (most of them) sat small between black bars.
//   2. openWatchDialog(): the gallery's idea of a focused player, for the vote page: dimmed page, one edit, autoplay.
// The gallery keeps its own copy of this dialog (js/music-gallery.js); this one is self-contained so the vote page needs no extra markup.

export const DEFAULT_RATIO = 9 / 16;

// "1:1" -> 1, "4:5" -> 0.8, anything unreadable -> 9:16 (what the vote page assumed before aspects existed)
export function parseAspect(value) {
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(value || ''));
    return m && +m[1] > 0 && +m[2] > 0 ? +m[1] / +m[2] : DEFAULT_RATIO;
}

export function watchEmbedUrl(videoId) {
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&playsinline=1`;
}

// videoId -> ratio, read once. A missing or broken file just means every player keeps the 9:16 default.
let aspectsPromise = null;
export function editAspects(fetchImpl = globalThis.fetch) {
    if (!aspectsPromise) {
        aspectsPromise = (async () => {
            try {
                const res = await fetchImpl('/data/edits.json');
                if (!res.ok) return new Map();
                const list = JSON.parse(await res.text());
                return new Map((Array.isArray(list) ? list : []).filter(e => e && e.videoId && e.aspect).map(e => [e.videoId, parseAspect(e.aspect)]));
            } catch { return new Map(); }
        })();
    }
    return aspectsPromise;
}
export function resetEditAspectsForTests() { aspectsPromise = null; }

// Gives a player box its edit's shape. CSS reads --ar (css/vote.css, .video-wrapper).
export function applyEditShape(wrapper, ratio) {
    if (!wrapper) return;
    const r = Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_RATIO;
    wrapper.style.setProperty('--ar', r.toFixed(4));
    wrapper.classList.toggle('is-wide', r > 1.2);
}

// ---------- the dialog ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
/* no card: the picture takes most of the screen height, the title row and credit line sit on the dimmed page (--wd-h = tallest picture) */
.wd-dialog { --wd-h: min(calc(100vh - 118px), 1000px); margin: auto; width: fit-content; max-width: 94vw; max-height: none; padding: 0; background: transparent; color: #f3ecf8; border: 0; box-shadow: none; overflow: visible; }
@supports (height: 1dvh) { .wd-dialog { --wd-h: min(calc(100dvh - 118px), 1000px); } }
.wd-dialog::backdrop { background: rgba(3,2,8,.88); backdrop-filter: blur(4px); }
.wd-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; width: 0; min-width: 100%; padding: 0 0 .6rem; }
.wd-head h2 { margin: 0; font: 700 1rem system-ui, sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 8px rgba(0,0,0,.8); }
.wd-close { flex: none; width: 44px; height: 44px; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; background: rgba(255,255,255,.1); color: inherit; font-size: 1.1rem; cursor: pointer; }
.wd-close:focus-visible { outline: 2px solid #ff7ac8; outline-offset: 2px; }
.wd-frame { --ar: .5625; width: min(94vw, 1100px, calc(var(--wd-h) * var(--ar))); aspect-ratio: var(--ar); margin: 0 auto; background: #000; border-radius: 14px; overflow: hidden;
    box-shadow: 0 0 0 1px #ff4fb4, 0 30px 90px rgba(0,0,0,.7), 0 0 40px rgba(255,79,180,.18); }
.wd-frame iframe { width: 100%; height: 100%; border: 0; display: block; }
.wd-meta { width: 0; min-width: 100%; margin: 0; padding: .7rem 0 0; text-align: center; color: #b9a9c7; font-size: .9rem; min-height: 1.2em; text-shadow: 0 1px 8px rgba(0,0,0,.8); }
`;

let dialog = null, lastFocus = null;

function build() {
    if (dialog) return dialog;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    dialog = document.createElement('dialog');
    dialog.className = 'wd-dialog';
    dialog.setAttribute('aria-labelledby', 'wdTitle');
    dialog.innerHTML = `<div class="wd-head"><h2 id="wdTitle"></h2><button type="button" class="wd-close" aria-label="Close player">&#10005;</button></div>
        <div class="wd-frame"><iframe id="wdFrame" title="Edit player" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
        <p class="wd-meta" id="wdMeta"></p>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.querySelector('.wd-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        dialog.querySelector('#wdFrame').src = 'about:blank';        // stops playback
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    });
    return dialog;
}

// meta is plain text (escaped here) and is left empty while the creator must stay hidden (live match, not voted yet).
export function openWatchDialog({ videoId, title = '', meta = '', ratio = DEFAULT_RATIO, trigger = null }) {
    if (!videoId) return false;
    const d = build();
    lastFocus = trigger;
    d.querySelector('#wdTitle').textContent = title;
    d.querySelector('#wdMeta').innerHTML = esc(meta);
    applyEditShape(d.querySelector('.wd-frame'), ratio);
    d.classList.toggle('is-wide', ratio > 1.2);   // (kept for tests and styling hooks; the width now follows the frame)
    d.querySelector('#wdFrame').src = watchEmbedUrl(videoId);
    if (!d.open) d.showModal();
    return true;
}

// Pause a page player (the YouTube embeds on the vote page are loaded with enablejsapi=1) so two videos never play at once.
export function pausePlayer(iframe) {
    try { iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*'); } catch { /* cross-origin or gone */ }
}
