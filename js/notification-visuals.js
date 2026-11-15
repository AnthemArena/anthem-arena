import { fixAvatarUrl, splashFromAvatar } from './avatar-url.js';
import { songThumb } from './song-thumb.js';
import { getChampionSplashUrl, getChampionTileUrl, ddragonUrl } from './arcane-config.js';
import { lookSkin } from './companion-look.js';
import { rankBadgeHtml, cleanRankTitle, RANK_BADGE_CSS } from './rank-badges.js';
import { achievementBadgeHtml, hasAchievementIcon, ACHIEVEMENT_BADGE_CSS } from './achievement-icons.js';
// Shared look for ally / rival alerts: the pop-up toast and the bell-list row are the same design at two sizes.
//   [their avatar] VS [your avatar]   (= instead of VS when they voted with you)
//   [avatar] FireReaper voted against you
//   [Jinx] "I already sharpened the rockets..."
//   [ Challenge ]
// Pure helpers (avatarSrc, championBadgeUrl, ...) are tested in tools/test-notification-visuals.mjs.

export const ALLY_ACCENT = '#4ade80';
const DEFAULT_ACCENT = '#ff69b4';

// Notification ids go into attributes and inline handlers: keep only characters an id can have.
const safeIds = s => String(s ?? '').replace(/[^\w,.:-]/g, '');
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
    return `<div class="nv-jinx">${jinxSrc ? circleHtml(jinxSrc, 'J', 52, { accent, cls: 'nv-jinx-face' }) : ''}<div class="nv-bubble">${escapeHtml(text)}<button class="nv-bubble-x" aria-label="Dismiss" onclick="event.stopPropagation(); window.dismissBulletin && window.dismissBulletin()">×</button></div></div>`;
}

// Reward pop-ups (achievement, level up, mastery up): ONE solid card in the same layout. The news comes first (a small label, then the
// biggest text, what it was for, what it paid or unlocked); the champion's line sits underneath as commentary; the × is on the card's corner.
//   lead = HTML for the round picture (icon, number badge or champion face)
export function rewardCardHtml({ label, title, sub, subClass = '', meta, lead, line, jinxSrc, accent, cta, ctaDefault, small }) {
    return `
    <div class="nv-body nv-ach-body" onclick="window.openBulletinMatch()">
        <button class="nv-card-x" aria-label="Dismiss" onclick="event.stopPropagation(); window.dismissBulletin && window.dismissBulletin()">\u00d7</button>
        <div class="nv-ach-head">
            <span class="nv-ach-icon">${lead}</span>
            <span class="nv-ach-text">
                <span class="nv-ach-label">${escapeHtml(label)}</span>
                <span class="nv-ach-name${small ? ' nv-ach-name-many' : ''}">${escapeHtml(title)}</span>
                ${sub ? `<span class="nv-ach-desc ${subClass}">${escapeHtml(sub)}</span>` : ''}
                ${meta ? `<span class="nv-ach-meta">${escapeHtml(meta)}</span>` : ''}
            </span>
        </div>
        ${line ? bubbleHtml(line, jinxSrc, accent) : ''}
    </div>
    <button class="bulletin-toast-cta nv-cta follow" onclick="window.handleBulletinCTA()">${escapeHtml(cta || ctaDefault || 'View')}</button>`;
}

// Achievement: the icon, the label, the name, what it was for, XP and rarity. `items` has more than one entry when several unlocked together.
export function achievementToastHtml(n, { icon, name, line, xp, rarity, description, items, jinxSrc, accent, cta }) {
    const many = Array.isArray(items) && items.length > 1;
    return rewardCardHtml({
        label: many ? `${items.length} ACHIEVEMENTS UNLOCKED` : 'ACHIEVEMENT UNLOCKED',
        title: many ? items.map(i => i.name).join(' \u00b7 ') : name,
        sub: many ? '' : description,
        meta: [xp ? `+${xp} XP` : '', !many && rarity ? String(rarity).charAt(0).toUpperCase() + String(rarity).slice(1) : ''].filter(Boolean).join(' \u00b7 '),
        lead: (!many && hasAchievementIcon(n?.achievementId)) ? `<span class="nv-av" role="img" aria-label="${escapeHtml(name || 'Achievement')}">${achievementBadgeHtml(n.achievementId, rarity, { size: 52 })}</span>` : circleHtml(icon, many ? 'Achievements' : name, 52, { accent }),
        line, jinxSrc, accent, cta, ctaDefault: 'View achievements', small: many
    });
}

