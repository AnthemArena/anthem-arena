import { fixAvatarUrl, splashFromAvatar } from './avatar-url.js';
import { songThumb } from './song-thumb.js';
import { getChampionSplashUrl, getChampionTileUrl, ddragonUrl } from './arcane-config.js';
import { lookSkin } from './companion-look.js';
import { readToastStyle } from './notification-prefs.js';
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
        if (/^(https?:|data:|\/)/.test(s)) return fixAvatarUrl(s);
        if (s.startsWith('{')) { try { return avatarSrc(JSON.parse(s)); } catch { return null; } }
        return emojiAvatar(s);
    }
    if (typeof raw === 'object') {
        if (raw.type === 'url') return fixAvatarUrl(raw.value) || null;
        if (raw.type === 'champion') return fixAvatarUrl(raw.imageUrl || raw.value) || null;
        if (raw.type === 'emoji') return raw.value ? emojiAvatar(raw.value) : null;
    }
    return null;
}

export function viewerAvatarSrc(storage = globalThis.localStorage) {
    try { return avatarSrc(storage?.getItem('avatar')); } catch { return null; }
}

// The champion's splash art for the pop-up backdrop (Data Dragon id is the pack id with a capital: jinx -> Jinx).
export function toastSplashUrl(pack, storage = globalThis.localStorage) {
    const id = String(pack?.id || 'jinx');
    return getChampionSplashUrl(id.charAt(0).toUpperCase() + id.slice(1), lookSkin(pack, storage));   // the skin this companion wears (chosen, or Arcane once unlocked)
}

// The viewer's own cover as a pop-up backdrop: the splash of the champion in their avatar, in the skin they wear (the profile
// cover works the same way). Falls back to the cup champion's splash when the avatar is not a champion picture.
export function profileSplashUrl(pack, storage = globalThis.localStorage) {
    let avatar = null;
    try { avatar = JSON.parse(storage.getItem('avatar') || 'null'); } catch { /* none */ }
    return splashFromAvatar(avatar) || toastSplashUrl(pack, storage);
}

// Splash art that matches a person's champion avatar, worked out from the picture's own address
// (.../champion/Heimerdinger.png, .../tiles/Vi_0.jpg). No lookup needed; null when the avatar is not a champion picture.
export function splashFromAvatarSrc(src) {
    const m = /\/champion\/(?:tiles\/|loading\/|splash\/|centered\/)?([A-Za-z]+)(?:_\d+)?\.(?:png|jpg)/.exec(String(src || ''));
    return m ? getChampionSplashUrl(m[1]) : null;
}

// The champion's speech bubble used inside pop-ups: same look as the vote modal (dark card, pink edge, tail at the portrait).
export function bubbleHtml(text, jinxSrc, accent) {
    if (!text) return '';
    return `<div class="nv-jinx">${jinxSrc ? circleHtml(jinxSrc, 'J', 52, { accent, cls: 'nv-jinx-face' }) : ''}<div class="nv-bubble">${escapeHtml(text)}</div></div>`;
}

// Achievement pop-up in the same family as the other alerts: icon, "Achievement unlocked", name, the champion's line, button.
export function achievementToastHtml(n, { icon, name, line, xp, rarity, jinxSrc, accent, cta }) {
    return `
    <div class="nv-body" onclick="window.handleBulletinCTA()">
        <button class="bulletin-close" onclick="event.stopPropagation(); window.dismissBulletin()">×</button>
        <div class="nv-follow-face">${circleHtml(icon, name, 64, { accent })}</div>
        <div class="nv-headline nv-toast-headline" style="justify-content:center;text-align:center"><span class="nv-headline-text"><span class="nv-toast-action">ACHIEVEMENT UNLOCKED</span><span class="nv-toast-name" style="white-space:normal">${escapeHtml(name)}</span></span></div>
        ${xp || rarity ? `<div class="nv-chips">${xp ? `<span class="nv-chip">+${escapeHtml(xp)} XP</span>` : ''}${rarity ? `<span class="nv-chip">${escapeHtml(rarity)}</span>` : ''}</div>` : ''}
        ${bubbleHtml(line, jinxSrc, accent)}
    </div>
    <button class="bulletin-toast-cta nv-cta follow" onclick="window.handleBulletinCTA()">${escapeHtml(cta || 'View achievements')}</button>`;
}

// The companion's face: the tile of the skin it wears (see companion-look.js), otherwise its plain icon.
export function championBadgeUrl(pack, storage = globalThis.localStorage) {
    const skin = lookSkin(pack, storage);
    if (skin && pack?.id) return getChampionTileUrl(pack.id.charAt(0).toUpperCase() + pack.id.slice(1), skin);
    return pack?.icon || null;
}

