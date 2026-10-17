// Pure helpers for link previews of a match (used by the vote-meta edge function and the og-match image function).
// Self-contained on purpose: no imports, so both the Deno edge bundler and the Node function bundler can load it.

export const PREVIEW_BOT = /(discordbot|twitterbot|facebookexternalhit|facebot|slackbot|slack-imgproxy|whatsapp|telegrambot|linkedinbot|redditbot|applebot|googlebot|bingbot|skypeuripreview|embedly|pinterest|mastodon|bluesky|iframely|signal)/i;
// Known preview bots, PLUS anything that does not identify as a normal browser: every real browser's user-agent starts "Mozilla/5.0",
// while many link fetchers do not (Tumblr, Facebook, Viber, Line ...), and a list of names always misses some.
const LOOKS_AUTOMATED = /(bot|crawl|spider|preview|unfurl|fetch|scrape|fetcher|tumblr|vkshare|viber|line\/|kakaotalk)/i;
export const isPreviewBot = ua => {
    ua = String(ua || '');
    if (PREVIEW_BOT.test(ua) || LOOKS_AUTOMATED.test(ua)) return true;
    return !/^mozilla\//i.test(ua);   // empty or non-browser user-agent
};

// same idea as js/title-clean.js: drop trailing hashtags and everything after the first " - " / "||"
const TRAILING_TAGS = /(?:[\s ]*#(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]+)+[\s ]*$/u;
const DANGLING = /[\s |\-–—•·:,]+$/u;
export function shortName(title, max = 60) {
    const original = String(title ?? '').replace(/\s+/g, ' ').trim();
    let t = original.replace(TRAILING_TAGS, '').replace(DANGLING, '').trim();
    if (t.length < 3) t = original;
    const first = t.split(/\s+[-–—]\s+|\s*\|\|?\s*|｜/)[0].trim() || t;
    return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first;
}

// Longer than shortName: keeps the " - Edit name" part, drops hashtags and the "|| song credit" tail. For previews there is room for two lines.
export function previewName(title, max = 70) {
    const original = String(title ?? '').replace(/\s+/g, ' ').trim();
    let t = original.replace(TRAILING_TAGS, '').replace(DANGLING, '').trim();
    if (t.length < 3) t = original;
    t = (t.split(/\s*\|\|?\s*|\uff5c/)[0] || t).trim() || t;
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '\u2026' : t;
}

// The image font has Latin letters only: emoji and other scripts would render as empty boxes, so they are dropped.
export function renderable(text) {
    return String(text ?? '')
        .replace(/[^ -ɏ‐-―‘-‟… ]/gu, '')
        .replace(/\s+/g, ' ').trim();
}

export const findMatch = (matches, id) => (Array.isArray(matches) ? matches : []).find(m => (m.matchId || m.id) === id) || null;

export function timeLeft(endDate, now = Date.now()) {
    const t = Date.parse(endDate || ''); if (!Number.isFinite(t)) return null;
    const ms = t - now; if (ms <= 0) return null;
    const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
    return d >= 1 ? `${d}d ${h % 24}h left` : h >= 1 ? `${h}h ${min % 60}m left` : `${Math.max(min, 1)}m left`;
}

// Everything the preview says about a match
export function describeMatch(match, now = Date.now()) {
    const a = previewName(match.song1?.shortTitle || match.song1?.title || 'Edit 1');
    const b = previewName(match.song2?.shortTitle || match.song2?.title || 'Edit 2');
    const cup = match.tournamentName || 'Arcane Moments';
    const stage = match.roundLabel || (match.round ? `Round ${match.round}` : '');
    const live = match.status === 'live';
    const left = live ? timeLeft(match.endDate, now) : null;
    const votes = match.totalVotes || 0;
    const status = live ? (left || 'Voting open') : match.status === 'completed' ? 'Voting closed' : 'Coming soon';
    return {
        a, b, cup, stage, live, status, votes,
        creatorA: match.song1?.artist || '', creatorB: match.song2?.artist || '',
        videoA: match.song1?.videoId || match.song1?.id || null, videoB: match.song2?.videoId || match.song2?.id || null,
        title: `${a} vs ${b} | Arcane Moments`,
        description: live
            ? `${[cup, stage].filter(Boolean).join(' · ')}: ${a} or ${b}? ${votes ? `${votes} vote${votes === 1 ? '' : 's'} so far. ` : ''}Cast your vote${left ? ` (${left})` : ''}.`
            : `${[cup, stage].filter(Boolean).join(' · ')}: ${a} vs ${b}.`
    };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Replace the content of the existing title / description / og:* / twitter:* tags in vote.html (adds a tag when it is missing)
export function rewriteHeadMeta(html, { title, description, imageUrl, pageUrl, imageAlt }) {
    const set = (src, attr, name, value) => {
        const re = new RegExp(`<meta\\s+${attr}="${name.replace(/[:]/g, '\\:')}"[^>]*>`, 'i');
        const tag = `<meta ${attr}="${name}" content="${esc(value)}">`;
        return re.test(src) ? src.replace(re, tag) : src.replace('</head>', `    ${tag}\n</head>`);
    };
    let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
    out = set(out, 'name', 'description', description);
    out = set(out, 'property', 'og:title', title);
    out = set(out, 'property', 'og:description', description);
    out = set(out, 'property', 'og:image', imageUrl);
    out = set(out, 'property', 'og:image:alt', imageAlt || title);
    out = set(out, 'property', 'og:image:width', '1200');
    out = set(out, 'property', 'og:image:height', '630');
    out = set(out, 'property', 'og:url', pageUrl);
    out = set(out, 'name', 'twitter:card', 'summary_large_image');
    out = set(out, 'name', 'twitter:title', title);
    out = set(out, 'name', 'twitter:description', description);
    out = set(out, 'name', 'twitter:image', imageUrl);
    out = set(out, 'name', 'twitter:image:alt', imageAlt || title);
    out = out.replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(pageUrl)}">`);
    return out;
}
