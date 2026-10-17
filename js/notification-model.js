// Pure helpers for notifications (no Firebase), so they can be tested.

// Notifications that should still pop up as a toast: not shown yet, newer than cutoff, not expired. Newest first.
export function pickUnshown(list, cutoffTime, now) {
    return (list || [])
        .filter(n => n && n.shownAsToast === false && n.timestamp > cutoffTime && (!n.expiresAt || n.expiresAt > now))
        .sort((a, b) => b.timestamp - a.timestamp);
}

// Ally / rival notifications get the champion look (portrait badge, pack colours) like their toast does.
export const isSocialNotification = n => n?.relationship === 'ally' || n?.relationship === 'opponent';
