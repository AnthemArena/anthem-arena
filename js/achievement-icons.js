// ========================================
// ACHIEVEMENT ICONS: a line icon in a ring coloured by rarity, in the same style as the level badges (js/rank-badges.js).
// Covers the general achievements (js/achievements.js). Champion achievements keep their own picture (a League spell icon), so
// hasAchievementIcon() is false for them and callers fall back to the achievement's own icon. The emoji stay in the data as that fallback.
// ========================================

// rarity ring colours (a little softer than the text colours in RARITY_INFO so they sit well beside the pink icons)
export const ACHIEVEMENT_RING = { common: '#9ca0aa', uncommon: '#5ec26a', rare: '#3b82d6', epic: '#a355e8', legendary: '#f59a2a', mythic: '#e0524a' };

// 24x24 icons, drawn for stroke="currentColor", no fill
export const ACHIEVEMENT_ICONS = {
    'first-choice': '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.7 2.7L16 9.5"/>',
    'getting-started': '<circle cx="12" cy="12" r="8.500"/><path d="M10.200 8.500l5 3.500-5 3.500z"/>',
    'arcane-regular': '<path d="M3 8h18v3a2 2 0 000 4v3H3v-3a2 2 0 000-4z"/><path d="M12 9.500l1 2 2.200.3-1.600 1.500.4 2.200L12 14.500l-2 1 .4-2.200-1.600-1.500 2.200-.3z" transform="translate(0 -.5)"/>',
    'crowd-voice': '<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.500 9.500a4 4 0 010 5M19.500 7a7.500 7.500 0 010 10"/>',
    'deep-in-the-story': '<path d="M12 6c-2-1.500-5-2-8-1.500v13c3-.5 6 0 8 1.500 2-1.500 5-2 8-1.500v-13C17 4 14 4.500 12 6z"/><path d="M12 6v13"/>',
    'arcane-legend': '<path d="M6.500 4h11l3.500 5-9 11L3 9z"/><path d="M3 9h18M9.500 4L8 9l4 11 4-11-1.500-5"/>',
    'spark': '<path d="M12 3l2.200 6.800L21 12l-6.800 2.200L12 21l-2.200-6.800L3 12l6.800-2.200z"/>',
    'on-a-roll': '<path d="M13 2.500L5 13.500h6l-1 8 8-11h-6z"/>',
    'unstoppable': '<path d="M6 15l6-6 6 6M6 9l6-6 6 6M6 21l6-6 6 6"/>',
    'arcane-dedication': '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M9 15l2 2 4-4"/>',
    'against-the-grain': '<path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3"/>',
    'rebel-heart': '<path d="M12 20s-7.500-4.600-7.500-10A4.200 4.200 0 0112 7.500 4.200 4.200 0 0119.500 10c0 5.400-7.500 10-7.500 10z"/><path d="M19 2.500v3.500M17.200 4.200h3.600"/>',
    'dark-horse': '<path d="M7 21c-.5-4 .5-7 3-9.500L8 8.500 11 7l1.500-3.500 2.500 2 3.500 4c1 2 .5 4-1.500 5l-2 1.500.7 5z"/><circle cx="14.200" cy="8.200" r=".6"/>',
    'first-on-the-scene': '<path d="M6 21V4"/><path d="M6 5h11l-2.500 3.500L17 12H6"/>',
    'ahead-of-the-curve': '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    'nail-biter': '<path d="M12 4v16M7 20h10"/><path d="M5 8h14"/><path d="M5 8l-2.500 6a3 3 0 005 0zM19 8l-2.500 6a3 3 0 005 0z"/>',
    'deciding-voice': '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="4.500"/><circle cx="12" cy="12" r=".8"/>',
    'comeback-believer': '<path d="M20 12a8 8 0 01-14 5.300M4 12a8 8 0 0114-5.300"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    'repeat-favourite': '<path d="M7 3h10v18l-5-4-5 4z"/><path d="M12 8l1 2 2 .3-1.500 1.400.4 2L12 12.700 10.100 13.700l.4-2L9 10.300l2-.3z"/>',
    'die-hard': '<path d="M12 3l7 2.800v5.400c0 4.400-3 7.700-7 9.800-4-2.100-7-5.400-7-9.800V5.800z"/><path d="M12 15s-3-1.900-3-4a1.700 1.700 0 013-1 1.700 1.700 0 013 1c0 2.100-3 4-3 4z"/>',
    'obsession': '<path d="M12 12c-2-3-3.500-4-5.500-4a4 4 0 000 8c2 0 3.500-1 5.500-4 2 3 3.500 4 5.500 4a4 4 0 000-8c-2 0-3.500 1-5.500 4z"/>',
    'two-round-journey': '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><path d="M10.500 9.800l4 2.200-4 2.200z"/>',
    'deep-into-the-bracket': '<path d="M3 20h5v-5h5v-5h5V5h3"/><path d="M3 20v1.500M21 5v-1"/>',
    'all-the-way': '<path d="M8 4h8v6a4 4 0 01-8 0z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4"/><path d="M12 14v4M8.500 20h7"/>',
    'founding-member': '<circle cx="12" cy="9" r="5.500"/><path d="M9.500 9l1.800 1.800L15 7.200"/><path d="M8.500 14l-1.500 7 5-2.500 5 2.500-1.500-7"/>',
    'long-session': '<path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 3 6 5 9-2 3-5 4-5 9M17 3c0 5-3 6-5 9 2 3 5 4 5 9"/>',
    'deep-dive': '<path d="M3 9c2.500-2 4.500-2 7 0s4.500 2 7 0 2.500-1 4-.500M3 14c2.500-2 4.500-2 7 0s4.500 2 7 0 2.500-1 4-.500M3 19c2.500-2 4.500-2 7 0s4.500 2 7 0 2.500-1 4-.500"/>',
    'night-owl': '<path d="M20 14.500A8.500 8.500 0 119.500 4a7 7 0 0010.500 10.500z"/>',
    'signal-boost': '<circle cx="12" cy="12" r="1.800"/><path d="M8.500 8.500a5 5 0 000 7M15.500 8.500a5 5 0 010 7M5.500 5.500a9.500 9.500 0 000 13M18.500 5.500a9.500 9.500 0 010 13"/>',
    'spreading-the-word': '<circle cx="6" cy="12" r="2.500"/><circle cx="18" cy="6" r="2.500"/><circle cx="18" cy="18" r="2.500"/><path d="M8.200 10.800l7.600-3.600M8.200 13.200l7.600 3.600"/>'
};

