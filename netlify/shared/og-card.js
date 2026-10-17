// Draws the 1200x630 preview image of a match (satori: layout -> SVG, resvg: SVG -> PNG).
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { describeMatch, renderable } from './og-model.js';

const W = 1200, H = 630, PINK = '#ff4fb4', BG = '#0b0510', CARD = '#1a0d22', MUTED = '#b9a3c4';
const h = (type, style, children, props = {}) => ({ type, props: { style: { display: 'flex', ...style }, children, ...props } });

function side(name, creator, thumb) {
    return h('div', { flexDirection: 'column', width: 470 }, [
        h('div', { width: 470, height: 290, borderRadius: 18, overflow: 'hidden', background: CARD, border: `2px solid ${PINK}55`, alignItems: 'center', justifyContent: 'center' },
            thumb ? { type: 'img', props: { src: thumb, width: 470, height: 290, style: { objectFit: 'cover', width: 470, height: 290 } } }
                  : h('div', { color: PINK, fontSize: 64 }, '▶')),
        h('div', { fontSize: 32, fontWeight: 800, color: '#fff', marginTop: 18, lineHeight: 1.2, height: 78, overflow: 'hidden' }, renderable(name) || 'Edit'),
        h('div', { fontSize: 22, fontWeight: 700, color: MUTED, marginTop: 6 }, renderable(creator) ? `by ${renderable(creator)}` : '')
    ]);
}

export function cardTree(d, thumbs = {}, host = 'anthemarena.com') {
    return h('div', { width: W, height: H, flexDirection: 'column', background: `linear-gradient(135deg, ${BG} 0%, #2a0f33 100%)`, padding: 44, fontFamily: 'Inter' }, [
        h('div', { justifyContent: 'space-between', alignItems: 'center' }, [
            h('div', { fontSize: 30, fontWeight: 800, color: PINK, letterSpacing: 4 }, 'ARCANE MOMENTS'),
            h('div', { fontSize: 26, fontWeight: 700, color: MUTED }, renderable([d.cup, d.stage].filter(Boolean).join(' · ')).toUpperCase())
        ]),
        h('div', { flex: 1, alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }, [
            side(d.a, d.creatorA, thumbs.a),
            h('div', { width: 96, height: 96, borderRadius: 48, background: PINK, color: '#1a0d22', fontSize: 38, fontWeight: 800, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 40px ${PINK}` }, 'VS'),
            side(d.b, d.creatorB, thumbs.b)
        ]),
        h('div', { justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }, [
            h('div', { fontSize: 26, fontWeight: 700, color: '#fff' }, `${d.votes} ${d.votes === 1 ? 'vote' : 'votes'}  ·  ${d.status}`),
            h('div', { fontSize: 26, fontWeight: 800, color: PINK }, d.live ? `Pick your side at ${host}` : host)
        ])
    ]);
}

// fonts: [{ name, data, weight }]; thumbs: { a, b } data URIs (or missing)
export async function renderCard(match, { fonts, thumbs = {}, host, now } = {}) {
    const d = describeMatch(match, now);
    const svg = await satori(cardTree(d, thumbs, host), {
        width: W, height: H,
        fonts: fonts.map(f => ({ name: 'Inter', data: f.data, weight: f.weight, style: 'normal' }))
    });
    return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
