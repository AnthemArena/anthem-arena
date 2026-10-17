// /og/match.png?match=<matchId>  ->  1200x630 preview image of that match, used as og:image by the vote-meta edge function.
import { readFile } from 'node:fs/promises';
import { findMatch } from '../shared/og-model.js';
import { renderCard } from '../shared/og-card.js';

let fontsPromise;
const loadFonts = () => fontsPromise ||= Promise.all([700, 800].map(async weight => ({
    weight, data: await readFile(new URL(`./assets/inter-${weight}.woff`, import.meta.url))
})));

async function thumb(videoId) {
    if (!videoId) return null;
    try {
        const res = await fetch(`https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return null;
        return `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
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

        const [fonts, a, b] = await Promise.all([loadFonts(), thumb(match.song1?.videoId || match.song1?.id), thumb(match.song2?.videoId || match.song2?.id)]);
        const png = await renderCard(match, { fonts, thumbs: { a, b }, host: new URL(origin).host });
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' },
            body: Buffer.from(png).toString('base64'),
            isBase64Encoded: true
        };
    } catch (e) {
        console.error('og-match failed:', e);
        return fallback;
    }
}
