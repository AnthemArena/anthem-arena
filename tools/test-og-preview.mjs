// Link preview of a match: pure helpers, the edge function (bots only) and the 1200x630 image.
//   node tools/test-og-preview.mjs [--save <png-path>]
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { isPreviewBot, previewName, renderable, describeMatch, rewriteHeadMeta, findMatch, timeLeft } from '../netlify/shared/og-model.js';
import { renderCard } from '../netlify/shared/og-card.js';
import voteMeta from '../netlify/edge-functions/vote-meta.js';

let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); console.log(`  ok   ${n}`); pass++; } catch (e) { console.log(`  FAIL ${n}\n       ${e.message}`); fail++; } };

const NOW = Date.parse('2026-10-17T12:00:00Z');
const match = {
    matchId: 'jinx-cup-1-group-C-match-1', tournamentName: 'Jinx Cup 1', roundLabel: 'Group C', status: 'live', totalVotes: 25,
    endDate: '2026-10-24T20:00:00Z',
    song1: { videoId: 'AAA', artist: 'Sunzyel', shortTitle: 'Them... - Jinx & Ekko Edit ("Arcane Season 2")｜Stromae #jinx #edit' },
    song2: { videoId: 'BBB', artist: 'SteveFX1', title: 'Bro tried to rizz Jinx 💀 - JINX EDIT || Britney Spears - Toxic #jinxedit #jinx' }
};
const page = `<html><head>
<title>Vote Now | Arcane Moments</title>
<meta name="description" content="Cast your vote">
<link rel="canonical" href="https://anthemarena.com/vote">
<meta property="og:title" content="Vote Now | Arcane Moments">
<meta property="og:image" content="https://anthemarena.com/images/og-image.png">
<meta name="twitter:image" content="https://anthemarena.com/images/og-image.png">
</head><body>vote</body></html>`;

await t('bots are recognised, browsers are not', () => {
    for (const ua of ['Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', 'Twitterbot/1.0', 'facebookexternalhit/1.1', 'WhatsApp/2.23', 'Slackbot-LinkExpanding 1.0']) assert.ok(isPreviewBot(ua), ua);
    for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/118 Safari/537.36', '', null]) assert.ok(!isPreviewBot(ua), String(ua));
});
await t('names lose hashtags and the song-credit tail, keep the edit name', () => {
    assert.equal(previewName(match.song1.shortTitle), 'Them... - Jinx & Ekko Edit ("Arcane Season 2")');
    assert.equal(previewName(match.song2.title), 'Bro tried to rizz Jinx 💀 - JINX EDIT');
    assert.equal(previewName('x'.repeat(100)).length, 70);
});
await t('emoji and other scripts are dropped for the image font', () => {
    assert.equal(renderable('Bro tried to rizz Jinx 💀'), 'Bro tried to rizz Jinx');
    assert.equal(renderable('Jinx 全部 edit'), 'Jinx edit');
    assert.equal(renderable('Café “quoted” – dash…'), 'Café “quoted” – dash…');
});
await t('time left', () => {
    assert.equal(timeLeft('2026-10-24T20:00:00Z', NOW), '7d 8h left');
    assert.equal(timeLeft('2026-10-17T12:30:00Z', NOW), '30m left');
    assert.equal(timeLeft('2026-10-17T11:00:00Z', NOW), null);
});
await t('description of a live match', () => {
    const d = describeMatch(match, NOW);
    assert.equal(d.title, 'Them... - Jinx & Ekko Edit ("Arcane Season 2") vs Bro tried to rizz Jinx 💀 - JINX EDIT | Arcane Moments');
    assert.equal(d.description, 'Jinx Cup 1 · Group C: Them... - Jinx & Ekko Edit ("Arcane Season 2") or Bro tried to rizz Jinx 💀 - JINX EDIT? 25 votes so far. Cast your vote (7d 8h left).');
    assert.equal(d.status, '7d 8h left');
});
await t('description of a closed match', () => {
    const d = describeMatch({ ...match, status: 'completed' }, NOW);
    assert.equal(d.status, 'Voting closed'); assert.ok(!d.description.includes('Cast your vote'));
});
await t('tags are rewritten and escaped, missing ones added', () => {
    const out = rewriteHeadMeta(page, { title: 'A "b" <c>', description: 'd', imageUrl: 'https://x/og.png?match=1', pageUrl: 'https://x/vote?match=1' });
    assert.ok(out.includes('<title>A &quot;b&quot; &lt;c&gt;</title>'));
    assert.ok(out.includes('<meta property="og:image" content="https://x/og.png?match=1">'));
    assert.ok(out.includes('<meta name="twitter:image" content="https://x/og.png?match=1">'));
    assert.ok(out.includes('<meta property="og:url" content="https://x/vote?match=1">'));
    assert.ok(out.includes('<link rel="canonical" href="https://x/vote?match=1">'));
    assert.ok(out.includes('<meta name="twitter:card" content="summary_large_image">'), 'missing tag is added');
    assert.ok(!out.includes('images/og-image.png'));
    assert.equal((out.match(/property="og:title"/g) || []).length, 1);
});
await t('findMatch', () => { assert.equal(findMatch([match], match.matchId), match); assert.equal(findMatch([match], 'x'), null); assert.equal(findMatch(null, 'x'), null); });