// Someone with no picture gets a stable Arcane champion (same pick every time for the same name), like new accounts do.
const FALLBACK_CHAMPIONS = ['Vi', 'Caitlyn', 'Ekko', 'Jayce', 'Viktor', 'Heimerdinger', 'Jinx'];
export function fallbackAvatarFor(name) {
    const s = String(name || '?');
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ddragonUrl(`img/champion/${FALLBACK_CHAMPIONS[h % FALLBACK_CHAMPIONS.length]}.png`);
}

// The two edits of a match as pictures, in match order (song1 left, song2 right), plus which side each person picked.
// yourKey = 'song1' | 'song2'; a rival picked the other edit, an ally the same one. null when we can't tell.
export const videoThumb = id => (id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null);
export function matchEdits(match, yourKey, relationship) {
    if (!match || (yourKey !== 'song1' && yourKey !== 'song2')) return null;
    const l = songThumb(match.song1), r = songThumb(match.song2);
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
// green); the other edit is dimmed. No avatars or labels on the pictures: the rings tell the story.
export function editsPairHtml({ edits, relationship, size = 44, accent, mark = null }) {
    const w = Math.round(size * 1.5);
    const side = (s, outer) => {
        const theirs = s.key === edits.theirKey, yours = s.key === edits.yourKey;
        const ring = edits.both ? accent : edits.neutral ? 'rgba(255,255,255,0.4)' : theirs && yours ? ALLY_ACCENT : theirs ? accent : yours ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.12)';
        const cls = (theirs || yours || edits.neutral || edits.both) ? 'nv-pick' : 'nv-dim';
        return `<span class="nv-edit ${cls}" style="width:${w}px;height:${size}px;--nv-ring:${ring}">${s.thumb ? `<img src="${escapeHtml(s.thumb)}" alt="" onerror="this.remove()">` : ''}</span>`;
    };
    return `<div class="nv-pair nv-edits" style="--nv-accent:${accent}">${side(edits.left, 'left')}<span class="nv-mark ${relationship}${mark ? ' nv-mark-event' : ''}" style="width:${Math.round(size * 0.7)}px;height:${Math.round(size * 0.7)}px${mark ? `;font-size:${Math.round(size * 0.36)}px` : ''}">${escapeHtml(mark || 'VS')}</span>${side(edits.right, 'right')}</div>`;
}

export function headlineHtml(text, src, name, accent, size = 22) {
    return `<div class="nv-headline">${circleHtml(src, name, size, { accent })}<span class="nv-headline-text">${escapeHtml(text)}</span></div>`;
}

// Stacked faces for "3 people voted against you"
export function stackHtml(srcs, names, size = 34, accent = DEFAULT_ACCENT) {
    return `<div class="nv-stack">${names.slice(0, 3).map((n, i) => circleHtml(srcs[i], n, size, { accent, cls: 'nv-stacked' })).join('')}</div>`;
}

// Toast headline: avatar + name on one line, the action ("voted against you") underneath, so a long name wraps cleanly.
export function toastHeadlineHtml(headline, src, name, accent, { avatar = true } = {}) {
    const text = String(headline || '');
    const who = String(name || '');
    const action = who && text.startsWith(who) ? text.slice(who.length).trim() : text;
    return `<div class="nv-headline nv-toast-headline">${avatar ? circleHtml(src, name, 34, { accent }) : ''}<span class="nv-headline-text"><span class="nv-toast-name">${escapeHtml(who)}</span><span class="nv-toast-action">${escapeHtml(action)}</span></span></div>`;
}

export function toastHtml(n, { theirSrc, yourSrc, jinxSrc, accent, headline, quip, cta }) {
    return `
    <div class="nv-body" ${n.matchTitle ? `title="${escapeHtml(n.matchTitle)}"` : ''} onclick="window.openBulletinMatch && window.openBulletinMatch()">
        <button class="bulletin-close" onclick="event.stopPropagation(); window.dismissBulletin()">×</button>
        ${n.nv?.edits ? editsPairHtml({ edits: n.nv.edits, theirSrc, theirName: n.triggerUsername || n.username, yourSrc, relationship: n.relationship, size: 60, accent }) : pairHtml({ theirSrc, theirName: n.triggerUsername || n.username, yourSrc, relationship: n.relationship, size: 60, accent })}
        ${n.matchTitle ? `<div class="nv-caption">${escapeHtml(n.matchTitle)}</div>` : ''}
        ${toastHeadlineHtml(headline, theirSrc, n.triggerUsername || n.username, accent)}
        ${bubbleHtml(quip, jinxSrc, accent)}
    </div>
    <button class="bulletin-toast-cta nv-cta ${n.relationship}" onclick="window.handleBulletinCTA()">${escapeHtml(cta)}</button>`;
}