// The round number badge for level up / mastery up: the number, with an up arrow built in.
export function levelLeadHtml(level, accent, size = 52) {
    // the level's badge (icon in a tier-coloured ring) with the up arrow; the number is in the card title ("Level 5") and the label here
    return `<span class="nv-av" role="img" aria-label="Level ${escapeHtml(String(level ?? ''))}">${rankBadgeHtml(level, size)}<span class="nv-level-arrow" aria-hidden="true">\u25b2</span></span>`;
}

// Level up: account-wide, so the number is the picture. rank = the rank title, nextText = "N XP to Level 6" (only when it exists).
export function levelUpToastHtml(n, { level, rank, nextText, line, jinxSrc, accent, cta }) {
    return rewardCardHtml({
        label: 'LEVEL UP', title: `Level ${level}`, sub: cleanRankTitle(rank), meta: nextText,
        lead: levelLeadHtml(level, accent), line, jinxSrc, accent, cta, ctaDefault: 'View progress'
    });
}

// Mastery up: per champion, so the champion's face is the picture and the label names them. unlocked = "Unlocked: A, B" when skins came with it.
export function masteryToastHtml(n, { level, champion, unlocked, faceSrc, line, jinxSrc, accent, cta }) {
    return rewardCardHtml({
        label: `MASTERY UP \u00b7 ${String(champion || '').toUpperCase()}`.trim(), title: `Mastery ${level}`, sub: unlocked, meta: '',
        lead: circleHtml(faceSrc, champion || 'Champion', 52, { accent }), line, jinxSrc, accent, cta, ctaDefault: 'View champions'
    });
}

// The companion's face: the tile of the skin it wears (see companion-look.js), otherwise its plain icon.
export function championBadgeUrl(pack, storage = globalThis.localStorage) {
    const skin = lookSkin(pack, storage);
    if (skin && pack?.id) return getChampionTileUrl(pack.id.charAt(0).toUpperCase() + pack.id.slice(1), skin);
    return pack?.icon || null;
}

// Someone with no picture gets a stable Arcane champion (same pick every time for the same name), like new accounts do.
const FALLBACK_CHAMPIONS = ['Vi', 'Caitlyn', 'Jinx'];   // champions that have a pack; more join when they get one
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

// Person alerts (ally / rival / streak / new follower / likes and comments) use the same solid card as the reward alerts:
// the person's face and name lead (their action in small capitals above), the champion's line sits underneath as commentary.
const splitWho = (headline, name) => {
    const text = String(headline || ''), who = String(name || '');
    return { who, action: who && text.startsWith(who) ? text.slice(who.length).trim() : text };
};

export function toastHtml(n, { theirSrc, yourSrc, jinxSrc, accent, headline, quip, cta }) {
    const { who, action } = splitWho(headline, n.triggerUsername || n.username);
    return rewardCardHtml({
        label: action.toUpperCase(), title: who, sub: n.matchTitle || '', subClass: 'nv-one-line',
        lead: circleHtml(theirSrc, who, 52, { accent }), line: quip, jinxSrc, accent, cta, ctaDefault: 'View match'
    });
}

// Ally / rival rows: the same "versus" look as the toast (js/notification-visuals.js), compact.
// The whole row opens the match (a per-person group opens its list instead); the button opens the other voter's profile.
export function socialRowHtml(n, { headline, timeAgo, championPack }) {
    ensureVersusStyles();
    const ally = n.relationship === 'ally';
    const accent = accentFor(n.relationship, championPack);
    const crowd = n.groupKind === 'match' && n.count > 1;
    const idList = safeIds(n.ids ? n.ids.join(',') : n.id);
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
                    data-id="${idList}" data-action="${escapeHtml(n.ctaAction)}"
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
    const idList = safeIds(n.ids ? n.ids.join(',') : n.id);
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
    const { who, action } = splitWho(headline || `${name} followed you`, name);
    return rewardCardHtml({
        label: action.toUpperCase(), title: who, lead: circleHtml(theirSrc, name, 52, { accent }), line: quip, jinxSrc, accent, cta, ctaDefault: 'View profile'
    });
}

