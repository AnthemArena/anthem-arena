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
        if (!g) groups.set(key, { ...n, groupKind: stranger ? 'match' : 'user', count: 1, matches: [entry], ids: [n.id], users: [n.triggerUsername].filter(Boolean) });
        else {
            g.count++; g.matches.push(entry); g.ids.push(n.id);
            if (n.triggerUsername && !g.users.includes(n.triggerUsername)) g.users.push(n.triggerUsername);
            if (n.timestamp > g.timestamp) g.timestamp = n.timestamp;
        }
    }
    return [...groups.values()].sort((a, b) => b.timestamp - a.timestamp);
}

// The headline of a grouped social row. null = not a social group (caller keeps its own wording).
export function groupHeadline(g) {
    if (!isSocialNotification(g) || g.count < 2) return null;
    const what = g.relationship === 'ally' ? 'picked the same as you' : 'voted against you';
    if (g.groupKind === 'match') return { message: `${g.count} people ${what} in ${g.matchTitle || 'a match'}`, detail: g.users.slice(0, 3).join(', ') + (g.users.length > 3 ? ` +${g.users.length - 3} more` : '') };
    return { message: `${g.triggerUsername || 'Someone'} ${what} in ${g.count} matches`, detail: null };
}