// Ally / rival rows: the same "versus" look as the toast (js/notification-visuals.js), compact.
// The whole row opens the match (a per-person group opens its list instead); the button opens the other voter's profile.
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
                    data-url="${escapeHtml(n.ctaUrl || n.targetUrl || '')}">${n.ctaAction === 'send-emote' ? '<span class="cta-loading">Checking...</span>' : escapeHtml(n.ctaText || 'View match')}</button>
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

// New follower: avatar + name, a Jinx line and one button ("Follow back", or "View profile" when you already follow them).
// The whole row opens their profile (data-url). Same card family as the ally / rival rows, in the pack's accent colour.
export function followRowHtml(n, { headline, quip, timeAgo, championPack, theirSrc, alreadyFollowing = false }) {
    ensureVersusStyles();
    const accent = championPack?.color || DEFAULT_ACCENT;
    const jinxSrc = championBadgeUrl(championPack);
    const name = n.triggerUsername || 'Someone';
    const src = theirSrc || avatarSrc(n.thumbnailUrl) || fallbackAvatarFor(name);
    const idList = n.ids ? n.ids.join(',') : n.id;
    const unread = !n.read && !n.dismissed ? 'unread' : '';
    const url = n.targetUrl || `/profile.html?user=${encodeURIComponent(name)}`;
    const button = alreadyFollowing
        ? `<button class="notification-item-cta" style="background: linear-gradient(135deg, ${accent}, #ff1493); border: 0; color: #fff;" data-id="${idList}" data-action="navigate" data-url="${escapeHtml(url)}">View profile</button>`
        : `<button class="notification-item-cta" style="background: linear-gradient(135deg, ${accent}, #ff1493); border: 0; color: #fff;" data-id="${idList}" data-action="follow-back" data-user-id="${escapeHtml(n.triggerUserId || '')}" data-username="${escapeHtml(name)}" data-url="${escapeHtml(url)}">Follow back</button>`;
    return `
        <div class="notification-item nv-row nv-follow-row ${unread}" data-id="${idList}" data-from-champion="${escapeHtml(championPack?.id || '')}" data-url="${escapeHtml(url)}"
             title="Open ${escapeHtml(name)}'s profile"
             style="--nv-accent:${accent}; --nv-line:rgba(255,105,180,0.35); --nv-accent-text:#ff9bd6">
            <button class="notification-item-dismiss" data-id="${idList}" aria-label="Dismiss">×</button>
            <div class="nv-top">
                ${circleHtml(src, name, 40, { accent })}
                <div class="nv-text">
                    <div class="nv-headline"><span class="nv-headline-text">${escapeHtml(headline)}</span></div>
                    <div class="nv-sub">${escapeHtml(timeAgo || '')}</div>
                </div>
            </div>
            ${quip ? `<div class="nv-quote">${jinxSrc ? circleHtml(jinxSrc, 'J', 24, { accent }) : ''}<span class="q">"${escapeHtml(quip)}"</span></div>` : ''}
            <div class="notification-item-footer">${button}</div>
        </div>`;
}

// The pop-up version: their face large, name + action, Jinx's line, and the button bar.
export function followToastHtml(n, { theirSrc, jinxSrc, accent, quip, cta, headline }) {
    const name = n.triggerUsername || n.username || 'Someone';
    return `
    <div class="nv-body" onclick="window.openBulletinMatch && window.openBulletinMatch()">
        <button class="bulletin-close" onclick="event.stopPropagation(); window.dismissBulletin()">×</button>
        <div class="nv-follow-face">${circleHtml(theirSrc, name, 64, { accent })}</div>
        ${toastHeadlineHtml(headline || `${name} followed you`, null, name, accent, { avatar: false })}
        ${bubbleHtml(quip, jinxSrc, accent)}
    </div>
    <button class="bulletin-toast-cta nv-cta follow" onclick="window.handleBulletinCTA()">${escapeHtml(cta)}</button>`;
}

