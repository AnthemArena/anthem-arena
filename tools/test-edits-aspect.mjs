// Offline test for tools/edits-aspect.js: draws fake 480x360 thumbnails (picture in the middle, black bars around it,
// noisy like a real JPEG) for each shape and checks the detector gets them right.   node tools/test-edits-aspect.mjs
import jpeg from 'jpeg-js';
import { detectAspect, ASPECTS, aspectFromEmbed, fillAspectsFromApi, fillAspects } from './edits-aspect.js';

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

// ---- API embed size (main source) ----
// Real values from the YouTube API, checked 2026-10-11: square 720x720, Short 720x1280, landscape 720x405.
for (const [w, h, want] of [[720, 720, '1:1'], [720, 1280, '9:16'], [720, 405, '16:9'], [720, 540, '4:3'], [720, 900, '4:5'], [720, 800, '9:10'], [720, 794, '9:10'], [720, 751, '1:1'], [720, 748, '1:1']])
  check(`embed ${w}x${h} -> ${want}`, aspectFromEmbed(w, h)?.aspect === want && !aspectFromEmbed(w, h).check);
check('embed size missing -> null', aspectFromEmbed(undefined, undefined) === null && aspectFromEmbed('0', '0') === null);
check('odd embed shape is flagged', aspectFromEmbed(720, 600)?.check === true);

const sizes = { sq: ['720', '720'], vert: ['720', '1280'], wide: ['720', '405'] };
const calls = [];
const getPlayers = async ids => { calls.push(ids.length); return ids.filter(id => sizes[id]).map(id => ({ id, player: { embedWidth: sizes[id][0], embedHeight: sizes[id][1] } })); };
const list = [
  { videoId: 'sq', status: 'ok', aspect: '4:3', aspectSource: 'auto', aspectCheck: true },     // old thumbnail guess, API corrects it
  { videoId: 'vert', status: 'ok', aspect: '1:1', aspectSource: 'auto' },                       // old thumbnail guess, wrong
  { videoId: 'wide', status: 'ok' },                                                           // no aspect yet
  { videoId: 'hand', status: 'ok', aspect: '4:5', aspectSource: 'manual' },                    // manual: untouched
  { videoId: 'gone', status: 'ok', aspect: '1:1', aspectSource: 'auto' },                      // API has no size: keep, flag
  { videoId: 'new', status: 'ok' },                                                            // API has no size, no value: left for thumbnail fallback
  { videoId: 'blk', status: 'blocked' },
];
await fillAspectsFromApi(list, { getPlayers });
const by = id => list.find(e => e.videoId === id);
check('API corrects a wrong thumbnail value', by('sq').aspect === '1:1' && by('sq').aspectSource === 'api' && !by('sq').aspectCheck);
check('API finds a vertical Short', by('vert').aspect === '9:16' && by('vert').aspectSource === 'api');
check('API fills an empty aspect', by('wide').aspect === '16:9' && by('wide').aspectSource === 'api');
check('manual value untouched', by('hand').aspect === '4:5' && by('hand').aspectSource === 'manual');
check('no API size: thumbnail value kept and flagged', by('gone').aspect === '1:1' && by('gone').aspectSource === 'auto' && by('gone').aspectCheck === true);
check('no API size and no value: stays empty', by('new').aspect === undefined);
check('blocked edit skipped', by('blk').aspect === undefined);
check('one API call for 5 videos (blocked and manual left out)', calls.length === 1 && calls[0] === 5, `(${calls})`);
const many = Array.from({ length: 120 }, (_, i) => ({ videoId: 'sq', status: 'ok' })); calls.length = 0;
await fillAspectsFromApi(many, { getPlayers });
check('batches of 50', calls.join() === '50,50,20', `(${calls})`);

// thumbnail fallback never overwrites API or manual values, and always flags its own guesses
const fb = [{ videoId: 'a', status: 'ok', aspect: '9:16', aspectSource: 'api' }, { videoId: 'b', status: 'ok', aspect: '1:1', aspectSource: 'manual' }];
await fillAspects(fb, { redetect: true, thumbsDir: '/nonexistent' });
check('fallback leaves api and manual values alone', fb[0].aspect === '9:16' && fb[1].aspect === '1:1');
process.exit(failed ? 1 : 0);
