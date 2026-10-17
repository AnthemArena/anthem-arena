// Draws the 1200x630 preview image of a match (satori: layout -> SVG, resvg: SVG -> PNG).
// Colours, panel look and radius follow css/arcane-theme.css (--bg, --pink, --card, --border, --radius ...).
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { describeMatch, renderable } from './og-model.js';

const W = 1200, H = 630;
const BG = '#06070e', PINK = '#ff4fb4', PINK_BRIGHT = '#ff70c3', TEXT = '#f6f3f7', MUTED = '#b7b2bc';
const CARD = 'rgba(7, 8, 15, 0.85)', BORDER = 'rgba(255, 79, 180, 0.25)', RADIUS = 22;
const BOX_W = 466, BOX_H = 270;   // thumbnail frame inside each panel

const h = (type, style, children, props = {}) => ({ type, props: { style: { display: 'flex', ...style }, children, ...props } });

// YouTube's thumbnail for a vertical video is the video with black bars left/right (or top/bottom). Find the picture inside the bars.
// Returns { x, y, w, h } in the thumbnail's own pixels; the whole picture when nothing can be measured.
export function contentRect(buf, { dark = 28, minBar = 6 } = {}) {
    let img;
    try { img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 64 }); } catch (e) { return null; }
    const { width: w, height: hh, data } = img;
    const lum = (x, y) => { const i = (y * w + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
    const colDark = x => { for (let y = 0; y < hh; y += 6) if (lum(x, y) > dark) return false; return true; };
    const rowDark = y => { for (let x = 0; x < w; x += 6) if (lum(x, y) > dark) return false; return true; };
    let l = 0; while (l < w - 1 && colDark(l)) l++;
    let r = w - 1; while (r > l && colDark(r)) r--;
    let t = 0; while (t < hh - 1 && rowDark(t)) t++;
    let b = hh - 1; while (b > t && rowDark(b)) b--;
    if (l < minBar) l = 0;
    if (w - 1 - r < minBar) r = w - 1;
    if (t < minBar) t = 0;
    if (hh - 1 - b < minBar) b = hh - 1;
    const rect = { x: l, y: t, w: r - l + 1, h: b - t + 1 };
    // nothing left to show (a black thumbnail) or an implausibly thin sliver: keep the whole picture
    return rect.w < w * 0.2 || rect.h < hh * 0.2 ? { x: 0, y: 0, w, h: hh, srcW: w, srcH: hh } : { ...rect, srcW: w, srcH: hh };
}

// the thumbnail, scaled and positioned so the picture (without its bars) fills the frame
function frame(thumb) {
    if (!thumb || !thumb.uri) return h('div', { color: PINK, fontSize: 64 }, '▶');
    const sw = thumb.rect?.srcW || 480, sh = thumb.rect?.srcH || 360;
    const rect = thumb.rect || { x: 0, y: 0, w: sw, h: sh };
    const s = Math.max(BOX_W / rect.w, BOX_H / rect.h);
    const iw = Math.round(sw * s), ih = Math.round(sh * s);
    const left = -Math.round(rect.x * s + (rect.w * s - BOX_W) / 2);
    const top = -Math.round(rect.y * s + (rect.h * s - BOX_H) / 2);
    return { type: 'img', props: { src: thumb.uri, width: iw, height: ih, style: { position: 'absolute', left, top, width: iw, height: ih } } };
}

function side(name, creator, thumb) {
    return h('div', { flexDirection: 'column', width: 500, padding: 16, background: CARD, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: '0 24px 80px rgba(0, 0, 0, 0.46)' }, [
        h('div', { position: 'relative', width: BOX_W, height: BOX_H, borderRadius: RADIUS - 8, overflow: 'hidden', background: '#000', alignItems: 'center', justifyContent: 'center' }, frame(thumb)),
        h('div', { fontSize: 28, fontWeight: 800, color: TEXT, marginTop: 16, lineHeight: 1.2, height: 68, overflow: 'hidden', letterSpacing: -0.5 }, renderable(name) || 'Edit'),
        h('div', { fontSize: 21, fontWeight: 700, color: MUTED, marginTop: 6 }, renderable(creator) ? `by ${renderable(creator)}` : ' ')
    ]);
}

export function cardTree(d, thumbs = {}, host = 'anthemarena.com') {
    return h('div', {
        width: W, height: H, flexDirection: 'column', padding: 40, fontFamily: 'Inter', color: TEXT, backgroundColor: BG,
        backgroundImage: 'radial-gradient(circle at 50% 12%, rgba(255, 79, 180, 0.16), rgba(255, 79, 180, 0) 45%), radial-gradient(circle at 0% 45%, rgba(255, 79, 180, 0.18), rgba(255, 79, 180, 0) 40%), radial-gradient(circle at 100% 75%, rgba(255, 79, 180, 0.15), rgba(255, 79, 180, 0) 40%)'
    }, [
        h('div', { justifyContent: 'space-between', alignItems: 'center' }, [
            h('div', { fontSize: 28, fontWeight: 800, color: PINK_BRIGHT, letterSpacing: 5 }, 'ARCANE MOMENTS'),
            h('div', { fontSize: 22, fontWeight: 700, color: MUTED, letterSpacing: 2, padding: '8px 18px', border: `1px solid ${BORDER}`, borderRadius: 999, background: 'rgba(255, 79, 180, 0.08)' },
                renderable([d.cup, d.stage].filter(Boolean).join(' · ')).toUpperCase())
        ]),
        h('div', { flex: 1, alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }, [
            side(d.a, d.creatorA, thumbs.a),
            h('div', { width: 84, height: 84, borderRadius: 42, background: PINK, color: BG, fontSize: 34, fontWeight: 800, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(255, 79, 180, 0.7)' }, 'VS'),
            side(d.b, d.creatorB, thumbs.b)
        ]),
        h('div', { justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }, [
            h('div', { fontSize: 24, fontWeight: 700, color: TEXT }, `${d.votes} ${d.votes === 1 ? 'vote' : 'votes'}  ·  ${d.status}`),
            h('div', { fontSize: 24, fontWeight: 800, color: PINK_BRIGHT }, d.live ? `Pick your side at ${host}` : host)
        ])
    ]);
}

// fonts: [{ weight, data }]; thumbs: { a, b } as { uri (data URI), rect (from contentRect) } or missing
export async function renderCard(match, { fonts, thumbs = {}, host, now } = {}) {
    const d = describeMatch(match, now);
    const svg = await satori(cardTree(d, thumbs, host), {
        width: W, height: H,
        fonts: fonts.map(f => ({ name: 'Inter', data: f.data, weight: f.weight, style: 'normal' }))
    });
    return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
