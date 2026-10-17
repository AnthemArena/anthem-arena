// Link preview of a match: pure helpers, the edge function (bots only) and the 1200x630 image.
//   node tools/test-og-preview.mjs [--save <png-path>]
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { isPreviewBot, previewName, renderable, describeMatch, rewriteHeadMeta, findMatch, timeLeft } from '../netlify/shared/og-model.js';
import { renderCard, cardSvg, contentRect } from '../netlify/shared/og-card.js';
import jpeg from 'jpeg-js';
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
// a 480x360 JPEG like YouTube's: a picture with black bars (pillarbox: bars left/right, letterbox: bars top/bottom)
const makeJpeg = (box, c1 = [58, 134, 255], c2 = [255, 0, 110]) => {
    const w = 480, hh = 360, data = Buffer.alloc(w * hh * 4);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, inside = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
        const k = inside ? (x - box.x) / box.w : 0;
        data[i] = inside ? c1[0] + (c2[0] - c1[0]) * k : 0; data[i + 1] = inside ? c1[1] + (c2[1] - c1[1]) * k : 0; data[i + 2] = inside ? c1[2] + (c2[2] - c1[2]) * k : 0; data[i + 3] = 255;
    }
    return Buffer.from(jpeg.encode({ data, width: w, height: hh }, 92).data);
};
const asThumb = (buf, mime = 'image/jpeg') => ({ uri: `data:${mime};base64,${buf.toString('base64')}`, rect: mime === 'image/jpeg' ? contentRect(buf) : null });
const PILLAR = { x: 60, y: 0, w: 360, h: 360 }, LETTER = { x: 0, y: 45, w: 480, h: 270 };
const fakeThumb = () => asThumb(makeJpeg(PILLAR));
await t('thumbnail bars: pillarbox is found', () => { const r = contentRect(makeJpeg(PILLAR)); assert.ok(Math.abs(r.x - 60) <= 3 && Math.abs(r.w - 360) <= 6 && r.y === 0 && r.h === 360, JSON.stringify(r)); });
await t('thumbnail bars: letterbox is found', () => { const r = contentRect(makeJpeg(LETTER)); assert.ok(Math.abs(r.y - 45) <= 3 && Math.abs(r.h - 270) <= 6 && r.x === 0 && r.w === 480, JSON.stringify(r)); });
await t('thumbnail bars: a picture with no bars is left whole, a black one too, junk gives null', () => {
    const full = contentRect(makeJpeg({ x: 0, y: 0, w: 480, h: 360 })); assert.deepEqual([full.x, full.y, full.w, full.h], [0, 0, 480, 360]);
    const black = contentRect(makeJpeg({ x: 0, y: 0, w: 0, h: 0 })); assert.deepEqual([black.x, black.y, black.w, black.h], [0, 0, 480, 360]);
    assert.equal(contentRect(Buffer.from('nope')), null);
});
await t('image: 1200x630 PNG with and without thumbnails', async () => {
    for (const thumbs of [{ a: asThumb(makeJpeg(PILLAR)), b: asThumb(makeJpeg(LETTER, [255, 0, 110], [251, 86, 7])) }, {}]) {
        const png = await renderCard(match, { fonts, thumbs, host: 'anthemarena.com', now: NOW });
        assert.equal(png.subarray(1, 4).toString(), 'PNG');
        assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
        if (process.argv.includes('--save') && thumbs.a) await writeFile(process.argv[process.argv.indexOf('--save') + 1], png);
    }
});
await t('image: no blur filters in the SVG, and the render is fast', async () => {
    const opts = { fonts, thumbs: { a: asThumb(makeJpeg(PILLAR)), b: asThumb(makeJpeg(LETTER)) }, host: 'anthemarena.com', now: NOW };
    assert.ok(!/<filter/.test(await cardSvg(match, opts)), 'a box-shadow/blur crept back in: resvg takes seconds for it');
    await renderCard(match, opts);                                   // warm up
    const t0 = Date.now(); await renderCard(match, opts); const ms = Date.now() - t0;
    assert.ok(ms < 1500, `render took ${ms} ms (was 6000 with blur filters)`);
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
        if (u.includes('img.youtube.com')) return thumbs ? { ok: true, arrayBuffer: async () => makeJpeg(PILLAR) } : { ok: false };
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