// Likes / comments / replies / mentions. One card for all four: face (or stacked faces for a crowd), "who + action", the words
// that were liked or written, and one button that opens the post. Same family as the follow and ally / rival cards.
// parts = { who, action, headline, names } from contentHeadline(); quote = contentQuote() text ('' for none).
export function contentRowHtml(n, { parts, quote, icon, cta, timeAgo, championPack, srcs = [], names = [] }) {
    ensureVersusStyles();
    const accent = championPack?.color || DEFAULT_ACCENT;
    const idList = n.ids ? n.ids.join(',') : n.id;
    const unread = !n.read && !n.dismissed ? 'unread' : '';
    const url = n.targetUrl || '/feed.html';
    const crowd = names.length > 1;
    const face = crowd ? stackHtml(srcs, names, 34, accent) : circleHtml(srcs[0], names[0] || n.triggerUsername, 40, { accent });
    const sub = [timeAgo, parts.names].filter(Boolean).map(escapeHtml).join(' · ');
    return `
        <div class="notification-item nv-row nv-content-row nv-kind-${escapeHtml(n.type)} ${unread}" data-id="${idList}" data-from-champion="${escapeHtml(championPack?.id || '')}" data-url="${escapeHtml(url)}"
             style="--nv-accent:${accent}; --nv-line:rgba(255,105,180,0.35); --nv-accent-text:#ff9bd6">
            <button class="notification-item-dismiss" data-id="${idList}" aria-label="Dismiss">×</button>
            <div class="nv-top">
                ${face}
                <div class="nv-text">
                    <div class="nv-headline"><span class="nv-headline-text"><span class="nv-kind">${escapeHtml(icon || '')}</span>${escapeHtml(parts.headline)}</span></div>
                    <div class="nv-sub">${sub}</div>
                </div>
            </div>
            ${quote ? `<div class="nv-content">${escapeHtml(quote)}</div>` : ''}
            <div class="notification-item-footer">
                <button class="notification-item-cta" style="background: linear-gradient(135deg, ${accent}, #ff1493); border: 0; color: #fff;" data-id="${idList}" data-action="navigate" data-url="${escapeHtml(url)}">${escapeHtml(cta || 'View')}</button>
            </div>
        </div>`;
}

// The pop-up version of the same card.
export function contentToastHtml(n, { parts, quote, icon, cta, accent, srcs = [], names = [] }) {
    const crowd = names.length > 1;
    const face = crowd ? stackHtml(srcs, names, 52, accent) : circleHtml(srcs[0], names[0] || n.triggerUsername, 64, { accent });
    return `
    <div class="nv-body" onclick="window.openBulletinMatch && window.openBulletinMatch()">
        <button class="bulletin-close" onclick="event.stopPropagation(); window.dismissBulletin()">×</button>
        <div class="nv-follow-face">${face}</div>
        ${toastHeadlineHtml(parts.headline, null, parts.who, accent, { avatar: false })}
        ${quote ? `<div class="nv-content nv-content-toast"><span class="nv-kind">${escapeHtml(icon || '')}</span>${escapeHtml(quote)}</div>` : ''}
    </div>
    <button class="bulletin-toast-cta nv-cta follow" onclick="window.handleBulletinCTA()">${escapeHtml(cta || 'View')}</button>`;
}

// ---------- match-event alerts ----------
export const hexToRgba = (hex, a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return `rgba(255,105,180,${a})`;
    const v = parseInt(m[1], 16);
    return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
};
export const darken = (hex, f = 0.25) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#c2185b';
    const v = parseInt(m[1], 16), k = c => Math.round(c * (1 - f)).toString(16).padStart(2, '0');
    return `#${k(v >> 16)}${k((v >> 8) & 255)}${k(v & 255)}`;
};

// What the two edit pictures show for an event: the viewer's pick ringed in the alert's colour, the other dimmed
// (a match nobody has voted in yet shows both, evenly). yourKey = 'song1' | 'song2' | undefined.
export function eventEdits(match, yourKey, both = false) {
    if (!match) return null;
    const l = songThumb(match.song1), r = songThumb(match.song2);
    if (!l && !r) return null;
    const picked = yourKey === 'song1' || yourKey === 'song2';
    return { left: { key: 'song1', thumb: l }, right: { key: 'song2', thumb: r }, yourKey: null, theirKey: picked ? yourKey : null, neutral: !picked && !both, both: !!both };
}

// A tidy list of the edits entering a round: up to `max` pictures and how many more there are. matches = live matches of that round.
export function entrantsStrip(matches, max = 5) {
    const thumbs = [];
    let total = 0;
    for (const m of matches || []) for (const s of [m.song1, m.song2]) {
        if (!s) continue;
        total++;
        const t = songThumb(s);
        if (t && thumbs.length < max) thumbs.push(t);
    }
    return thumbs.length ? { thumbs, more: Math.max(0, total - thumbs.length) } : null;
}
export function stripHtml(strip, accent, size = 34) {
    if (!strip || !strip.thumbs?.length) return '';
    return `<div class="nv-strip" style="--nv-accent:${accent}">${strip.thumbs.map(t => `<span class="nv-strip-th" style="width:${Math.round(size * 1.35)}px;height:${size}px"><img src="${escapeHtml(t)}" alt="" onerror="this.parentNode.remove()"></span>`).join('')}${strip.more > 0 ? `<span class="nv-strip-more" style="height:${size}px;min-width:${size}px">+${strip.more}</span>` : ''}</div>`;
}

// The big round number for a level-up.
export function levelBadgeHtml(level, accent, size = 64) {
    return `<div class="nv-lead nv-follow-face" role="img" aria-label="Level up" title="Level up"><span class="nv-av"><span class="nv-circle" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;--nv-accent:${accent}">${escapeHtml(String(level ?? '?'))}</span><span class="nv-glyph-pip" style="--nv-accent:${accent}">▲</span></span></div>`;
}

