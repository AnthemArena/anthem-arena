// Where a champion pack keeps its welcome / encouragement lines. Older packs used a top-level `welcomeDialogs` section; the current
// Jinx, Vi and Caitlyn packs keep them under `alerts.welcome` (keys welcome-first-time, welcome-streak, welcome-comeback, welcome-back),
// and "still deciding?" under `alerts.encouragement`. Pure, so it is tested in node (tools/test-champion-lines.mjs).
const find = (pack, type) => pack.welcomeDialogs?.[type]
    || pack.alerts?.welcome?.[type]
    || (type === 'encouragement' ? pack.alerts?.encouragement : null);
const usable = d => (d && Array.isArray(d.messages) && d.messages.length ? d : null);

// A pack without its own streak or comeback welcome (the default pack) uses its plain "welcome back" lines.
export function dialogFor(pack, type) {
    if (!pack || !type) return null;
    return usable(find(pack, type)) || (/^welcome-/.test(type) ? usable(find(pack, 'welcome-back')) : null);
}

// The welcome lines can carry {days} (comeback) and {liveCount} (first visit). Every pack uses only these two, and the toast code must fill both:
// a line that shows its placeholder on screen ("{liveCount} matches. Have fun.") looks broken. tools/test-champion-lines.mjs checks every pack.
export const WELCOME_PLACEHOLDERS = ['days', 'liveCount'];
export function fillWelcomeText(text, { days, liveCount } = {}) {
    let out = String(text ?? '');
    if (days !== undefined && days !== null) out = out.replace(/\{days\}/g, String(days));
    if (liveCount !== undefined && liveCount !== null) out = out.replace(/\{liveCount\}/g, String(liveCount));
    return out;
}
