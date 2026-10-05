#!/usr/bin/env node
// Arcane edits importer.  Turns a list of YouTube links into data/edits.json: ONE master pool that feeds the gallery
// and every tournament (Jinx cup, other character cups, the Major...).
//
//   export YOUTUBE_API_KEY=your_key_here            (do NOT commit the key)
//   node tools/edits-import.js                      (reads data/edit-urls.txt, writes data/edits.json)
//   node tools/edits-import.js --character Jinx     (flag edits that never mention Jinx in the title, description or tags)
//   node tools/edits-import.js my-links.txt out.json --character Vi
//   node tools/edits-import.js --fixture tools/sample-api-response.json     (offline test, no API call)
//
// Input file: one link per line. Blank lines and lines starting with # are ignored. Optional tags after a pipe:
//   https://www.youtube.com/watch?v=XXXXXXXXXXX | sad, fast cuts
//
// Existing entries are MERGED: your tags, notes, shortTitle and inTournament flag are kept; stats are refreshed.
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const take = flag => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : null; };
const fixture = take('--fixture'), FOCUS = take('--character');
const inFile = args[0] || 'data/edit-urls.txt', outFile = args[1] || 'data/edits.json';
const KEY = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY_SERVER;
const MAX_SHORT_SECONDS = 180;
// Characters we try to detect (suggestions only: always review). Powder is the same character as Jinx.
const CHARACTERS = ['Jinx', 'Vi', 'Caitlyn', 'Jayce', 'Viktor', 'Silco', 'Ekko', 'Mel', 'Vander', 'Sevika', 'Heimerdinger', 'Ambessa', 'Mylo', 'Claggor', 'Singed', 'Warwick', 'Isha'];
const ALIASES = { powder: 'Jinx' };
const detect = text => { const found = new Set(); for (const c of CHARACTERS) if (new RegExp(`\\b${c}\\b`, 'i').test(text)) found.add(c); for (const [a, c] of Object.entries(ALIASES)) if (new RegExp(`\\b${a}\\b`, 'i').test(text)) found.add(c); return [...found]; };

// ---------- parse links ----------
const idFrom = s => { const m = s.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/) || s.match(/^\s*([A-Za-z0-9_-]{11})\s*$/); return m ? m[1] : null; };
const entries = [], seen = new Set(), problems = [];
fs.readFileSync(inFile, 'utf8').split(/\r?\n/).forEach((raw, n) => {
  const line = raw.trim(); if (!line || line.startsWith('#')) return;
  const [urlPart, tagPart = ''] = line.split('|');
  const id = idFrom(urlPart);
  if (!id) return problems.push(`line ${n + 1}: no YouTube video ID found: ${line.slice(0, 60)}`);
  if (seen.has(id)) return problems.push(`line ${n + 1}: duplicate link (${id}), skipped`);
  seen.add(id); entries.push({ id, tags: tagPart.split(',').map(t => t.trim()).filter(Boolean) });
});

// ---------- fetch metadata ----------
async function fetchBatch(ids) {
  if (fixture) { const all = JSON.parse(fs.readFileSync(fixture, 'utf8')).items || []; return all.filter(v => ids.includes(v.id)); }
  if (!KEY) throw new Error('No API key. Run: export YOUTUBE_API_KEY=your_key   (or use --fixture for an offline test)');
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&maxResults=50&id=${ids.join(',')}&key=${KEY}`;
  const res = await fetch(url); const body = await res.json();
  if (!res.ok) throw new Error(`YouTube API error ${res.status}: ${body.error?.message || JSON.stringify(body).slice(0, 200)}`);
  return body.items || [];
}
const seconds = iso => { const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || ''); return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : null; };
const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'edit';

(async () => {
  const meta = new Map();
  for (let i = 0; i < entries.length; i += 50) for (const v of await fetchBatch(entries.slice(i, i + 50).map(e => e.id))) meta.set(v.id, v);

  const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
  const prevById = new Map(prev.map(p => [p.videoId, p]));
  const out = [], byChannel = new Map();

  for (const e of entries) {
    const v = meta.get(e.id), old = prevById.get(e.id) || {}, flags = [];
    if (!v) { out.push({ ...old, videoId: e.id, id: e.id, status: 'blocked', flags: ['not found: deleted, private or wrong link'], lastChecked: new Date().toISOString().slice(0, 10) }); continue; }
    const sn = v.snippet || {}, st = v.status || {}, cd = v.contentDetails || {}, ss = v.statistics || {};
    const dur = seconds(cd.duration), text = `${sn.title} ${sn.description || ''} ${(sn.tags || []).join(' ')}`.toLowerCase();
    let status = 'ok';
    if (st.privacyStatus !== 'public') { flags.push(`not public (${st.privacyStatus})`); status = 'blocked'; }
    if (st.embeddable === false) { flags.push('embedding disabled: cannot be played on the site'); status = 'blocked'; }
    if (dur != null && dur > MAX_SHORT_SECONDS) { flags.push(`long: ${Math.floor(dur / 60)}m${dur % 60}s (over ${MAX_SHORT_SECONDS / 60} min)`); if (status === 'ok') status = 'review'; }
    const detected = detect(text);
    if (FOCUS && !detected.includes(FOCUS)) { flags.push(`no mention of ${FOCUS} in title, description or tags`); if (status === 'ok') status = 'review'; }
    (byChannel.get(sn.channelId) || byChannel.set(sn.channelId, []).get(sn.channelId)).push(e.id);
    const tags = [...new Set([...(old.tags || []), ...e.tags])];
    out.push({
      id: e.id, videoId: e.id, title: sn.title, shortTitle: old.shortTitle || sn.title, slug: old.slug || slugify(sn.title),
      artist: sn.channelTitle, creatorUrl: `https://www.youtube.com/channel/${sn.channelId}`, channelId: sn.channelId,
      year: Number((sn.publishedAt || '').slice(0, 4)) || null, uploadDate: (sn.publishedAt || '').slice(0, 10),
      views: Number(ss.viewCount) || 0, likes: ss.likeCount != null ? Number(ss.likeCount) : null, duration: dur,
      embedAllowed: st.embeddable !== false, characters: [...new Set([...(old.characters || []), ...detected])], tournaments: old.tournaments || [], tags, category: 'edit', seed: old.seed ?? null,
      notes: old.notes || '', status: old.status === 'removed' ? 'removed' : status, flags, lastChecked: new Date().toISOString().slice(0, 10),
    });
  }
  // one entry per creator (tournament rule): flag extras, do not drop them from the gallery
  for (const [ch, ids] of byChannel) if (ids.length > 1) for (const id of ids) { const r = out.find(o => o.videoId === id); r.flags.push(`same creator has ${ids.length} entries (one per creator in each tournament)`); if (r.status === 'ok') r.status = 'review'; }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');

  // ---------- report ----------
  const c = s => out.filter(o => o.status === s).length;
  console.log(`\nChecked ${out.length} links -> ${outFile}   ok: ${c('ok')}   review: ${c('review')}   blocked: ${c('blocked')}\n`);
  for (const o of out.filter(o => o.flags.length)) console.log(`  [${o.status.toUpperCase()}] ${o.videoId}  ${(o.title || '').slice(0, 50)}\n         ${o.flags.join('; ')}`);
  if (problems.length) console.log('\nInput problems:\n  ' + problems.join('\n  '));
  console.log('\nCharacters are auto-detected from titles and descriptions: check them. Add a tournament id to an edit\'s "tournaments" list to enter it (for example "jinx-cup-1").');
})().catch(e => { console.error('\nERROR: ' + e.message); process.exit(1); });