// The champion's line without a leading symbol that the picture above already shows ("👋 Welcome back!" under a 👋 circle).
export function withoutLeadingGlyph(text, glyph) {
    const t = String(text ?? '');
    if (!glyph || glyph === 'VS') return t;
    const g = String(glyph).replace(/\uFE0F/g, '');
    const plain = t.replace(/^\s+/, '').replace(/\uFE0F/g, '');
    return plain.startsWith(g) ? plain.slice(g.length).replace(/^[\s:\-–—]+/, '') || t : t;
}

// The picture at the top of a match-event card: the two edits with the state symbol between them, or, with no match to show,
// the symbol alone in a ringed circle (same size, so the card does not jump when the edits arrive). label = hover / screen-reader text.
export function eventLeadHtml({ glyph, label, edits, accent, size = 60 }) {
    const g = glyph && glyph !== 'VS' ? glyph : null;
    const inner = edits
        ? editsPairHtml({ edits, relationship: 'event', size, accent, mark: g })
        : `<span class="nv-av"><span class="nv-circle nv-glyph" style="width:${Math.round(size * 1.07)}px;height:${Math.round(size * 1.07)}px;font-size:${Math.round(size * 0.46)}px;--nv-accent:${accent}">${escapeHtml(g || 'VS')}</span></span>`;
    return `<div class="nv-lead nv-follow-face" role="img" aria-label="${escapeHtml(label || '')}" title="${escapeHtml(label || '')}">${inner}</div>`;
}

