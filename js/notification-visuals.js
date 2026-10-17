// Shared look for ally / rival alerts: the pop-up toast and the bell-list row are the same design at two sizes.
//   [their avatar] VS [your avatar]   (= instead of VS when they voted with you)
//   [avatar] FireReaper voted against you
//   [Jinx] "I already sharpened the rockets..."
//   [ Challenge ]
// Pure helpers (avatarSrc, championBadgeUrl, ...) are tested in tools/test-notification-visuals.mjs.

export const ALLY_ACCENT = '#4ade80';
const DEFAULT_ACCENT = '#ff69b4';

export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function emojiAvatar(emoji) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="#ff4fb4"/><text x="25" y="35" text-anchor="middle" font-size="30">${emoji}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// An avatar can arrive as a url, a stored object ({type:'url'|'champion'|'emoji', ...}), a JSON string or a bare emoji.
// (A raw object used to be dropped straight into an <img src>, giving "[object Object]".)
export function avatarSrc(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string') {
        const s = raw.trim();
        if (/^(https?:|data:|\/)/.test(s)) return s;
        if (s.startsWith('{')) { try { return avatarSrc(JSON.parse(s)); } catch { return null; } }
        return emojiAvatar(s);
    }
    if (typeof raw === 'object') {
        if (raw.type === 'url') return raw.value || null;
        if (raw.type === 'champion') return raw.imageUrl || raw.value || null;
        if (raw.type === 'emoji') return raw.value ? emojiAvatar(raw.value) : null;
    }
    return null;
}

export function viewerAvatarSrc(storage = globalThis.localStorage) {
    try { return avatarSrc(storage?.getItem('avatar')); } catch { return null; }
}

// The companion's face: the pack's icon. (The Arcane skin tile is a dark picture; at 24-60 px it reads as a dark blob.)
export function championBadgeUrl(pack) {
    return pack?.icon || null;
}

