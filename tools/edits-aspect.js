#!/usr/bin/env node
// Works out the picture shape ("aspect") of each edit from its YouTube thumbnail and writes it to data/edits.json.
//
//   node tools/edits-aspect.js                 fill in aspect for every edit that has none (no API key needed)
//   node tools/edits-aspect.js --redetect      also re-check edits whose aspect was set automatically
//   node tools/edits-aspect.js data/edits.json --thumbs some-folder     offline test: reads <folder>/<videoId>.jpg
//
// How it works: YouTube's hqdefault.jpg is always a 4:3 frame (480x360). A square or vertical video sits in the middle with
// black bars at the sides, a wide video with bars above and below. We measure the bars and snap the picture's shape to the
// nearest known aspect. Edits with very dark edges can be misread, so anything unsure gets "aspectCheck": true.
//
// Manual override: just edit "aspect" in data/edits.json and set "aspectSource": "manual". Manual values are never touched.
// Allowed values: "9:16", "3:4", "4:5", "1:1", "4:3", "16:9".
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const ASPECTS = { '9:16': 9 / 16, '3:4': 3 / 4, '4:5': 4 / 5, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };
const DARK = 28;          // luma at or below this counts as "black bar" (the bars are about 16, plus JPEG noise)
const BAR_BRIGHT_MAX = 0.02; // a column/row is a bar if at most 2% of its pixels are brighter than DARK
const SNAP_TOLERANCE = 0.025; // more than 2.5% away from a known shape = unsure
const SYMMETRY_PX = 6;    // bars on the two sides should match to within this many pixels

const snap = ratio => {
  let best = null, dist = Infinity;
  for (const [name, r] of Object.entries(ASPECTS)) { const d = Math.abs(Math.log(ratio / r)); if (d < dist) { dist = d; best = name; } }
  return { aspect: best, distance: dist };
};

// Decode a JPEG and measure the bars. Returns { aspect, ratio, check, note } or { aspect: null, note }.
export async function detectAspect(jpegBuffer) {
  let decode;
  try { ({ decode } = (await import('jpeg-js')).default || (await import('jpeg-js'))); }
  catch { throw new Error('jpeg-js is not installed. Run: npm install'); }
  const img = decode(jpegBuffer, { useTArray: true });
  const W = img.width, H = img.height, px = img.data;
  const luma = (x, y) => { const i = (y * W + x) * 4; return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; };
  const isBarCol = (x, y0, y1) => { let b = 0; for (let y = y0; y < y1; y++) if (luma(x, y) > DARK) b++; return b / (y1 - y0) <= BAR_BRIGHT_MAX; };
  const isBarRow = (y, x0, x1) => { let b = 0; for (let x = x0; x < x1; x++) if (luma(x, y) > DARK) b++; return b / (x1 - x0) <= BAR_BRIGHT_MAX; };

  let left = 0; while (left < W && isBarCol(left, 0, H)) left++;
  if (left >= W) return { aspect: null, note: 'thumbnail is completely black' };
  let right = 0; while (right < W - left && isBarCol(W - 1 - right, 0, H)) right++;
  let top = 0; while (top < H && isBarRow(top, left, W - right)) top++;
  let bottom = 0; while (bottom < H - top && isBarRow(H - 1 - bottom, left, W - right)) bottom++;

  const pw = W - left - right, ph = H - top - bottom;
  if (pw < 20 || ph < 20) return { aspect: null, note: 'picture area too small to measure' };
  const ratio = pw / ph, { aspect, distance } = snap(ratio);
  const notes = [];
  if (Math.abs(left - right) > SYMMETRY_PX) notes.push(`side bars uneven (${left}px / ${right}px)`);
  if (Math.abs(top - bottom) > SYMMETRY_PX) notes.push(`top/bottom bars uneven (${top}px / ${bottom}px)`);
  if (distance > SNAP_TOLERANCE) notes.push(`measured ${ratio.toFixed(3)}, not close to a standard shape`);
  if (left > 0 && top > 0) notes.push('bars on all four sides');
  return { aspect, ratio: Number(ratio.toFixed(3)), check: notes.length > 0, note: notes.join('; ') };
}

async function thumbnailFor(videoId, thumbsDir) {
  if (thumbsDir) { const f = path.join(thumbsDir, `${videoId}.jpg`); return fs.existsSync(f) ? fs.readFileSync(f) : null; }
  const res = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

// Fills aspect / aspectSource / aspectCheck on the entries in `list` (mutates them). Returns a list of report lines.
export async function fillAspects(list, { redetect = false, thumbsDir = null } = {}) {
  const lines = [];
  for (const e of list) {
    if (e.status === 'blocked') continue;
    const manual = e.aspect && e.aspectSource !== 'auto';
    if (manual) continue;                                    // manual values are never changed
    if (e.aspect && !redetect) continue;                     // already detected, keep unless --redetect
    let result;
    try {
      const buf = await thumbnailFor(e.videoId, thumbsDir);
      if (!buf) { lines.push(`  ${e.videoId}  no thumbnail found, aspect left empty`); continue; }
      result = await detectAspect(buf);
    } catch (err) {
      if (/jpeg-js/.test(err.message)) throw err;
      lines.push(`  ${e.videoId}  could not read thumbnail (${err.message}), aspect left empty`); continue;
    }
    if (!result.aspect) { lines.push(`  ${e.videoId}  ${result.note}: set "aspect" by hand`); continue; }
    e.aspect = result.aspect; e.aspectSource = 'auto';
    if (result.check) { e.aspectCheck = true; lines.push(`  ${e.videoId}  ${result.aspect}  CHECK: ${result.note}  (${(e.shortTitle || e.title || '').slice(0, 40)})`); }
    else { delete e.aspectCheck; lines.push(`  ${e.videoId}  ${result.aspect}  (${(e.shortTitle || e.title || '').slice(0, 40)})`); }
  }
  return lines;
}

// ---------- command line ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const take = flag => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const redetect = args.includes('--redetect'); if (redetect) args.splice(args.indexOf('--redetect'), 1);
  const thumbsDir = take('--thumbs');
  const file = args[0] || 'data/edits.json';
  (async () => {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lines = await fillAspects(list, { redetect, thumbsDir });
    fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
    console.log(lines.length ? `Aspect for ${lines.length} edit(s) -> ${file}\n${lines.join('\n')}` : 'Nothing to do: every edit already has an aspect.');
    if (lines.some(l => l.includes('CHECK'))) console.log('\nCHECK = unsure. Open the edit on YouTube, then set "aspect" by hand and "aspectSource": "manual".');
  })().catch(e => { console.error('\nERROR: ' + e.message); process.exit(1); });
}
