// moderation-model.js: the rules behind reporting, blocking and posting limits. Pure functions, no Firebase and no DOM,
// so tools/test-moderation.mjs can test them. js/moderation.js does the saving and the dialogs.

export const REPORT_REASONS = [
    ['spam', 'Spam or advertising'],
    ['abuse', 'Abuse or harassment'],
    ['inappropriate', 'Not appropriate for this site'],
    ['other', 'Something else']
];
export const REASON_KEYS = REPORT_REASONS.map(r => r[0]);

// A post or comment with this many reports (each from a different person) is hidden from everyone but its author until the admin has looked.
export const HIDE_AT_REPORTS = 3;

// One report per person per post/comment: the document id carries all three, so a second report simply overwrites nothing and cannot be created twice.
export function reportId(targetType, targetId, reporterId) {
    return `${targetType}_${targetId}_${reporterId}`;
}

// ids go into document paths: no slashes, not empty, sane length
export const validTargetId = id => typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes('/');

export function hiddenByReports(item, viewerId, adminView = false) {
    if (!item || adminView) return false;
    if (viewerId && item.userId === viewerId) return false;       // authors still see their own post (and can delete it)
    if (item.moderationCleared) return false;                     // the admin looked and left it up
    return (Number(item.reportCount) || 0) >= HIDE_AT_REPORTS;
}

// ---------- block list ({ userId: { name, at } }) ----------
export function addBlock(list, userId, name, now = Date.now()) {
    if (!userId) return { ...list };
    return { ...list, [userId]: { name: String(name || '').slice(0, 40), at: now } };
}
export function removeBlock(list, userId) {
    const next = { ...list }; delete next[userId]; return next;
}
export const isBlockedIn = (list, userId) => !!(list && userId && Object.prototype.hasOwnProperty.call(list, userId));
export function blockedEntries(list) {
    return Object.entries(list || {}).map(([id, v]) => ({ id, name: v?.name || 'Someone', at: v?.at || 0 })).sort((a, b) => b.at - a.at);
}

// ---------- will this item be shown to this viewer ----------
export function isHiddenFor(item, { blocked, viewerId, adminView = false } = {}) {
    if (!item) return false;
    if (viewerId && item.userId === viewerId) return false;
    if (isBlockedIn(blocked, item.userId)) return true;
    return hiddenByReports(item, viewerId, adminView);
}

// ---------- posting limits ----------
// Kept on the visitor's own device, so it slows down a flood from one browser but is not a security barrier
// (someone who clears their storage can start again). Real enforcement would need a server.
export const LIMITS = {
    post: { max: 3, windowMs: 60 * 1000, label: 'posts' },
    comment: { max: 6, windowMs: 60 * 1000, label: 'comments' }
};

// log = { post: [timestamps], comment: [timestamps] }.  Returns { ok, waitSeconds, log } (log is pruned, and includes `now` only when allowed and record is true)
export function checkRate(log, kind, now = Date.now(), record = false) {
    const rule = LIMITS[kind];
    const recent = ((log && log[kind]) || []).filter(t => now - t < rule.windowMs);
    if (recent.length >= rule.max) {
        const wait = Math.ceil((recent[0] + rule.windowMs - now) / 1000);
        return { ok: false, waitSeconds: Math.max(1, wait), log: { ...log, [kind]: recent } };
    }
    return { ok: true, waitSeconds: 0, log: { ...log, [kind]: record ? [...recent, now] : recent } };
}

export function rateMessage(kind, waitSeconds) {
    return `You are ${LIMITS[kind].label === 'posts' ? 'posting' : 'commenting'} very quickly. Please wait ${waitSeconds} second${waitSeconds === 1 ? '' : 's'}.`;
}

// ---------- admin queue ----------
// reports: [{ id, targetType, targetId, authorId, authorName, reason, timestamp(ms), handled }] -> one row per reported post/comment,
// open ones only, the most reported first (then the latest report).
export function groupReports(reports) {
    const by = new Map();
    for (const r of reports || []) {
        if (r.handled) continue;
        const key = `${r.targetType}_${r.targetId}`;
        const g = by.get(key) || { key, targetType: r.targetType, targetId: r.targetId, authorId: r.authorId, authorName: r.authorName || '', postId: r.postId || '', reasons: {}, count: 0, last: 0, reportIds: [] };
        g.count++; g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
        g.last = Math.max(g.last, Number(r.timestamp) || 0); g.reportIds.push(r.id);
        by.set(key, g);
    }
    return [...by.values()].sort((a, b) => b.count - a.count || b.last - a.last);
}
export const reasonSummary = reasons => Object.entries(reasons || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${(REPORT_REASONS.find(r => r[0] === k) || [k, k])[1]} (${n})`).join(', ');
