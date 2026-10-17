// Link previews for shared match links (/vote?match=<id>).
// Only for link-preview bots (Discord, X, Slack, WhatsApp, Facebook ...): they do not run JavaScript, so they would otherwise
// all see the generic vote.html tags. For them the title, description and og:image are rewritten for that match, with the image
// drawn by netlify/functions/og-match.js. Real visitors get vote.html untouched and are not slowed down.
import { isPreviewBot, findMatch, describeMatch, rewriteHeadMeta, IMAGE_VERSION } from '../shared/og-model.js';

export default async (request, context) => {
    const url = new URL(request.url);
    const matchId = url.searchParams.get('match') || url.searchParams.get('id');
    if (!matchId || !isPreviewBot(request.headers.get('user-agent'))) return;   // no return value = carry on as normal

    const response = await context.next();
    try {
        if (!String(response.headers.get('content-type') || '').includes('text/html')) return response;

        // the cached match list (same one the site uses), not a Firestore read per bot hit
        const res = await fetch(new URL('/api/matches', url), { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return response;
        const match = findMatch(await res.json(), matchId);
        if (!match) return response;

        const d = describeMatch(match);
        const pageUrl = `${url.origin}/vote?match=${encodeURIComponent(matchId)}`;
        const html = rewriteHeadMeta(await response.clone().text(), {
            title: d.title,
            description: d.description,
            imageUrl: `${url.origin}/og/match.png?match=${encodeURIComponent(matchId)}&v=${IMAGE_VERSION}`,
            pageUrl,
            imageAlt: `${d.a} versus ${d.b}`
        });
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.set('cache-control', 'public, max-age=0, s-maxage=300');
        return new Response(html, { status: response.status, headers });
    } catch (e) {
        console.error('vote-meta failed, serving the plain page:', e);
        return response;
    }
};
