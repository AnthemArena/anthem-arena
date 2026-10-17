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
        const stranger = isSocialNotification(n) && !followingIds.has(n.triggerUserId);
        const key = stranger ? `m|${n.matchId}|${n.relationship}` : `u|${n.triggerUserId || 'system'}|${n.relationship || n.type}`;
        const entry = { matchId: n.matchId, matchTitle: n.matchTitle, detail: n.detail };
        const g = groups.get(key);
        if (!g) groups.set(key, { ...n, groupKind: stranger ? 'match' : 'user', count: 1, matches: [entry], ids: [n.id], users: [n.triggerUsername].filter(Boolean), avatars: n.triggerUsername ? [n.thumbnailUrl || null] : [], userIds: n.triggerUsername ? [n.triggerUserId || null] : [] });
        else {
            g.count++; g.matches.push(entry); g.ids.push(n.id);
            if (n.triggerUsername && !g.users.includes(n.triggerUsername)) { g.users.push(n.triggerUsername); g.avatars.push(n.thumbnailUrl || null); g.userIds.push(n.triggerUserId || null); }
            if (n.timestamp > g.timestamp) g.timestamp = n.timestamp;
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
export const SOCIAL_TAB_TYPES = ['like', 'comment', 'new-follower', 'follow', 'mention', 'reply'];
export const isFollowNotification = n => n?.type === 'new-follower' || n?.type === 'follow';
export const isSocialTabItem = n => !!n && (SOCIAL_TAB_TYPES.includes(n.type) || isSocialNotification(n));

export const FOLLOW_QUIPS = [
    'New fan detected. Try to keep up!',
    'Someone is watching. Good. Make it a show!',
    'Another one joins the chaos!',
    'Looks like you made an impression.'
];
// Stable per notification (same row always shows the same line), spread by a simple hash of the id/username.
export function followQuip(n, quips = FOLLOW_QUIPS) {
    const key = String(n?.id || n?.triggerUserId || n?.triggerUsername || '');
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return quips[h % quips.length];
}
export const followHeadline = n => `${n?.triggerUsername || 'Someone'} followed you`;
