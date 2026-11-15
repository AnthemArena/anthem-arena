// ========================================
// LEVEL BADGES: one line icon per account level, inside a ring coloured by tier.
// They replace the emoji that used to sit in front of the rank titles ("🛤️ Undercity Regular").
// The titles in rank-system.js keep their emoji as a fallback; use cleanRankTitle() wherever a title is shown next to a badge.
// ========================================

// tiers match RANK_SYSTEM.tiers in rank-system.js (bronze 1-3, silver 4-6, gold 7-8, legendary 9-10)
export const RANK_TIER_COLORS = { bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', legend: '#C8AA6E' };

export function rankTier(level) {
    const n = Number(level);
    if (n >= 9) return 'legend';
    if (n >= 7) return 'gold';
    if (n >= 4) return 'silver';
    return 'bronze';
}

// 24x24 line icons, drawn for stroke="currentColor" (no fill)
const ICONS = {
    1: '<path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M18.5 15v4M16.5 17h4"/>',                                   // New Arrival: sparkle
    2: '<path d="M4 8h16l-2 8H6z"/><circle cx="8.5" cy="19" r="1.6"/><circle cx="15.5" cy="19" r="1.6"/><path d="M8 8l1-3h6l1 3"/>',                    // Undercity Regular: minecart
    3: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"/>',                                                        // Rising Name: star
    4: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',                               // Arcane Insider: eye
    5: '<path d="M12 3l7 2.8v5.4c0 4.4-3 7.7-7 9.8-4-2.1-7-5.4-7-9.8V5.8z"/><path d="M9 12l2.2 2.2L15.5 10"/>',                                       // Streetwise: shield
    6: '<path d="M12 3c.6 3-1.4 4.4-3 6.4C7.5 11.2 7 12.8 7 14.5a5 5 0 0010 0c0-2-.9-3.2-2-4.5 0 1.5-.7 2.3-1.7 2.5.5-3-.2-6-1.3-9.5z"/>',            // Notorious: flame
    7: '<path d="M12 2.8l7.6 4.4v9.6L12 21.2 4.4 16.8V7.2z"/><path d="M12 8l3.2 4-3.2 4-3.2-4z"/>',                                                   // Hextech Adept: hexagon + crystal
    8: '<path d="M12 2.5l1.8 5 4.7-2.3-2.3 4.7 5 1.8-5 1.8 2.3 4.7-4.7-2.3-1.8 5-1.8-5-4.7 2.3 2.3-4.7-5-1.8 5-1.8-2.3-4.7 4.7 2.3z"/>',               // Power Player: burst
    9: '<path d="M3.5 8l4.2 4 4.3-6.5L16.3 12l4.2-4-1.7 10.5H5.2z"/><path d="M5.5 20.5h13"/>',                                                        // Underworld Legend: crown
    10: '<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(-25 12 12)"/><path d="M12 2.5v3M12 18.5v3"/>'     // Arcane Legend: galaxy
};

export const RANK_NAMES = ['New Arrival', 'Undercity Regular', 'Rising Name', 'Arcane Insider', 'Streetwise', 'Notorious', 'Hextech Adept', 'Power Player', 'Underworld Legend', 'Arcane Legend'];

// "🛤️ Undercity Regular" -> "Undercity Regular" (drops any leading emoji or symbols; a title with nothing else is returned as it was)
export function cleanRankTitle(title) {
    const raw = String(title ?? '').trim();
    const t = raw.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    return t || raw;
}

// the badge as html: a ring in the tier colour around the icon. size is the outer width in px. Decorative: pair it with the title text.
export function rankBadgeHtml(level, size = 40) {
    const n = Math.min(10, Math.max(1, Math.round(Number(level)) || 1));
    const tier = rankTier(n);
    const color = RANK_TIER_COLORS[tier];
    const icon = Math.round(size * 0.54);
    return `<span class="rank-badge rank-badge--${tier}" style="--rb:${color};width:${size}px;height:${size}px" aria-hidden="true">` +
        `<svg viewBox="0 0 24 24" width="${icon}" height="${icon}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICONS[n]}</svg></span>`;
}

// css for the badge, injected once by pages that draw it outside the themed stylesheets (the notification cards build their own styles)
export const RANK_BADGE_CSS = '.rank-badge{display:inline-grid;place-items:center;flex:none;border-radius:50%;border:2px solid var(--rb,#CD7F32);color:#ff9bd9;' +
    'background:radial-gradient(circle at 50% 35%,#2a1740,#120b1e);box-shadow:0 0 14px color-mix(in srgb,var(--rb,#CD7F32) 40%,transparent);box-sizing:border-box}';
