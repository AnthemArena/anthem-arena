// Pure helpers for notifications (no Firebase), so they can be tested.

// Notifications that should still pop up as a toast: not shown yet, newer than cutoff, not expired. Newest first.
export function pickUnshown(list, cutoffTime, now) {
    return (list || [])
        .filter(n => n && n.shownAsToast === false && n.timestamp > cutoffTime && (!n.expiresAt || n.expiresAt > now))
        .sort((a, b) => b.timestamp - a.timestamp);
}

// Ally / rival notifications get the champion look (portrait badge, pack colours) like their toast does.
export const isSocialNotification = n => n?.relationship === 'ally' || n?.relationship === 'opponent';

// Group the bell list. Ally/rival rows from people you FOLLOW stay one row per person ("Kai voted against you in 2 matches").
// From strangers they group per match ("3 people voted against you in <match>"), so the row always says what it is about.
// Everything else keeps the old per-person grouping.
export function groupNotifications(list, followingIds = new Set()) {
    const groups = new Map();
    for (const n of list || []) {
        const content = isContentNotification(n);
        const stranger = isSocialNotification(n) && !followingIds.has(n.triggerUserId);
        // Likes / comments / replies / mentions group per POST and kind, whoever did them ("3 people liked your post").
        const key = content ? `c|${n.type}|${n.eventType || ''}|${n.targetUrl || n.matchId || ''}`
            : stranger ? `m|${n.matchId}|${n.relationship}` : `u|${n.triggerUserId || 'system'}|${n.relationship || n.type}`;
        const entry = { matchId: n.matchId, matchTitle: n.matchTitle, detail: n.detail };
        const g = groups.get(key);
        if (!g) groups.set(key, { ...n, groupKind: content ? 'content' : stranger ? 'match' : 'user', count: 1, matches: [entry], ids: [n.id], users: [n.triggerUsername].filter(Boolean), avatars: n.triggerUsername ? [n.thumbnailUrl || null] : [], userIds: n.triggerUsername ? [n.triggerUserId || null] : [] });
        else {
            g.count++; g.matches.push(entry); g.ids.push(n.id);
            if (n.triggerUsername && !g.users.includes(n.triggerUsername)) { g.users.push(n.triggerUsername); g.avatars.push(n.thumbnailUrl || null); g.userIds.push(n.triggerUserId || null); }
            if (n.timestamp > g.timestamp) {
                g.timestamp = n.timestamp;
                if (content) { if (n.detail) g.detail = n.detail; g.triggerUsername = n.triggerUsername; g.triggerUserId = n.triggerUserId; }   // the row quotes the newest one
            }
        }
    }
    return [...groups.values()].sort((a, b) => b.timestamp - a.timestamp);
}

// The headline of a grouped social row. null = not a social group (caller keeps its own wording).
export function socialHeadline(n) {
    const name = n.triggerUsername || 'Someone';
    return `${name} voted ${n.relationship === 'ally' ? 'with' : 'against'} you`;
}

export function groupHeadline(g) {
    if (!isSocialNotification(g) || g.count < 2) return null;
    const what = g.relationship === 'ally' ? 'picked the same as you' : 'voted against you';
    if (g.groupKind === 'match') return { message: `${g.count} people ${what}`, detail: g.users.slice(0, 3).join(', ') + (g.users.length > 3 ? ` +${g.users.length - 3} more` : '') };
    return { message: `${g.triggerUsername || 'Someone'} ${what} in ${g.count} matches`, detail: null };
}

// ---- Social tab and follow notifications ----
// Types shown under the bell's Social tab. Follows are saved as 'new-follower' (older code looked for 'follow', so they never matched).
export const SOCIAL_TAB_TYPES = ['like', 'comment', 'new-follower', 'follow', 'mention', 'reply', 'emote-received'];
export const isFollowNotification = n => n?.type === 'new-follower' || n?.type === 'follow';
export const isSocialTabItem = n => !!n && (SOCIAL_TAB_TYPES.includes(n.type) || isSocialNotification(n));

