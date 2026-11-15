#!/usr/bin/env node
// Is every edit still on YouTube? Reports only: it never changes a file or Firestore.
//   node tools/check-edits-alive.mjs                      (every edit entered in any cup)
//   node tools/check-edits-alive.mjs --cup jinx-cup-1     (one cup)
//   node tools/check-edits-alive.mjs --all                (every edit in data/edits.json, entered or not)
//   add --file data/edits.json   --json (machine-readable output)
//
// It asks YouTube's public oEmbed address about each video (no API key):
//   200  playable            404  gone (deleted, or the address never existed)
//   401  private, or the owner turned embedding off: look at it by hand
//   anything else (429, 5xx, no network): "unknown", asked again a few times first
// Run it before each group opens. Exit code 1 means at least one edit is gone.
//
// For each gone edit it also prints the replacement your seed ranking picks (the best-ranked edit of the same
// group that is in no cup AND that YouTube still has: it checks) and the two lines to put in tools/admin-swap-edit.js.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { seedEntries } from '../js/group-builder.js';

export const oembedUrl = videoId => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;

export function classify(status) {
    if (status === 200) return 'ok';
    if (status === 404) return 'gone';
    if (status === 401 || status === 403) return 'restricted';
    return 'unknown';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Asks about one video; retries 429, 5xx and network errors (pauseMs apart) before giving up as 'unknown'.
export async function checkVideo(videoId, { fetchImpl = globalThis.fetch, retries = 3, pauseMs = 1500 } = {}) {
    let last = 'unknown', detail = '';
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetchImpl(oembedUrl(videoId), { headers: { 'User-Agent': 'arcane-moments-edit-check' } });
            const result = classify(res.status);
            if (result !== 'unknown') return { videoId, result, status: res.status };
            last = 'unknown'; detail = `HTTP ${res.status}`;
        } catch (e) { last = 'unknown'; detail = String(e.message || e); }
        if (attempt < retries) await sleep(pauseMs * (attempt + 1));
    }
    return { videoId, result: last, status: null, detail };
}

// Checks the list with a few requests at a time. Calls onProgress(done, total) as it goes.
export async function checkEdits(edits, { concurrency = 4, onProgress = () => {}, ...opts } = {}) {
    const results = new Array(edits.length);
    let next = 0, done = 0;
    const worker = async () => {
        while (next < edits.length) {
            const i = next++;
            results[i] = { edit: edits[i], ...(await checkVideo(edits[i].videoId, opts)) };
            onProgress(++done, edits.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, edits.length) }, worker));
    return results;
}

const playable = e => e.status === 'ok' && e.embedAllowed !== false;
const inAnyCup = e => Array.isArray(e.tournaments) && e.tournaments.some(t => !String(t).startsWith('group-test'));

// The replacement the seed ranking picks for a gone edit: rank every playable edit of its group (the ones in the cup plus the
// spares, without the gone one and without anything also found gone) and take the best-ranked one that is in no cup.
export function replacementCandidates(edits, goneEdit, goneIds = new Set()) {
    const group = String(goneEdit.group || '').toLowerCase();
    const pool = edits.filter(e => playable(e) && String(e.group || '').toLowerCase() === group && !goneIds.has(e.videoId));
    return seedEntries(pool).filter(r => !inAnyCup(r.entry)).map(r => r.entry);
}
export function suggestReplacement(edits, goneEdit, goneIds = new Set()) { return replacementCandidates(edits, goneEdit, goneIds)[0] || null; }

// Walks the candidates in seed order and returns the first one YouTube still has, plus the ones skipped because they are gone too.
// Candidates already handed to another gone edit (taken) are passed over.
export async function pickLiveReplacement(candidates, taken, checkOpts = {}) {
    const skipped = [];
    for (const c of candidates) {
        if (taken.has(c.videoId)) continue;
        const r = await checkVideo(c.videoId, checkOpts);
        if (r.result === 'ok') { taken.add(c.videoId); return { rep: c, skipped }; }
        skipped.push({ edit: c, result: r.result });
    }
    return { rep: null, skipped };
}