// Likes / comments / replies / mentions. One card for all four: face (or stacked faces for a crowd), "who + action", the words
// that were liked or written, and one button that opens the post. Same family as the follow and ally / rival cards.
// parts = { who, action, headline, names } from contentHeadline(); quote = contentQuote() text ('' for none).
export function contentRowHtml(n, { parts, quote, icon, cta, timeAgo, championPack, srcs = [], names = [] }) {
    ensureVersusStyles();
    const accent = championPack?.color || DEFAULT_ACCENT;
    const idList = safeIds(n.ids ? n.ids.join(',') : n.id);
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
// Up to three faces overlapped, then a "+N" chip for the rest, so "4 people" never sits over three faces that look like a miscount.
export function faceStackHtml(srcs, names, size = 40, accent = DEFAULT_ACCENT) {
    const shown = names.slice(0, 3), more = names.length - shown.length;
    return `<div class="nv-stack">${shown.map((nm, i) => circleHtml(srcs[i], nm, size, { accent, cls: 'nv-stacked' })).join('')}${more > 0 ? `<span class="nv-more" style="width:${size}px;height:${size}px">+${more}</span>` : ''}</div>`;
}

export function contentToastHtml(n, { parts, quote, icon, cta, accent, srcs = [], names = [] }) {
    const crowd = names.length > 1;
    const { who, action } = splitWho(parts.headline, parts.who);
    return rewardCardHtml({
        label: action.toUpperCase(), title: who, sub: quote ? `${icon ? icon + ' ' : ''}${quote}` : '', subClass: 'nv-quote',
        lead: crowd ? faceStackHtml(srcs, names, 40, accent) : circleHtml(srcs[0], names[0] || n.triggerUsername, 52, { accent }),
        line: '', jinxSrc: '', accent, cta, ctaDefault: 'View'
    });
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
    if (!edits && glyph === '') return '';   // an alert that wants no symbol (round opening, champion selected) gets no circle
    const g = glyph && glyph !== 'VS' ? glyph : null;
    const inner = edits
        ? editsPairHtml({ edits, relationship: 'event', size, accent, mark: g })
        : `<span class="nv-av"><span class="nv-circle nv-glyph" style="width:${Math.round(size * 1.07)}px;height:${Math.round(size * 1.07)}px;font-size:${Math.round(size * 0.46)}px;--nv-accent:${accent}">${escapeHtml(g || 'VS')}</span></span>`;
    return `<div class="nv-lead nv-follow-face" role="img" aria-label="${escapeHtml(label || '')}" title="${escapeHtml(label || '')}">${inner}</div>`;
}

// Pop-up: [edit A] VS [edit B], the champion's words in a bubble, one button. The whole card opens the match. (No pills: the vote page already
// shows the percentages, so `chips` is accepted for old callers but not drawn.)
export function eventToastHtml(n, { tag, glyph, edits, strip = null, accent, jinxSrc, quip, detail, chips = [], cta, leadHtml = '' }) {
    return `
    <div class="nv-body" ${n.matchTitle ? `title="${escapeHtml(n.matchTitle)}"` : ''} onclick="window.openBulletinMatch()">
        <button class="bulletin-close" onclick="event.stopPropagation(); window.dismissBulletin()">×</button>
        ${n.matchTitle || (!leadHtml && tag) ? `<div class="nv-caption">${escapeHtml(n.matchTitle || tag)}</div>` : ''}
        ${leadHtml || eventLeadHtml({ glyph, label: tag, edits, accent, size: 60 })}
        ${bubbleHtml(withoutLeadingGlyph(quip, glyph), jinxSrc, accent)}
        ${detail && n.type !== 'novotes' && n.type !== 'lowvotes' ? `<div class="nv-event-detail">${escapeHtml(detail)}</div>` : ''}
        ${stripHtml(strip, accent, 34)}
    </div>
    <button class="bulletin-toast-cta nv-cta event" onclick="window.handleBulletinCTA()">${escapeHtml(cta || 'View match')}</button>`;
}

// Bell-list row: the same card, compact. The whole row opens the match; the button does the same.
export function eventRowHtml(n, { tag, glyph, edits, strip = null, accent, jinxSrc, quip, timeAgo, championPack, cta, url }) {
    ensureVersusStyles();
    const idList = safeIds(n.ids ? n.ids.join(',') : n.id);
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

export function ensureVersusStyles() {
    // there is one pop-up style (the old Classic / Full art / Side art styles were removed); the attribute stays so the rules below keep their selector
    if (typeof document !== 'undefined') document.documentElement.dataset.toastStyle = 'minimal';
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
.versus-toast .nv-body{position:relative;cursor:pointer;padding:calc(var(--nv-art,160px) - 46px) 16px 14px;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;gap:10px;background:linear-gradient(90deg,var(--nv-tint),rgba(255,255,255,0) 50%,var(--nv-tint)),#120a18}
/* inner colours follow the toast's own accent (green for allies, amber for tie-breakers...) so the bubble, pills and ring always match the outer border; plain pink where color-mix is unsupported */
.bulletin-banner.versus-toast{--nv-line-auto:rgba(255,105,180,.4);--nv-chip-bg-auto:rgba(255,79,180,.18);--nv-chip-text-auto:#ffd6ee;--nv-readable-auto:#ffd6ee}
@supports (color:color-mix(in srgb,red,blue)){.bulletin-banner.versus-toast{--nv-line-auto:color-mix(in srgb,var(--nv-accent,#ff69b4) 40%,transparent);--nv-chip-bg-auto:color-mix(in srgb,var(--nv-accent,#ff69b4) 18%,transparent);--nv-chip-text-auto:color-mix(in srgb,var(--nv-accent,#ff69b4) 30%,#fff);--nv-readable-auto:color-mix(in srgb,var(--nv-accent,#ff69b4) 42%,#fff)}}
/* the one pop-up style (the champion's portrait and words); the rules above are the shared base */
.versus-toast .nv-head-row{display:contents}
.versus-toast .nv-bubble-x{display:none}
.versus-toast .nv-caption{display:none}
/* minimal: no box at all, just a larger portrait and the champion's bubble (the × sits on the bubble's corner). The whole thing opens the match;
   a small arrow says so and the match name is the hover text. */
html[data-toast-style="minimal"] .bulletin-banner.versus-toast{width:fit-content !important;max-width:min(440px,calc(100vw - 24px)) !important;margin-left:auto !important;background:transparent !important;border:0 !important;box-shadow:none !important;overflow:visible !important;-webkit-backdrop-filter:none !important;backdrop-filter:none !important}
html[data-toast-style="minimal"] .versus-toast .nv-body{padding:10px 10px 10px 0;gap:0;background:transparent;overflow:visible;isolation:auto}
html[data-toast-style="minimal"] .versus-toast .nv-body::before,html[data-toast-style="minimal"] .versus-toast .nv-body::after{display:none}
html[data-toast-style="minimal"] .versus-toast .nv-pair,html[data-toast-style="minimal"] .versus-toast .nv-edits,html[data-toast-style="minimal"] .versus-toast .nv-strip,html[data-toast-style="minimal"] .versus-toast .nv-chips,html[data-toast-style="minimal"] .versus-toast .nv-caption,html[data-toast-style="minimal"] .versus-toast .nv-event-detail,html[data-toast-style="minimal"] .versus-toast .nv-lead:has(.nv-edits),html[data-toast-style="minimal"] .versus-toast .nv-cta{display:none}
html[data-toast-style="minimal"] .versus-toast .nv-jinx{margin-top:0;gap:12px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.55))}
html[data-toast-style="minimal"] .versus-toast .nv-jinx .nv-circle{width:64px !important;height:64px !important;font-size:26px !important}
html[data-toast-style="minimal"] .versus-toast .nv-bubble{padding:12px 30px 12px 16px;background:rgba(14,10,24,.94);overflow-wrap:anywhere}
html[data-toast-style="minimal"] .versus-toast .nv-bubble::after{content:'›';position:absolute;right:10px;bottom:6px;font-size:22px;line-height:1;color:var(--nv-accent,#ff69b4)}
html[data-toast-style="minimal"] .versus-toast .nv-body{padding:10px 10px 10px 0}
html[data-toast-style="minimal"] .versus-toast .nv-follow-face,html[data-toast-style="minimal"] .versus-toast .nv-toast-headline{order:-2}
html[data-toast-style="minimal"] .versus-toast .bulletin-close{display:none}
html[data-toast-style="minimal"] .versus-toast .nv-bubble-x{display:flex;position:absolute;top:-9px;right:-9px;z-index:4;width:22px;height:22px;padding:0;align-items:center;justify-content:center;border-radius:50%;font-size:14px;line-height:1;cursor:pointer;color:rgba(255,255,255,.9);background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.22)}
html[data-toast-style="minimal"] .versus-toast .nv-bubble-x::before{content:'';position:absolute;inset:-12px}   /* 44 x 44 tap area around the small ×; the look stays small */
html[data-toast-style="minimal"] .versus-toast .nv-bubble-x:focus-visible{outline:2px solid #fff;outline-offset:2px}
html[data-toast-style="minimal"] .versus-toast .nv-bubble-x:hover{background:rgba(0,0,0,.85);color:#fff}
/* the "who did what" line (ally / rival / follow / achievement): no box, just their face and the words with a shadow, lined up with the bubble's left edge */
html[data-toast-style="minimal"] .versus-toast .nv-toast-headline{display:flex;width:fit-content;max-width:100%;align-items:center;justify-content:flex-start !important;text-align:left !important;gap:10px;margin:0 0 6px 90px;padding:0;background:none;border:0;text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 12px rgba(0,0,0,.85)}
html[data-toast-style="minimal"] .versus-toast .nv-toast-headline .nv-circle{width:40px !important;height:40px !important;font-size:16px !important}
html[data-toast-style="minimal"] .versus-toast .nv-follow-face{justify-content:flex-start;margin-left:90px;padding-bottom:6px}
/* achievement / follow: their icon or face small beside the words, like the social alerts; event alerts lose their emoji circle */
html[data-toast-style="minimal"] .versus-toast .nv-head-row{display:flex;align-items:center;gap:10px;margin:0 0 6px 90px;order:-2}
html[data-toast-style="minimal"] .versus-toast .nv-head-row .nv-follow-face{margin:0;padding:0}
html[data-toast-style="minimal"] .versus-toast .nv-head-row .nv-toast-headline{margin:0}
html[data-toast-style="minimal"] .versus-toast .nv-head-row .nv-circle{width:40px !important;height:40px !important;font-size:16px !important}
html[data-toast-style="minimal"] .versus-toast .nv-lead:has(.nv-glyph){display:none}
/* the bubble hugs its words (the toast shrinks to fit, staying on the right edge) */
html[data-toast-style="minimal"] .versus-toast .nv-bubble{flex:0 1 auto;text-wrap:balance}
/* on the match's own page the pill goes nowhere: no arrow, no pointer */
html[data-toast-style="minimal"] .versus-toast.nv-here .nv-body{cursor:default}
html[data-toast-style="minimal"] .versus-toast.nv-here .nv-bubble::after{display:none}
/* achievement card: a solid backing so it reads on any page; name biggest, champion line secondary, one left edge */
html[data-toast-style="minimal"] .bulletin-banner.versus-toast.reward-card{width:fit-content !important;min-width:min(320px,calc(100vw - 24px)) !important;max-width:min(420px,calc(100vw - 24px)) !important;background:#1a1226 !important;border:1px solid var(--nv-accent,#ff69b4) !important;border-radius:14px !important;box-shadow:0 8px 32px rgba(0,0,0,.6),0 0 24px var(--nv-glow,rgba(255,105,180,.35)) !important}
html[data-toast-style="minimal"] .versus-toast.reward-card .nv-body.nv-ach-body{display:flex;flex-direction:column;gap:10px;padding:14px 14px 12px;cursor:pointer}
.nv-ach-head{display:flex;align-items:center;gap:12px;min-width:0}
.nv-ach-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.nv-ach-label{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--nv-readable-auto,#ffd6ee)}
.nv-ach-name{font-size:22px;font-weight:800;line-height:1.15;color:#fff;overflow-wrap:anywhere}
.nv-ach-name-many{font-size:17px}
.nv-ach-desc{font-size:13px;color:rgba(255,255,255,.8);line-height:1.3}
.nv-ach-desc.nv-quote{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-style:italic;overflow-wrap:anywhere}
.nv-ach-desc.nv-one-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.nv-more{display:inline-flex;align-items:center;justify-content:center;margin-left:-10px;border-radius:50%;background:#2a2140;border:2px solid var(--nv-accent,#ff69b4);color:#fff;font-size:13px;font-weight:700;box-sizing:border-box}
.nv-ach-meta{font-size:12px;font-weight:700;color:var(--nv-chip-text-auto,#ffd6ee)}
/* the card's own × sits on its top-right corner (the bubble's × is hidden here); 44 x 44 tap area around a small round button */
.nv-card-x{position:absolute;top:8px;right:8px;z-index:4;width:24px;height:24px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:15px;line-height:1;cursor:pointer;color:rgba(255,255,255,.9);background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.22)}
.nv-card-x::before{content:'';position:absolute;inset:-10px}
.nv-card-x:hover{background:rgba(0,0,0,.85);color:#fff}
.nv-card-x:focus-visible{outline:2px solid #fff;outline-offset:2px}
html[data-toast-style="minimal"] .versus-toast.reward-card .nv-bubble-x{display:none}
html[data-toast-style="minimal"] .versus-toast.reward-card .nv-bubble::after{display:none}   /* the whole card is the target: no arrow inside the bubble */
html[data-toast-style="minimal"] .versus-toast.reward-card .nv-ach-text{padding-right:26px}
.nv-level-num{font-weight:800;color:#fff}
${RANK_BADGE_CSS}
${ACHIEVEMENT_BADGE_CSS}
.nv-level-arrow{position:absolute;right:-4px;bottom:-4px;z-index:3;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;color:#0f0b18;background:var(--nv-accent,#ff69b4);border:2px solid #1a1226}
html[data-toast-style="minimal"] .versus-toast.reward-card .nv-jinx{margin:0;gap:10px;filter:none}
html[data-toast-style="minimal"] .versus-toast.reward-card .nv-jinx .nv-circle{width:40px !important;height:40px !important;font-size:16px !important}
html[data-toast-style="minimal"] .versus-toast.reward-card .nv-bubble{padding:10px 30px 10px 12px;font-size:14px}
html[data-toast-style="minimal"] .versus-toast.reward-card.nv-here .nv-body{cursor:default}
@media (prefers-reduced-motion:reduce){html .bulletin-banner.versus-toast{transition:opacity .15s linear !important;transform:none !important}}
html[data-toast-style="minimal"] .versus-toast .nv-jinx{width:fit-content;max-width:100%}
.versus-toast .bulletin-close{position:absolute;top:8px;right:10px;z-index:3;width:24px;height:24px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:15px;line-height:1;color:rgba(255,255,255,.9);background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.22);box-shadow:none}
.versus-toast .bulletin-close:hover{background:rgba(0,0,0,.7);color:#fff}
.versus-toast .nv-headline{font-size:19px}
.versus-toast .nv-toast-headline{justify-content:flex-start;gap:10px;text-align:left}
.versus-toast .nv-toast-headline .nv-headline-text{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.versus-toast .nv-toast-name{font-size:18px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.versus-toast .nv-toast-action{font-size:13px;font-weight:600;color:var(--nv-readable-auto);letter-spacing:.03em}
.versus-toast .nv-jinx{display:flex;align-items:flex-end;gap:12px;margin-top:4px}
.versus-toast .nv-jinx-face{box-shadow:0 0 18px var(--nv-glow)}
.versus-toast .nv-bubble{position:relative;flex:1;min-width:0;background:rgba(11,13,24,.88);color:#f6f3f7;border:1px solid var(--nv-line,var(--nv-line-auto));border-radius:16px;padding:10px 14px;font-size:14px;font-weight:700;line-height:1.4;margin-bottom:0;align-self:center;backdrop-filter:blur(6px)}
.versus-toast .nv-bubble::before{content:'';position:absolute;left:-7px;top:50%;width:12px;height:12px;margin-top:-6px;background:rgba(11,13,24,.88);border-left:1px solid var(--nv-line,var(--nv-line-auto));border-bottom:1px solid var(--nv-line,var(--nv-line-auto));transform:rotate(45deg)}
.versus-toast .nv-jinx{align-items:center;gap:14px}
.versus-toast .nv-chips{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
.versus-toast .nv-chip{padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;color:var(--nv-chip-text-auto);background:var(--nv-chip-bg-auto);border:1px solid var(--nv-line-auto);text-transform:capitalize}
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