export const FOLLOW_QUIPS = [
    'New fan detected. Try to keep up!',
    'Someone is watching. Good. Make it a show!',
    'Another one joins the chaos!',
    'Looks like you made an impression.'
];
// Stable per notification (same row always shows the same line), spread by a simple hash of the id/username.
export function followQuip(n, quips = isFollowBack(n) ? FOLLOW_BACK_QUIPS : FOLLOW_QUIPS) {
    const key = String(n?.id || n?.triggerUserId || n?.triggerUsername || '');
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return quips[h % quips.length];
}
// A follow that reciprocates one of yours is saved with the message "<name> followed you back" (see follow-system.js).
export const isFollowBack = n => /followed you back/i.test(n?.message || '');
export const FOLLOW_BACK_QUIPS = [
    "It's mutual. Now we're talking!",
    'Two of you now. Double the chaos!',
    'They followed you back. Go cause some trouble together!'
];
export const followHeadline = n => `${n?.triggerUsername || 'Someone'} followed you${isFollowBack(n) ? ' back' : ''}`;


// ---- Likes, comments, replies and mentions (the "content" notifications) ----
export const CONTENT_TYPES = ['like', 'comment', 'reply', 'mention', 'emote-received'];     // emote-received: a reaction someone sent you (eventType = thanks / props / rivalry / hype)
export const isContentNotification = n => CONTENT_TYPES.includes(n?.type);
const CONTENT_ICONS = { like: '❤️', comment: '💬', reply: '↩️', mention: '📢' };
const EMOTE_ICONS = { thanks: '🤝', props: '👊', rivalry: '⚔️', hype: '🔥' };
export const contentIcon = n => (n?.type === 'emote-received' ? (EMOTE_ICONS[n.eventType] || '✨') : CONTENT_ICONS[n?.type]) || '🔔';
const EMOTE_ACTIONS = { thanks: 'sent you thanks', props: 'gave you props', rivalry: 'challenged you', hype: 'sent you hype' };
// Most direct first: a reply to you beats a comment or mention, which beat a like. Used to pick the one toast to show.
export const CONTENT_PRIORITY = { 'emote-received': 8, reply: 8, comment: 7, mention: 7, like: 6 };

// Where a mention happened ("in a post / comment / reply"), read from the saved wording.
export function mentionWhere(n) {
    const m = /\bin an? (post|comment|reply)\b/i.exec(n?.message || '') || /View (Post|Comment|Reply)/i.exec(n?.ctaText || '');
    return m ? m[1].toLowerCase() : 'post';
}

// "Kai liked your post" / "Kai and Rex liked your post" / "3 people liked your post". who + action are split so the toast
// can put the name on its own line.
export function contentHeadline(g) {
    const users = g?.users?.length ? g.users : [g?.triggerUsername].filter(Boolean);
    const people = users.length || 1;
    const count = g?.count || 1;
    const who = people === 1 ? (users[0] || 'Someone') : people === 2 ? `${users[0]} and ${users[1]}` : `${people} people`;
    let action;
    if (g?.type === 'like') action = 'liked your post';
    else if (g?.type === 'comment') action = people === 1 && count > 1 ? `commented ${count} times on your post` : 'commented on your post';
    else if (g?.type === 'reply') action = people === 1 && count > 1 ? `replied ${count} times to your comment` : 'replied to your comment';
    else if (g?.type === 'emote-received') action = EMOTE_ACTIONS[g.eventType] || 'sent you a reaction';
    else if (g?.type === 'mention') action = people >= 3 ? 'mentioned you' : `mentioned you in a ${mentionWhere(g)}`;
    else action = 'sent you something';
    const names = people >= 3 ? users.slice(0, 3).join(', ') + (people > 3 ? ` +${people - 3} more` : '') : '';
    return { who, action, headline: `${who} ${action}`, names };
}

// The words to show under the headline: the post that was liked, or what they wrote. Empty when there is nothing real to quote.
export function contentQuote(g, max = 110) {
    let t = String(g?.detail || '').trim();
    if (!t || t === 'your post') return '';
    t = t.replace(/^["“](.*)["”]$/s, '$1').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
// One consistent wording whatever older notifications saved ("View Comment" vs "View comment").
export const contentCta = g => g?.type === 'emote-received' ? 'View match' : g?.type === 'mention' ? `View ${mentionWhere(g)}` : ({ like: 'View post', comment: 'View comment', reply: 'View reply' }[g?.type] || 'View');
