// Pure model for the two strips at the top of the feed: the pinned announcement and the "closing soon" reminder.
const endMs = m => { const t = Date.parse(m.endDate || m.endTime || ''); return Number.isFinite(t) ? t : null; };

export function formatLeft(ms) {
    if (ms <= 0) return 'closing now';
    const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
    if (d >= 1) return `${d}d ${h % 24}h`;
    if (h >= 1) return `${h}h ${min % 60}m`;
    return `${Math.max(min, 1)}m`;
}

// Live matches the user has not voted on, soonest deadline first. `votes` may be null (logged out): then every open match counts.
export function closingSoon({ matches = [], votes = null, now = Date.now(), cupId = null } = {}) {
    const voted = votes ? new Set(votes.map(v => v.matchId)) : new Set();
    const open = matches
        .filter(m => m.status === 'live')
        .filter(m => !cupId || String(m.matchId || m.id || '').startsWith(cupId + '-'))
        .filter(m => { const e = endMs(m); return e === null || e > now; })
        .filter(m => !voted.has(m.matchId || m.id));
    open.sort((a, b) => (endMs(a) ?? Infinity) - (endMs(b) ?? Infinity));
    const next = open.find(m => endMs(m) !== null) || null;
    return { count: open.length, next, msLeft: next ? endMs(next) - now : null, nextId: next ? (next.matchId || next.id) : (open[0] ? (open[0].matchId || open[0].id) : null) };
}

// cfg is data/announcement.json: { enabled, id, text, linkText, linkUrl, expires }. Returns what to show or null.
export function announcementToShow(cfg, now = Date.now(), dismissedId = null) {
    if (!cfg || cfg.enabled !== true || !cfg.id || !cfg.text) return null;
    if (cfg.expires) { const e = Date.parse(cfg.expires); if (Number.isFinite(e) && e <= now) return null; }
    if (dismissedId && dismissedId === cfg.id) return null;
    const safeLink = typeof cfg.linkUrl === 'string' && /^(\/(?!\/)|https:\/\/)/.test(cfg.linkUrl) ? cfg.linkUrl : null;
    return { id: cfg.id, text: String(cfg.text), linkText: safeLink ? String(cfg.linkText || 'Learn more') : null, linkUrl: safeLink };
}