export function formatReport(results, edits, suggestions = null) {
    const by = k => results.filter(r => r.result === k);
    const gone = by('gone'), restricted = by('restricted'), unknown = by('unknown');
    const goneIds = new Set(gone.map(r => r.edit.videoId));
    const used = new Set();
    const lines = [`Checked ${results.length} edit(s): ${by('ok').length} playable, ${gone.length} gone, ${restricted.length} private or embedding off, ${unknown.length} unknown.`];
    const label = e => `${e.videoId}  "${String(e.shortTitle || e.title).slice(0, 60)}" by ${e.artist || '?'}  [${(e.tournaments || []).join(', ') || 'no cup'}]`;
    if (gone.length) {
        lines.push('', 'GONE (deleted, or no such video):');
        for (const r of gone) {
            lines.push(`  ${label(r.edit)}`);
            const inCup = (r.edit.tournaments || []).filter(t => !String(t).startsWith('group-test'));
            if (inCup.length) {
                const pre = suggestions && suggestions.get(r.edit.videoId);
                const rep = pre ? pre.rep : suggestReplacement(edits.filter(e => !used.has(e.videoId)), r.edit, goneIds);
                for (const k of (pre ? pre.skipped : [])) lines.push(`    (skipped ${k.edit.videoId}: it is ${k.result === 'gone' ? 'gone too' : k.result})`);
                if (rep) {
                    used.add(rep.videoId);
                    lines.push(`    swap in: ${rep.videoId}  "${String(rep.shortTitle || rep.title).slice(0, 50)}" by ${rep.artist || '?'}`,
                        `    tools/admin-swap-edit.js -> removedVideoId: '${r.edit.videoId}', replacementVideoId: '${rep.videoId}', expectTitleContains: ${JSON.stringify(String(r.edit.shortTitle || r.edit.title).slice(0, 24))}`);
                } else lines.push('    no spare edit of this group is left to swap in.');
            }
        }
    }
    if (restricted.length) { lines.push('', 'PRIVATE OR EMBEDDING OFF (open each on YouTube to see which):'); restricted.forEach(r => lines.push(`  ${label(r.edit)}`)); }
    if (unknown.length) { lines.push('', 'COULD NOT TELL (network or rate limit; run again):'); unknown.forEach(r => lines.push(`  ${label(r.edit)}  ${r.detail || ''}`)); }
    if (!gone.length && !restricted.length && !unknown.length) lines.push('Nothing to do.');
    return lines.join('\n');
}

async function main() {
    const args = process.argv.slice(2);
    const take = f => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : null; };
    const flag = f => { const i = args.indexOf(f); if (i >= 0) { args.splice(i, 1); return true; } return false; };
    const cup = take('--cup'), file = take('--file') || 'data/edits.json', all = flag('--all'), asJson = flag('--json');
    const edits = JSON.parse(fs.readFileSync(file, 'utf8'));
    let list = edits.filter(e => e.status !== 'removed' && e.status !== 'blocked');
    if (cup) list = list.filter(e => (e.tournaments || []).includes(cup));
    else if (!all) list = list.filter(inAnyCup);
    if (!list.length) { console.error('No edits to check.'); process.exit(2); }
    console.error(`Checking ${list.length} edit(s)...`);
    const results = await checkEdits(list, { onProgress: (d, t) => { if (d % 25 === 0 || d === t) console.error(`  ${d}/${t}`); } });
    const goneIds = new Set(results.filter(r => r.result === 'gone').map(r => r.edit.videoId)), taken = new Set(), suggestions = new Map();
    for (const r of results.filter(r => r.result === 'gone' && inAnyCup(r.edit))) {
        suggestions.set(r.edit.videoId, await pickLiveReplacement(replacementCandidates(edits, r.edit, goneIds), taken));
    }
    if (asJson) console.log(JSON.stringify(results.map(r => ({ videoId: r.videoId, title: r.edit.title, result: r.result, status: r.status })), null, 2));
    else console.log(formatReport(results, edits, suggestions));
    process.exit(results.some(r => r.result === 'gone') ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