export const hasAchievementIcon = id => Object.prototype.hasOwnProperty.call(ACHIEVEMENT_ICONS, String(id ?? ''));

// the badge as html, or '' when this achievement has no drawn icon (use its own icon then). locked greys it and adds a small lock.
export function achievementBadgeHtml(id, rarity = 'common', { size = 56, locked = false } = {}) {
    if (!hasAchievementIcon(id)) return '';
    const ring = ACHIEVEMENT_RING[rarity] || ACHIEVEMENT_RING.common;
    const icon = Math.round(size * 0.54);
    const lock = locked
        ? `<span class="ach-badge-lock" aria-hidden="true"><svg viewBox="0 0 24 24" width="${Math.max(10, Math.round(size * 0.26))}" height="${Math.max(10, Math.round(size * 0.26))}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg></span>`
        : '';
    return `<span class="ach-badge ach-badge--${rarity}${locked ? ' ach-badge--locked' : ''}" style="--rb:${ring};width:${size}px;height:${size}px" aria-hidden="true">` +
        `<svg viewBox="0 0 24 24" width="${icon}" height="${icon}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ACHIEVEMENT_ICONS[id]}</svg>${lock}</span>`;
}

export const ACHIEVEMENT_BADGE_CSS = '.ach-badge{position:relative;display:inline-grid;place-items:center;flex:none;border-radius:50%;border:2px solid var(--rb,#9ca0aa);color:#ff9bd9;box-sizing:border-box;' +
    'background:radial-gradient(circle at 50% 35%,#2a1740,#120b1e);box-shadow:0 0 14px color-mix(in srgb,var(--rb,#9ca0aa) 45%,transparent)}' +
    '.ach-badge--locked{color:#8b8798;box-shadow:none;border-color:#4a4658;filter:grayscale(1)}' +
    '.ach-badge-lock{position:absolute;right:-3px;bottom:-3px;display:grid;place-items:center;width:42%;height:42%;border-radius:50%;background:#1b1626;border:1.5px solid #4a4658;color:#cfcad9}';