// Someone with no picture gets a stable Arcane champion (same pick every time for the same name), like new accounts do.
const FALLBACK_CHAMPIONS = ['Vi', 'Caitlyn', 'Ekko', 'Jayce', 'Viktor', 'Heimerdinger', 'Jinx'];
export function fallbackAvatarFor(name) {
    const s = String(name || '?');
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${FALLBACK_CHAMPIONS[h % FALLBACK_CHAMPIONS.length]}.png`;
}

// The two edits of a match as pictures, in match order (song1 left, song2 right), plus which side each person picked.
// yourKey = 'song1' | 'song2'; a rival picked the other edit, an ally the same one. null when we can't tell.
export const videoThumb = id => (id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null);
export function matchEdits(match, yourKey, relationship) {
    if (!match || (yourKey !== 'song1' && yourKey !== 'song2')) return null;
    const idOf = s => s?.videoId || s?.id || null;
    const l = videoThumb(idOf(match.song1)), r = videoThumb(idOf(match.song2));
    if (!l && !r) return null;
    const other = yourKey === 'song1' ? 'song2' : 'song1';
    return { left: { key: 'song1', thumb: l }, right: { key: 'song2', thumb: r }, yourKey, theirKey: relationship === 'ally' ? yourKey : other };
}

export const accentFor = (relationship, pack) => (relationship === 'ally' ? ALLY_ACCENT : (pack?.color || DEFAULT_ACCENT));
export const markFor = relationship => (relationship === 'ally' ? '=' : 'VS');

// ---------- html builders ----------
export function circleHtml(src, name, size, { accent = DEFAULT_ACCENT, cls = '', badge = null, badgeSide = 'right' } = {}) {
    const initial = escapeHtml((name || '?').trim().charAt(0).toUpperCase() || '?');
    const b = Math.max(16, Math.round(size * 0.5));
    return `<span class="nv-av"><span class="nv-circle ${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;--nv-accent:${accent}">${initial}${src ? `<img src="${escapeHtml(src)}" alt="" onerror="${avatarErr(name)}">` : ''}</span>${badge ? `<img class="nv-badge ${badgeSide === 'left' ? 'nv-badge-left' : ''}" src="${escapeHtml(badge)}" alt="" style="width:${b}px;height:${b}px" onerror="this.remove()">` : ''}</span>`;
}

// A broken avatar picture swaps to the person's stable fallback champion icon once (then gives up and shows the initial).
function avatarErr(name) {
    const fb = fallbackAvatarFor(name);
    return `if(!this.dataset.fb){this.dataset.fb=1;this.src='${escapeHtml(fb)}'}else{this.remove()}`;
}

export function pairHtml({ theirSrc, theirName, yourSrc, relationship, size = 44, accent, theirBadge = null, yourBadge = null }) {
    const you = relationship === 'ally' ? '' : 'nv-you-rival';
    return `<div class="nv-pair" style="--nv-accent:${accent}">${circleHtml(theirSrc, theirName, size, { accent, badge: theirBadge, badgeSide: 'left' })}<span class="nv-mark ${relationship}" style="width:${Math.round(size * 0.7)}px;height:${Math.round(size * 0.7)}px">${markFor(relationship)}</span>${circleHtml(yourSrc, 'You', size, { accent, cls: you, badge: yourBadge })}</div>`;
}

// The match itself: [edit A] VS [edit B]. A pick is ringed (their pick in the accent colour, yours in white, a shared pick in
// green); the other edit is dimmed. Their avatar sits on the edit they picked (bottom-left), yours on yours (bottom-right).
export function editsPairHtml({ edits, theirSrc, theirName, yourSrc, relationship, size = 44, accent }) {
    const w = Math.round(size * 1.5);
    const av = Math.max(18, Math.round(size * 0.5));
    const side = (s, outer) => {
        const theirs = s.key === edits.theirKey, yours = s.key === edits.yourKey;
        const ring = theirs && yours ? ALLY_ACCENT : theirs ? accent : yours ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.12)';
        const cls = (theirs || yours) ? 'nv-pick' : 'nv-dim';
        // Badges hug the outer edge of the thumbnail so they never cover the VS marker; when both people picked the same
        // edit the second badge tucks in beside the first.
        const o = outer === 'left' ? 'nv-who-left' : 'nv-who-right';
        const inset = outer === 'left' ? 'nv-who-inset-left' : 'nv-who-inset-right';
        const badges = (theirs ? circleHtml(theirSrc, theirName, av, { accent, cls: `nv-who ${o}` }) : '')
            + (yours ? circleHtml(yourSrc, 'You', av, { accent: 'rgba(255,255,255,0.7)', cls: `nv-who ${theirs ? inset : o}` }) : '');
        return `<span class="nv-edit ${cls}" style="width:${w}px;height:${size}px;--nv-ring:${ring}">${s.thumb ? `<img src="${escapeHtml(s.thumb)}" alt="" onerror="this.remove()">` : ''}${badges}</span>`;
    };
    return `<div class="nv-pair nv-edits" style="--nv-accent:${accent}">${side(edits.left, 'left')}<span class="nv-mark ${relationship}" style="width:${Math.round(size * 0.7)}px;height:${Math.round(size * 0.7)}px">VS</span>${side(edits.right, 'right')}</div>`;
}

export function headlineHtml(text, src, name, accent, size = 22) {
    return `<div class="nv-headline">${circleHtml(src, name, size, { accent })}<span class="nv-headline-text">${escapeHtml(text)}</span></div>`;
}

// Stacked faces for "3 people voted against you"
export function stackHtml(srcs, names, size = 34, accent = DEFAULT_ACCENT) {
    return `<div class="nv-stack">${names.slice(0, 3).map((n, i) => circleHtml(srcs[i], n, size, { accent, cls: 'nv-stacked' })).join('')}</div>`;
}

export function toastHtml(n, { theirSrc, yourSrc, jinxSrc, accent, headline, quip, cta }) {
    return `
    <div class="nv-body" onclick="window.openBulletinMatch && window.openBulletinMatch()">
        <button class="bulletin-close" onclick="event.stopPropagation(); window.dismissBulletin()">×</button>
        ${n.nv?.edits ? editsPairHtml({ edits: n.nv.edits, theirSrc, theirName: n.triggerUsername || n.username, yourSrc, relationship: n.relationship, size: 60, accent }) : pairHtml({ theirSrc, theirName: n.triggerUsername || n.username, yourSrc, relationship: n.relationship, size: 60, accent })}
        ${headlineHtml(headline, theirSrc, n.triggerUsername || n.username, accent, 26)}
        ${quip ? `<div class="nv-jinx">${jinxSrc ? circleHtml(jinxSrc, 'J', 62, { accent, cls: 'nv-jinx-face' }) : ''}<div class="nv-bubble">${escapeHtml(quip)}</div></div>` : ''}
    </div>
    <button class="bulletin-toast-cta nv-cta ${n.relationship}" onclick="window.handleBulletinCTA()">${escapeHtml(cta)}</button>`;
}

// Ally / rival rows: the same "versus" look as the toast (js/notification-visuals.js), compact.
// The whole row opens the match (a per-person group opens its list instead); the button sends the emote.
export function socialRowHtml(n, { headline, timeAgo, championPack }) {
    ensureVersusStyles();
    const ally = n.relationship === 'ally';
    const accent = accentFor(n.relationship, championPack);
    const crowd = n.groupKind === 'match' && n.count > 1;
    const idList = n.ids ? n.ids.join(',') : n.id;
    const headText = headline ? headline.message : socialHeadlineFor(n);
    const nv = n.nv || {};
    const theirSrc = nv.theirSrc || avatarSrc(n.thumbnailUrl) || fallbackAvatarFor(n.triggerUsername);
    const yourSrc = nv.yourSrc || viewerAvatarSrc() || fallbackAvatarFor(globalThis.localStorage?.getItem?.('username'));
    const jinxSrc = championBadgeUrl(championPack);
    const perPersonGroup = !crowd && n.count > 1;

    const leading = crowd
        ? stackHtml((nv.avatars || n.avatars || []).map((a, i) => avatarSrc(a) || fallbackAvatarFor((n.users || [])[i])), n.users || [], 34, accent)
        : (nv.edits ? editsPairHtml({ edits: nv.edits, theirSrc, theirName: n.triggerUsername, yourSrc, relationship: n.relationship, size: 40, accent }) : pairHtml({ theirSrc, theirName: n.triggerUsername, yourSrc, relationship: n.relationship, size: 40, accent }));
    const names = crowd ? (headline?.detail || '') : '';
    const sub = [timeAgo, names].filter(Boolean).map(escapeHtml).join(' · ')
        + (perPersonGroup ? ` · <a class="nv-link" href="#" onclick="expandGroupedNotification('${idList}', event); return false;">All ${n.count} matches</a>` : '');
    const quote = (!crowd && n.detail)
        ? `<div class="nv-quote">${jinxSrc ? circleHtml(jinxSrc, 'J', 24, { accent }) : ''}<span class="q">"${escapeHtml(n.detail)}"</span></div>` : '';
    const cta = crowd ? '' : `
        <div class="notification-item-footer">
            <button class="notification-item-cta"
                    style="background: linear-gradient(135deg, ${accent}, ${ally ? '#22c55e' : '#ff1493'}); border: 0; color: ${ally ? '#0f0b18' : '#fff'};"
                    data-id="${idList}" data-action="${n.ctaAction}"
                    ${n.ctaAction === 'send-emote' ? `data-target-user="${escapeHtml(n.triggerUserId)}"` : ''}
                    data-url="${escapeHtml(n.targetUrl || '')}">${n.ctaAction === 'send-emote' ? '<span class="cta-loading">Checking...</span>' : escapeHtml(n.ctaText || 'View match')}</button>
        </div>`;
    const open = perPersonGroup ? `data-group="${idList}"` : `data-url="${escapeHtml(n.targetUrl || '')}"`;
    const unread = !n.read && !n.dismissed ? 'unread' : '';

    return `
        <div class="notification-item nv-row ${n.relationship} ${unread}" data-id="${idList}" data-from-champion="${escapeHtml(championPack?.id || '')}" data-relationship="${n.relationship}"
             ${open} title="${escapeHtml(n.matchTitle || '')}"
             style="--nv-accent:${accent}; --nv-line:${ally ? 'rgba(74,222,128,0.35)' : 'rgba(255,105,180,0.35)'}; --nv-accent-text:${ally ? '#86efac' : '#ff9bd6'}">
            <button class="notification-item-dismiss" data-id="${idList}" aria-label="Dismiss">×</button>
            <div class="nv-top">
                ${leading}
                <div class="nv-text">
                    ${crowd ? `<div class="nv-headline"><span class="nv-headline-text">${escapeHtml(headText)}</span></div>` : headlineHtml(headText, theirSrc, n.triggerUsername, accent, 20)}
                    <div class="nv-sub">${sub}</div>
                </div>
            </div>
            ${quote}
            ${cta}
        </div>`;
}

function socialHeadlineFor(n) {
    return `${n.triggerUsername || 'Someone'} voted ${n.relationship === 'ally' ? 'with' : 'against'} you`;
}


let stylesAdded = false;
export function ensureVersusStyles() {
    if (stylesAdded || typeof document === 'undefined' || document.getElementById('versus-styles')) { stylesAdded = true; return; }
    stylesAdded = true;
    const s = document.createElement('style');
    s.id = 'versus-styles';
    s.textContent = `
.nv-av{position:relative;display:inline-flex;flex-shrink:0}
.nv-badge-left{right:auto !important;left:-6px}
.nv-badge{position:absolute;right:-6px;bottom:-6px;z-index:3;border-radius:6px;object-fit:cover;border:2px solid #1a1226;box-shadow:0 2px 6px rgba(0,0,0,.5);background:#2b1747}
.nv-circle{position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;border-radius:50%;overflow:hidden;background:#3a2760;color:#fff;font-weight:700;border:2px solid var(--nv-accent,#ff69b4)}
.nv-circle img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.nv-you-rival{border-color:rgba(255,255,255,.5)}
.nv-pair{display:flex;align-items:center;justify-content:center}
.nv-mark{display:inline-flex;align-items:center;justify-content:center;margin:0 -6px;z-index:2;border-radius:50%;box-sizing:border-box;background:#0f0b18;border:2px solid var(--nv-accent,#ff69b4);color:#ff9bd6;font-weight:700;font-size:13px;letter-spacing:.03em}
.nv-mark.ally{color:#86efac;font-size:18px}
.nv-headline{display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;color:#fff}
.nv-headline-text{min-width:0}
/* match pair: two edit pictures */
.nv-edit{position:relative;display:inline-block;flex-shrink:0;box-sizing:border-box;border-radius:10px;background:#2b1747;border:2px solid var(--nv-ring)}
.nv-edit>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px}
.nv-edit.nv-dim>img{opacity:.4;filter:grayscale(.7)}
.nv-edit.nv-pick{box-shadow:0 0 10px var(--nv-ring)}
.nv-who{position:absolute !important;bottom:-8px;z-index:3;box-shadow:0 2px 6px rgba(0,0,0,.5)}
.nv-who-left{left:-6px}
.nv-who-right{right:-6px}
.nv-who-inset-left{left:calc(50% - 4px)}
.nv-who-inset-right{right:calc(50% - 4px)}
.nv-edits .nv-mark{margin:0 -8px}
.nv-stack{display:flex;flex-shrink:0}
.nv-stacked{border:2px solid #1a1226}
.nv-stack .nv-av+.nv-av{margin-left:-10px}

/* pop-up toast */
.bulletin-banner.versus-toast{background:#1a1226 !important;border:1px solid var(--nv-accent);box-shadow:0 8px 32px rgba(0,0,0,.6),0 0 24px var(--nv-glow);color:#fff}
.bulletin-banner.versus-toast::before,.bulletin-banner.versus-toast::after{display:none !important}
.versus-toast .nv-body{position:relative;cursor:pointer;padding:18px 18px 14px;display:flex;flex-direction:column;gap:10px;background:linear-gradient(90deg,var(--nv-tint),rgba(255,255,255,0) 50%,var(--nv-tint))}
.versus-toast .bulletin-close{position:absolute;top:8px;right:10px;z-index:3}
.versus-toast .nv-headline{font-size:19px}
.versus-toast .nv-jinx{display:flex;align-items:flex-end;gap:12px;margin-top:4px}
.versus-toast .nv-jinx-face{box-shadow:0 0 18px var(--nv-glow)}
.versus-toast .nv-bubble{flex:1;background:#fff;color:#1a1226;border-radius:14px 14px 14px 4px;padding:10px 13px;font-size:15px;font-weight:600;line-height:1.3;margin-bottom:4px}
.versus-toast .nv-cta{display:block;width:100%;border:0;border-radius:0;padding:13px;font-weight:700;letter-spacing:.04em;font-size:14px;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--nv-accent),var(--nv-accent-dark))}
.versus-toast .nv-cta.ally{color:#0f0b18}

/* bell-list row */
.notification-item.nv-row{position:relative;cursor:pointer;background:#1a1226;border:1px solid var(--nv-line);border-radius:14px;padding:12px 14px 12px 18px}
.nv-row .nv-top{display:flex;align-items:center;gap:10px}
.nv-row .nv-text{flex:1;min-width:0;padding-right:18px}
.nv-row .nv-headline{justify-content:flex-start;font-size:14px;gap:6px}
.nv-row .nv-sub{font-size:12px;color:rgba(255,255,255,.55);margin-top:2px}
.nv-row .nv-link{color:var(--nv-accent-text);font-weight:600;cursor:pointer}
.nv-row .nv-quote{display:flex;align-items:center;gap:8px;margin:8px 0 8px}
.nv-row .nv-quote span.q{font-size:12.5px;color:rgba(255,255,255,.8);font-style:italic}
.nv-row .notification-item-dismiss{position:absolute;top:6px;right:8px;background:none;border:0;color:rgba(255,255,255,.45);font-size:18px;line-height:1;cursor:pointer;padding:2px 6px}
.nv-row .notification-item-dismiss:hover{color:#fff}
.nv-row .notification-item-footer{display:block;margin:0}
.nv-row .notification-item-cta{display:block;width:100%;text-align:center;white-space:normal;border-radius:8px;padding:9px;font-weight:700;font-size:12.5px;letter-spacing:.03em}
.nv-row.ally .notification-item-cta{color:#0f0b18}
`;
    document.head.appendChild(s);
}
