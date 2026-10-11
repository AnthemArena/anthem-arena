// Offline test for tools/edits-aspect.js: draws fake 480x360 thumbnails (picture in the middle, black bars around it,
// noisy like a real JPEG) for each shape and checks the detector gets them right.   node tools/test-edits-aspect.mjs
import jpeg from 'jpeg-js';
import { detectAspect, ASPECTS } from './edits-aspect.js';

const W = 480, H = 360;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function thumb(ratio, { darkEdge = 0, black = false } = {}) {
  let pw = Math.round(ratio <= W / H ? H * ratio : W), ph = Math.round(ratio <= W / H ? H : W / ratio);
  const x0 = Math.round((W - pw) / 2), y0 = Math.round((H - ph) / 2), data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = !black && x >= x0 && x < x0 + pw && y >= y0 && y < y0 + ph, i = (y * W + x) * 4;
    let v = inside ? 40 + 150 * Math.abs(Math.sin(x / 17 + y / 23)) + rnd() * 30 : 16 + rnd() * 3;
    if (inside && darkEdge && (x - x0 < darkEdge || x0 + pw - x <= darkEdge)) v = 20 + rnd() * 4;   // video with a dark edge
    data[i] = v; data[i + 1] = v * 0.9; data[i + 2] = v * 1.1; data[i + 3] = 255;
  }
  return jpeg.encode({ data, width: W, height: H }, 80).data;
}

let failed = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`); if (!ok) failed++; };
for (const [name, ratio] of Object.entries(ASPECTS)) {
  const r = await detectAspect(thumb(ratio));
  check(`${name} detected as ${r.aspect}`, r.aspect === name && !r.check, `(measured ${r.ratio})`);
}
const dark = await detectAspect(thumb(1, { darkEdge: 30 }));
console.log(`INFO  square video with a very dark edge reads as ${dark.aspect} (${dark.ratio})${dark.check ? ' CHECK' : ''}: a known limit, use the manual override`);
const blk = await detectAspect(thumb(1, { black: true }));
check('all-black thumbnail returns no aspect', blk.aspect === null, `(${blk.note})`);
process.exit(failed ? 1 : 0);