// Pop-up: [edit A] VS [edit B], a small tag line, the champion's words in a bubble, a few chips, one button. The whole card opens the match.
export function eventToastHtml(n, { tag, glyph, edits, strip = null, accent, jinxSrc, quip, detail, chips = [], cta, leadHtml = '' }) {
    if (strip) chips = chips.filter(c => !/^\d+ matches?$/.test(c));   // the picture strip says it better
    return `
    <div class="nv-body" ${n.matchTitle ? `title="${escapeHtml(n.matchTitle)}"` : ''} onclick="window.handleBulletinCTA()">
        <button class="bulletin-close" onclick="event.stopPropagation(); window.dismissBulletin()">×</button>
        ${n.matchTitle || (!leadHtml && tag) ? `<div class="nv-caption">${escapeHtml(n.matchTitle || tag)}</div>` : ''}
        ${leadHtml || eventLeadHtml({ glyph, label: tag, edits, accent, size: 60 })}
        ${bubbleHtml(withoutLeadingGlyph(quip, glyph), jinxSrc, accent)}
        ${detail ? `<div class="nv-event-detail">${escapeHtml(detail)}</div>` : ''}
        ${stripHtml(strip, accent, 34)}
        ${chips.length ? `<div class="nv-chips">${chips.map(c => `<span class="nv-chip nv-chip-plain">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
    </div>
    <button class="bulletin-toast-cta nv-cta event" onclick="window.handleBulletinCTA()">${escapeHtml(cta || 'View match')}</button>`;
}

// Bell-list row: the same card, compact. The whole row opens the match; the button does the same.
export function eventRowHtml(n, { tag, glyph, edits, strip = null, accent, jinxSrc, quip, timeAgo, championPack, cta, url }) {
    ensureVersusStyles();
    const idList = n.ids ? n.ids.join(',') : n.id;
    const unread = !n.read && !n.dismissed ? 'unread' : '';
    const lead = eventLeadHtml({ glyph, label: tag, edits, accent, size: 40 });
    const sub = [timeAgo, n.matchTitle].filter(Boolean).map(escapeHtml).join(' · ');
    const quote = quip ? `<div class="nv-quote">${jinxSrc ? circleHtml(jinxSrc, 'J', 24, { accent }) : ''}<span class="q">"${escapeHtml(withoutLeadingGlyph(quip, glyph))}"</span></div>` : '';
    return `
        <div class="notification-item nv-row nv-event-row ${unread}" data-id="${idList}" data-from-champion="${escapeHtml(championPack?.id || '')}" data-url="${escapeHtml(url || '')}"
             title="${escapeHtml(n.matchTitle || '')}"
             style="--nv-accent:${accent}; --nv-line:${hexToRgba(accent, 0.4)}; --nv-accent-text:${accent}">
            <button class="notification-item-dismiss" data-id="${idList}" aria-label="Dismiss">×</button>
            <div class="nv-top">
                ${lead}
                <div class="nv-text">
                    <div class="nv-headline"><span class="nv-headline-text">${escapeHtml(tag)}</span></div>
                    <div class="nv-sub">${sub}</div>
                </div>
            </div>
            ${quote}
            ${stripHtml(strip, accent, 26)}
            <div class="notification-item-footer">
                <button class="notification-item-cta" style="background: linear-gradient(135deg, ${accent}, ${darken(accent)}); border: 0; color: #0f0b18;" data-id="${idList}" data-action="navigate" data-url="${escapeHtml(url || '')}">${escapeHtml(cta || 'View match')}</button>
            </div>
        </div>`;
}

function socialHeadlineFor(n) {
    return `${n.triggerUsername || 'Someone'} voted ${n.relationship === 'ally' ? 'with' : 'against'} you`;
}


let stylesAdded = false;
// The viewer's chosen toast style goes on <html> so the CSS below can restyle every pop-up without touching their markup.
// Side art wants the splash cropped around the champion (Data Dragon's "centered" version of the same skin); falls back to the normal splash if that file is missing.
export function setCenteredSplash(banner) {
    const normal = banner?.style?.getPropertyValue('--nv-splash') || '';
    const m = /url\(["']?([^"')]+)["']?\)/.exec(normal);
    if (!m || typeof Image === 'undefined') return;
    const centered = m[1].replace('/champion/splash/', '/champion/centered/');
    if (centered === m[1]) { banner.style.setProperty('--nv-splash-c', normal); return; }
    banner.style.setProperty('--nv-splash-c', normal);
    const img = new Image();
    img.onload = () => banner.style.setProperty('--nv-splash-c', `url("${centered}")`);
    img.src = centered;
}

export function applyToastStyle(style = readToastStyle()) {
    if (typeof document !== 'undefined') document.documentElement.dataset.toastStyle = style;
}

export function ensureVersusStyles() {
    applyToastStyle();
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
.nv-edits .nv-mark{margin:0 -8px}
.nv-stack{display:flex;flex-shrink:0}
.nv-stacked{border:2px solid #1a1226}
.nv-stack .nv-av+.nv-av{margin-left:-10px}

/* pop-up toast */
.bulletin-banner.versus-toast{background:#1a1226 !important;border:1px solid var(--nv-accent);box-shadow:0 8px 32px rgba(0,0,0,.6),0 0 24px var(--nv-glow);color:#fff}
.bulletin-banner.versus-toast::before,.bulletin-banner.versus-toast::after{display:none !important}
/* the splash is its own header strip (--nv-art tall, full toast width); it fades out smoothly and the content overlaps its lower part so the two read as one card */
.versus-toast .nv-body{position:relative;cursor:pointer;padding:calc(var(--nv-art,160px) - 46px) 16px 14px;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;gap:10px;background:linear-gradient(90deg,var(--nv-tint),rgba(255,255,255,0) 50%,var(--nv-tint)),#120a18}
.versus-toast .nv-body::before{content:'';position:absolute;top:0;left:0;right:0;height:var(--nv-art,160px);pointer-events:none;z-index:-1;background:var(--nv-splash,none) center 20%/cover no-repeat;-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 38%,rgba(0,0,0,.55) 66%,transparent 100%);mask-image:linear-gradient(180deg,#000 0%,#000 38%,rgba(0,0,0,.55) 66%,transparent 100%)}
/* the same splash, stretched and heavily blurred, tints the card body so the fade picks up the art's own colours (kept dim so the text stays readable) */
.versus-toast .nv-body::after{content:'';position:absolute;inset:0;z-index:-2;pointer-events:none;background:var(--nv-splash,none) center/cover no-repeat;filter:blur(26px) saturate(1.35);transform:scale(1.3);opacity:.8;-webkit-mask-image:linear-gradient(180deg,#000 0%,rgba(0,0,0,.45) 100%);mask-image:linear-gradient(180deg,#000 0%,rgba(0,0,0,.45) 100%)}
@media (max-width:480px){.versus-toast .nv-body{--nv-art:120px}}
/* toast styles (Settings > Notifications): classic is the rules above; the others override them */
.versus-toast .nv-caption{display:none}
/* full art: the splash is the whole card; no match thumbnails, a caption on the art, and the champion's words in a frosted bubble over it */
html[data-toast-style="full"] .versus-toast .nv-body{--nv-art:300px;padding-top:150px}
html[data-toast-style="full"] .versus-toast .nv-body::before{height:100%;-webkit-mask-image:none;mask-image:none;background-position:center 14%}
html[data-toast-style="full"] .versus-toast .nv-body::after{inset:0;z-index:-1;transform:none;filter:none;opacity:1;-webkit-mask-image:none;mask-image:none;background:linear-gradient(180deg,rgba(18,10,24,0) 0%,rgba(18,10,24,0) 42%,rgba(18,10,24,.38) 64%,rgba(18,10,24,.82) 100%)}
html[data-toast-style="full"] .versus-toast .nv-edits,html[data-toast-style="full"] .versus-toast .nv-strip,html[data-toast-style="full"] .versus-toast .nv-lead:has(.nv-edits){display:none}
html[data-toast-style="full"] .versus-toast .nv-caption{display:block;position:absolute;top:10px;left:12px;max-width:calc(100% - 60px);padding:3px 11px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#fff;background:rgba(18,10,24,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
html[data-toast-style="full"] .versus-toast .nv-bubble{background:rgba(11,13,24,.55);-webkit-backdrop-filter:blur(10px) saturate(1.2);backdrop-filter:blur(10px) saturate(1.2)}
html[data-toast-style="full"] .versus-toast .nv-bubble::before{background:rgba(11,13,24,.55)}
html[data-toast-style="full"] .versus-toast .nv-chip{background:rgba(18,10,24,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
@media (max-width:480px){html[data-toast-style="full"] .versus-toast .nv-body{padding-top:110px}}
/* side art: a tall column of centred art on the left (faded into the card); caption, bubble and pills on the right */
html[data-toast-style="side"] .versus-toast .nv-body{--nv-art:100px;padding:12px 12px 10px 114px;gap:8px;min-height:136px;justify-content:center}
html[data-toast-style="side"] .versus-toast .nv-body::before{top:0;bottom:0;left:0;right:auto;height:auto;width:var(--nv-art);background-image:var(--nv-splash-c,var(--nv-splash,none));background-position:center top;filter:brightness(1.18) saturate(1.1);-webkit-mask-image:linear-gradient(90deg,#000 58%,transparent 100%);mask-image:linear-gradient(90deg,#000 58%,transparent 100%)}
html[data-toast-style="side"] .versus-toast .nv-edits,html[data-toast-style="side"] .versus-toast .nv-strip,html[data-toast-style="side"] .versus-toast .nv-lead:has(.nv-edits),html[data-toast-style="side"] .versus-toast .nv-jinx-face{display:none}
html[data-toast-style="side"] .versus-toast .nv-caption{display:block;text-align:left;padding-right:30px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--nv-accent-text,#ff9bd6);opacity:.9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
html[data-toast-style="side"] .versus-toast .nv-bubble::before{display:none}
html[data-toast-style="side"] .versus-toast .nv-chips{justify-content:flex-start}
@media (max-width:480px){html[data-toast-style="side"] .versus-toast .nv-body{--nv-art:70px;padding-left:84px}}
/* minimal: no box at all, just a larger portrait and the champion's bubble (the × sits on the bubble's corner). The whole thing opens the match;
   a small arrow says so and the match name is the hover text. */
html[data-toast-style="minimal"] .bulletin-banner.versus-toast{background:transparent !important;border:0 !important;box-shadow:none !important;overflow:visible !important}
html[data-toast-style="minimal"] .versus-toast .nv-body{padding:10px 10px 10px 0;gap:0;background:transparent;overflow:visible;isolation:auto}
html[data-toast-style="minimal"] .versus-toast .nv-body::before,html[data-toast-style="minimal"] .versus-toast .nv-body::after{display:none}
html[data-toast-style="minimal"] .versus-toast .nv-edits,html[data-toast-style="minimal"] .versus-toast .nv-strip,html[data-toast-style="minimal"] .versus-toast .nv-chips,html[data-toast-style="minimal"] .versus-toast .nv-caption,html[data-toast-style="minimal"] .versus-toast .nv-event-detail,html[data-toast-style="minimal"] .versus-toast .nv-lead:has(.nv-edits),html[data-toast-style="minimal"] .versus-toast .nv-cta{display:none}
html[data-toast-style="minimal"] .versus-toast .nv-jinx{margin-top:0;gap:12px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.55))}
html[data-toast-style="minimal"] .versus-toast .nv-jinx .nv-circle{width:78px !important;height:78px !important;font-size:32px !important}
html[data-toast-style="minimal"] .versus-toast .nv-bubble{padding:12px 30px 12px 16px;background:rgba(14,10,24,.94)}
html[data-toast-style="minimal"] .versus-toast .nv-bubble::after{content:'›';position:absolute;right:10px;bottom:6px;font-size:22px;line-height:1;color:var(--nv-accent,#ff69b4)}
html[data-toast-style="minimal"] .versus-toast .bulletin-close{top:0;right:0;width:22px;height:22px;font-size:14px}
.versus-toast .bulletin-close{position:absolute;top:8px;right:10px;z-index:3;width:24px;height:24px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:15px;line-height:1;color:rgba(255,255,255,.9);background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.22);box-shadow:none}
.versus-toast .bulletin-close:hover{background:rgba(0,0,0,.7);color:#fff}
.versus-toast .nv-headline{font-size:19px}
.versus-toast .nv-toast-headline{justify-content:flex-start;gap:10px;text-align:left}
.versus-toast .nv-toast-headline .nv-headline-text{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.versus-toast .nv-toast-name{font-size:18px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.versus-toast .nv-toast-action{font-size:13px;font-weight:600;color:var(--nv-accent);letter-spacing:.03em}
.versus-toast .nv-jinx{display:flex;align-items:flex-end;gap:12px;margin-top:4px}
.versus-toast .nv-jinx-face{box-shadow:0 0 18px var(--nv-glow)}
.versus-toast .nv-bubble{position:relative;flex:1;min-width:0;background:rgba(11,13,24,.88);color:#f6f3f7;border:1px solid var(--nv-line,rgba(255,79,180,.35));border-radius:16px;padding:10px 14px;font-size:14px;font-weight:700;line-height:1.4;margin-bottom:0;align-self:center;backdrop-filter:blur(6px)}
.versus-toast .nv-bubble::before{content:'';position:absolute;left:-7px;top:50%;width:12px;height:12px;margin-top:-6px;background:rgba(11,13,24,.88);border-left:1px solid var(--nv-line,rgba(255,79,180,.35));border-bottom:1px solid var(--nv-line,rgba(255,79,180,.35));transform:rotate(45deg)}
.versus-toast .nv-jinx{align-items:center;gap:14px}
.versus-toast .nv-chips{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
.versus-toast .nv-chip{padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;color:#ffd6ee;background:rgba(255,79,180,.18);border:1px solid rgba(255,79,180,.4);text-transform:capitalize}
.versus-toast .nv-cta{display:block;width:100%;border:0;border-radius:0;padding:11px;font-weight:700;letter-spacing:.04em;font-size:14px;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--nv-accent),var(--nv-accent-dark))}
.versus-toast .nv-cta.ally{color:#0f0b18}
.versus-toast .nv-follow-face{display:flex;justify-content:center;padding-top:2px}
.versus-toast .nv-follow-face + .nv-toast-headline{justify-content:center;text-align:center}

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
.nv-kind{margin-right:6px}
.nv-row .nv-top + .notification-item-footer{margin-top:10px}
.nv-row .nv-content{margin:8px 0;padding:6px 10px;border-left:3px solid var(--nv-accent);background:rgba(255,255,255,.05);border-radius:0 8px 8px 0;font-size:12.5px;color:rgba(255,255,255,.82);font-style:italic;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.versus-toast .nv-content-toast{margin:2px 0 4px;padding:8px 12px;border-left:3px solid var(--nv-accent);background:rgba(255,255,255,.07);border-radius:0 10px 10px 0;font-size:14px;line-height:1.35;color:#fff;font-style:italic;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.versus-toast .nv-follow-face .nv-stack{justify-content:center}
.nv-mark-event{color:var(--nv-accent);background:#0f0b18;box-shadow:0 0 12px var(--nv-glow,rgba(255,105,180,.35));font-weight:800}
.nv-circle.nv-glyph{background:radial-gradient(circle at 50% 35%,rgba(255,255,255,.08),#0f0b18 70%);color:var(--nv-accent);font-weight:800;box-shadow:0 0 14px var(--nv-glow,rgba(255,105,180,.35));line-height:1}
.nv-glyph-pip{position:absolute;right:-4px;bottom:-4px;z-index:3;width:22px;height:22px;border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:11px;color:#0f0b18;background:var(--nv-accent);border:2px solid #1a1226}
.nv-event-row .nv-lead{padding:0}
.nv-strip{display:flex;align-items:center;justify-content:center;padding-left:8px}
.nv-strip-th{position:relative;display:inline-block;flex-shrink:0;margin-left:-8px;border-radius:8px;overflow:hidden;box-sizing:border-box;border:2px solid #1a1226;box-shadow:0 2px 6px rgba(0,0,0,.5);background:#2b1747}
.nv-strip-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.nv-strip-more{margin-left:-8px;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;border-radius:8px;box-sizing:border-box;font-size:12px;font-weight:800;color:var(--nv-accent);background:#0f0b18;border:2px solid var(--nv-accent)}
.nv-event-row .nv-strip{justify-content:flex-start;margin:6px 0 2px 8px}
.versus-toast .nv-chip-plain{text-transform:none}
.versus-toast .nv-event-detail{text-align:center;font-size:12.5px;color:rgba(255,255,255,.72)}
.versus-toast .nv-edits{margin-top:2px}
.versus-toast .nv-cta.event{color:#0f0b18}
.nv-event-row .nv-headline-text{text-transform:uppercase;font-size:11.5px;letter-spacing:.1em;font-weight:800;color:var(--nv-accent-text)}
.nv-event-row .notification-item-cta{color:#0f0b18}
`;
    document.head.appendChild(s);
}
