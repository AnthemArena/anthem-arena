// One rule for "how long ago" on the feed: relative for the first week, then a date (with the year once it is not this year).
// Pure, so it is tested in Node (tools/test-feed-time-model.mjs).
export function timeAgo(timestamp, now = Date.now()) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return '';
    const seconds = Math.floor((now - ts) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const d = new Date(ts);
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    return d.toLocaleDateString('en-US', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

// The full date and time for a hover title.
export function fullTime(timestamp) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return '';
    return new Date(ts).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
