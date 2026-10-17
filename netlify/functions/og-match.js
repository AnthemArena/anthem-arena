// /og/match.png?match=<matchId>  ->  1200x630 preview image of that match, used as og:image by the vote-meta edge function.
import { findMatch } from '../shared/og-model.js';
import { renderCard, contentRect } from '../shared/og-card.js';
import { INTER_700, INTER_800 } from '../shared/og-fonts.js';

// Fonts are embedded in the bundle (reading ./assets/*.woff failed once the function was bundled: the path moves).
const FONTS = [{ weight: 700, data: Buffer.from(INTER_700, 'base64') }, { weight: 800, data: Buffer.from(INTER_800, 'base64') }];

async function thumb(videoId) {
    if (!videoId) return null;
    try {
        const res = await fetch(`https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const isPng = buf.subarray(1, 4).toString() === 'PNG', isJpeg = buf[0] === 0xff && buf[1] === 0xd8;   // satori reads the bytes by type
        if (!isPng && !isJpeg) return null;
        return { uri: `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${buf.toString('base64')}`, rect: isJpeg ? contentRect(buf) : null };
    } catch (e) { return null; }
}

export async function handler(event) {
    const origin = new URL(event.rawUrl).origin;
    const fallback = { statusCode: 302, headers: { Location: `${origin}/og-image.png`, 'Cache-Control': 'public, max-age=300' }, body: '' };
    try {
        const id = event.queryStringParameters?.match;
        if (!id) return fallback;
        const res = await fetch(`${origin}/api/matches`, { signal: AbortSignal.timeout(4000) });
        const match = res.ok ? findMatch(await res.json(), id) : null;
        if (!match) return fallback;

        const [a, b] = await Promise.all([thumb(match.song1?.videoId || match.song1?.id), thumb(match.song2?.videoId || match.song2?.id)]);
        const host = new URL(origin).host;
        let png;
        try { png = await renderCard(match, { fonts: FONTS, thumbs: { a, b }, host }); }
        catch (e) { console.error('og-match: thumbnails could not be drawn, retrying without them:', e); png = await renderCard(match, { fonts: FONTS, host }); }
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' },
            body: Buffer.from(png).toString('base64'),
            isBase64Encoded: true
        };
    } catch (e) {
        console.error('og-match failed:', e);
        // ?debug=1 shows the reason instead of redirecting to the default image
        if (event.queryStringParameters?.debug) return { statusCode: 500, headers: { 'Content-Type': 'text/plain' }, body: String(e && e.stack || e) };
        return fallback;
    }
}