// --- edge function ---
const BOT = 'Mozilla/5.0 (compatible; Discordbot/2.0)';
const run = async ({ ua = BOT, query = `?match=${match.matchId}`, matches = [match], ok = true, ctype = 'text/html' } = {}) => {
    globalThis.fetch = async u => { assert.ok(String(u).endsWith('/api/matches')); return { ok, json: async () => matches }; };
    const next = async () => new Response(page, { status: 200, headers: { 'content-type': ctype, 'content-length': String(page.length) } });
    const res = await voteMeta(new Request(`https://anthemarena.com/vote${query}`, { headers: { 'user-agent': ua } }), { next });
    return res === undefined ? { passedThrough: true } : { text: await res.text(), headers: res.headers, status: res.status };
};
await t('edge: a browser is not touched', async () => assert.ok((await run({ ua: 'Mozilla/5.0 Chrome/118' })).passedThrough));
await t('edge: no ?match= is not touched', async () => assert.ok((await run({ query: '' })).passedThrough));
await t('edge: a bot gets the match tags and image link', async () => {
    const r = await run();
    assert.ok(r.text.includes('Jinx &amp; Ekko Edit'));
    assert.ok(r.text.includes('https://anthemarena.com/og/match.png?match=jinx-cup-1-group-C-match-1'));
    assert.ok(!r.headers.get('content-length'));
});
await t('edge: unknown match / list error / non-html => plain page', async () => {
    for (const o of [{ matches: [] }, { ok: false }, { ctype: 'application/json' }]) { const r = await run(o); assert.ok(r.text.includes('Vote Now | Arcane Moments'), JSON.stringify(o)); }
});

// --- image ---
const fonts = await Promise.all([700, 800].map(async weight => ({ weight, data: await readFile(new URL(`../netlify/functions/assets/inter-${weight}.woff`, import.meta.url)) })));
const fakeThumb = (c1, c2) => `data:image/png;base64,${Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="g"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="480" height="360" fill="url(#g)"/></svg>`).render().asPng()).toString('base64')}`;
await t('image: 1200x630 PNG with and without thumbnails', async () => {
    for (const thumbs of [{ a: fakeThumb('#3a86ff', '#8338ec'), b: fakeThumb('#ff006e', '#fb5607') }, {}]) {
        const png = await renderCard(match, { fonts, thumbs, host: 'anthemarena.com', now: NOW });
        assert.equal(png.subarray(1, 4).toString(), 'PNG');
        assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
        if (process.argv.includes('--save') && thumbs.a) await writeFile(process.argv[process.argv.indexOf('--save') + 1], png);
    }
});
await t('image: long names, empty creator and emoji do not break it', async () => {
    const m = { ...match, song1: { ...match.song1, shortTitle: 'x'.repeat(300), artist: '' }, song2: { ...match.song2, shortTitle: '💀💀💀 全部' } };
    assert.equal((await renderCard(m, { fonts, host: 'a.b' })).subarray(1, 4).toString(), 'PNG');
});
// --- the real function handler, as Netlify calls it ---
const { handler } = await import('../netlify/functions/og-match.js');
const callHandler = async (qs, { matches = [match], thumbs = true } = {}) => {
    globalThis.fetch = async u => {
        u = String(u);
        if (u.endsWith('/api/matches')) return { ok: true, json: async () => matches };
        if (u.includes('img.youtube.com')) return thumbs ? { ok: true, arrayBuffer: async () => Buffer.from(fakeThumb('#111', '#999').split(',')[1], 'base64') } : { ok: false };
        throw new Error('unexpected fetch ' + u);
    };
    return handler({ rawUrl: 'https://arcanemoments.netlify.app/og/match.png?' + qs, queryStringParameters: Object.fromEntries(new URLSearchParams(qs)) });
};
await t('handler: returns the PNG as base64 with caching headers', async () => {
    const r = await callHandler(`match=${match.matchId}`);
    assert.equal(r.statusCode, 200); assert.equal(r.isBase64Encoded, true);
    assert.equal(r.headers['Content-Type'], 'image/png'); assert.ok(r.headers['Cache-Control'].includes('s-maxage'));
    assert.equal(Buffer.from(r.body, 'base64').subarray(1, 4).toString(), 'PNG');
});
await t('handler: thumbnails failing still gives an image', async () => assert.equal((await callHandler(`match=${match.matchId}`, { thumbs: false })).statusCode, 200));
await t('handler: a thumbnail that is not a real image is skipped, not fatal', async () => {
    const orig = globalThis.fetch; const r0 = await callHandler(`match=${match.matchId}`);
    globalThis.fetch = async u => String(u).endsWith('/api/matches') ? { ok: true, json: async () => [match] } : { ok: true, arrayBuffer: async () => Buffer.from('<html>not an image</html>') };
    const r = await handler({ rawUrl: 'https://x.test/og/match.png?match=' + match.matchId, queryStringParameters: { match: match.matchId } });
    assert.equal(r.statusCode, 200); assert.ok(r0.statusCode === 200); globalThis.fetch = orig;
});
await t('handler: unknown match or no id redirects to the default image', async () => {
    for (const qs of ['match=nope', '']) { const r = await callHandler(qs); assert.equal(r.statusCode, 302); assert.equal(r.headers.Location, 'https://arcanemoments.netlify.app/og-image.png'); }
});
console.log(`${pass} passed${fail ? `, ${fail} FAILED` : ''}`); process.exit(fail ? 1 : 0);
