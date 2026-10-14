#!/usr/bin/env node
// Works out the picture shape ("aspect") of each edit and writes it to data/edits.json.
//
//   export YOUTUBE_API_KEY=your_key_here
//   node tools/edits-aspect.js                 API first (needs the key), thumbnail bars for anything the API could not size
//   node tools/edits-aspect.js --redetect      also re-measure thumbnails that were measured before
//   node tools/edits-aspect.js --no-api        thumbnail bars only (no key needed)
//   node tools/edits-aspect.js data/edits.json --thumbs some-folder     offline test: reads <folder>/<videoId>.jpg
//
// Main source ("aspectSource": "api"): the YouTube API sizes its embed from the video's own shape. videos.list with
// part=player&maxWidth=720 gives 720x720 for a square video, 720x1280 for a vertical Short, 720x405 for a landscape one.
// Checked against known edits on 2026-10-11. That is the shape viewers see on the site, and it is 50 videos per call.
// Fallback ("aspectSource": "auto"): YouTube's hqdefault.jpg is always a 4:3 frame (480x360). A square or vertical video sits
// in the middle with black bars at the sides, a wide video with bars above and below. We measure the bars and snap to the
// nearest known aspect. This proved unreliable on real thumbnails (creator templates with dark edges, custom thumbnails),
// so every fallback result gets "aspectCheck": true and shows a "? check" pill in the report.
//
// Manual override: just edit "aspect" in data/edits.json and set "aspectSource": "manual". Manual values are never touched.
// Allowed values: "9:16", "3:4", "4:5", "9:10", "1:1", "4:3", "16:9". (9:10 = embed 720x800, common on real Shorts.)
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const ASPECTS = { '9:16': 9 / 16, '3:4': 3 / 4, '4:5': 4 / 5, '9:10': 9 / 10, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };
const DARK = 28;          // luma at or below this counts as "black bar" (the bars are about 16, plus JPEG noise)
const BAR_BRIGHT_MAX = 0.02; // a column/row is a bar if at most 2% of its pixels are brighter than DARK
const SNAP_TOLERANCE = 0.025; // more than 2.5% away from a known shape = unsure
const API_SNAP_TOLERANCE = 0.06; // API sizes are exact, so only flag a shape this far from every known one
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

// Shape from the embed size the API reports. Returns { aspect, ratio, check } or null when the size is missing or nonsense.
export function aspectFromEmbed(width, height) {
  const w = Number(width), h = Number(height);
  if (!(w > 0) || !(h > 0)) return null;
  const ratio = w / h, { aspect, distance } = snap(ratio);
  return { aspect, ratio: Number(ratio.toFixed(3)), check: distance > API_SNAP_TOLERANCE };
}

async function fetchPlayers(ids, key) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=player&maxWidth=720&maxResults=50&id=${ids.join(',')}&key=${key}`;
  const res = await fetch(url), body = await res.json();
  if (!res.ok) throw new Error(`YouTube API error ${res.status}: ${body.error?.message || JSON.stringify(body).slice(0, 200)}`);
  return body.items || [];
}

// Main source: sets aspect / aspectSource "api" from the API's embed size (mutates `list`). Never touches manual values.
// Entries the API cannot size keep any earlier thumbnail value, now flagged aspectCheck. `getPlayers(ids)` is injectable for tests.
export async function fillAspectsFromApi(list, { key, getPlayers = ids => fetchPlayers(ids, key) } = {}) {
  const lines = [];
  const todo = list.filter(e => e.status !== 'blocked' && !(e.aspect && e.aspectSource === 'manual'));
  if (!todo.length) return lines;
  const size = new Map();
  for (let i = 0; i < todo.length; i += 50)
    for (const v of await getPlayers(todo.slice(i, i + 50).map(e => e.videoId))) size.set(v.id, v.player || {});
  for (const e of todo) {
    const name = (e.shortTitle || e.title || '').slice(0, 40), p = size.get(e.videoId) || {};
    const r = aspectFromEmbed(p.embedWidth, p.embedHeight);
    if (!r) {
      if (e.aspect) { e.aspectCheck = true; lines.push(`  ${e.videoId}  API gave no size, kept thumbnail value ${e.aspect}  CHECK  (${name})`); }
      else lines.push(`  ${e.videoId}  API gave no size, falling back to the thumbnail  (${name})`);
      continue;
    }
    const was = e.aspect;
    e.aspect = r.aspect; e.aspectSource = 'api';
    if (r.check) { e.aspectCheck = true; lines.push(`  ${e.videoId}  ${r.aspect}  CHECK: embed ${p.embedWidth}x${p.embedHeight} is not close to a standard shape  (${name})`); }
    else { delete e.aspectCheck; if (was && was !== r.aspect) lines.push(`  ${e.videoId}  ${was} -> ${r.aspect}  (${name})`); }
  }
  return lines;
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
    if (e.aspect && e.aspectSource !== 'auto') continue;     // manual and API values are never changed
    if (e.aspect && !redetect) continue;                     // already measured from a thumbnail, keep unless --redetect
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
    e.aspect = result.aspect; e.aspectSource = 'auto'; e.aspectCheck = true;   // thumbnail bars are only a fallback: always flag
    lines.push(`  ${e.videoId}  ${result.aspect}  CHECK: thumbnail fallback${result.note ? ', ' + result.note : ''}  (${(e.shortTitle || e.title || '').slice(0, 40)})`);
  }
  return lines;
}

// ---------- command line ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const take = flag => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const redetect = args.includes('--redetect'); if (redetect) args.splice(args.indexOf('--redetect'), 1);
  const noApi = args.includes('--no-api'); if (noApi) args.splice(args.indexOf('--no-api'), 1);
  const thumbsDir = take('--thumbs');
  const KEY = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY_SERVER;
  const file = args[0] || 'data/edits.json';
  (async () => {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    let lines = [];
    if (!noApi && !thumbsDir) {
      if (KEY) lines = lines.concat(await fillAspectsFromApi(list, { key: KEY }));
      else console.log('No YOUTUBE_API_KEY set: using thumbnail bars only (less reliable).\n');
    }
    lines = lines.concat(await fillAspects(list, { redetect, thumbsDir }));
    fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
    console.log(lines.length ? `Aspect for ${lines.length} edit(s) -> ${file}\n${lines.join('\n')}` : 'Nothing to do: every edit already has an aspect.');
    if (lines.some(l => l.includes('CHECK'))) console.log('\nCHECK = unsure. Open the edit on YouTube, then set "aspect" by hand and "aspectSource": "manual".');
  })().catch(e => { console.error('\nERROR: ' + e.message); process.exit(1); });
}
