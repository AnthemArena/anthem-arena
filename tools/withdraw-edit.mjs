#!/usr/bin/env node
// The data half of replacing an edit that was removed from YouTube before its group opened.
//   node tools/withdraw-edit.mjs <removedVideoId> <replacementVideoId> [--cup jinx-cup-1] [--file data/edits.json]
// It edits data/edits.json only:
//   removed edit      status -> "removed" (the gallery hides those), takes the cup out of "tournaments", a note says why
//   replacement       takes the cup into "tournaments", a note says what it replaced
// It refuses (changing nothing) unless the removed edit is in the cup and the replacement is playable, in the same group and in no cup.
// Then it prints what to do next: deploy, and the lines for tools/admin-swap-edit.js, which makes the matching change in Firestore.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const indent = text => text.split('\n').map(l => '  ' + l).join('\n');

// Windows saves the file with CRLF line endings (and some editors add a BOM): read it as plain LF text, change it, then give the
// file its own line endings and BOM back, so the rest of the file stays exactly as it was.
export function withdrawInText(text, opts) {
    const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
    const crlf = text.includes('\r\n');
    let body = text.slice(bom.length);
    if (crlf) body = body.replace(/\r\n/g, '\n');
    let out = withdrawInLf(body, opts);
    if (crlf) out = out.replace(/\n/g, '\r\n');
    return bom + out;
}

// Returns the changed file text, or throws Error with a plain-words reason.
function withdrawInLf(text, { removed, replacement, cup = 'jinx-cup-1', today = new Date().toISOString().slice(0, 10) }) {
    const list = JSON.parse(text);
    const find = id => list.find(e => e.videoId === id);
    const oldE = find(removed), newE = find(replacement);
    if (!oldE) throw new Error(`${removed} is not in the edit data.`);
    if (!newE) throw new Error(`${replacement} is not in the edit data.`);
    if (removed === replacement) throw new Error('The removed edit and the replacement are the same.');
    if (oldE.status === 'removed') throw new Error(`${removed} is already marked removed.`);
    if (!(oldE.tournaments || []).includes(cup)) throw new Error(`${removed} is not entered in ${cup}.`);
    if (newE.status !== 'ok' || newE.embedAllowed === false) throw new Error(`${replacement} is not playable (status ${newE.status}, embedAllowed ${newE.embedAllowed}).`);
    if (String(newE.group || '').toLowerCase() !== String(oldE.group || '').toLowerCase()) throw new Error(`${replacement} is in group "${newE.group}", not "${oldE.group}".`);
    if ((newE.tournaments || []).some(t => !String(t).startsWith('group-test'))) throw new Error(`${replacement} is already entered in a cup (${newE.tournaments.join(', ')}).`);

    // change just the two edits' text, so the rest of the file stays byte for byte as it was
    const patchBlock = (src, id, mutate) => {
        const i = src.indexOf(`"videoId": ${JSON.stringify(id)}`);
        const a = src.lastIndexOf('\n  {', i) + 1, b = src.indexOf('\n  }', i) + 4;
        const original = src.slice(a, b);
        const notLaidOut = new Error('data/edits.json is not laid out the way this tool expects (2-space JSON). Edit the two entries by hand instead.');
        let obj;
        try { obj = JSON.parse(original.trim().replace(/,$/, '')); } catch { throw notLaidOut; }
        if (indent(JSON.stringify(obj, null, 2)) !== original.replace(/,$/, '')) throw notLaidOut;
        mutate(obj);
        return src.slice(0, a) + indent(JSON.stringify(obj, null, 2)) + (original.endsWith(',') ? ',' : '') + src.slice(b);
    };
    let out = patchBlock(text, removed, e => {
        e.status = 'removed';
        e.tournaments = e.tournaments.filter(t => t !== cup);
        e.notes = `Removed from YouTube by its creator (seen ${today}). Withdrawn from ${cup} before its group opened; replaced by ${replacement}.`;
    });
    out = patchBlock(out, replacement, e => {
        e.tournaments = [...(e.tournaments || []), cup];
        e.notes = `Entered in ${cup} on ${today} as the replacement for ${removed}: the next edit in the seed ranking that was in no group.`;
    });
    JSON.parse(out);
    return out;
}

function main() {
    const args = process.argv.slice(2);
    const take = f => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : null; };
    const cup = take('--cup') || 'jinx-cup-1', file = take('--file') || 'data/edits.json';
    const [removed, replacement] = args;
    if (!removed || !replacement) { console.error('Usage: node tools/withdraw-edit.mjs <removedVideoId> <replacementVideoId> [--cup ' + cup + ']'); process.exit(2); }
    const text = fs.readFileSync(file, 'utf8');
    let out;
    try { out = withdrawInText(text, { removed, replacement, cup }); }
    catch (e) { console.error('Nothing changed: ' + e.message); process.exit(1); }
    fs.writeFileSync(file, out);
    const title = JSON.parse(text.replace(/^\uFEFF/, '')).find(e => e.videoId === removed).title;
    console.log(`Updated ${file}: ${removed} is now removed and ${replacement} is in ${cup}.\n`);
    console.log('Next:\n  1. Deploy the site (npx netlify deploy --prod).\n  2. In tools/admin-swap-edit.js set:');
    console.log(`       removedVideoId: '${removed}',\n       replacementVideoId: '${replacement}',\n       expectTitleContains: ${JSON.stringify(title.slice(0, 24))},\n       dryRun: true,`);
    console.log('  3. Paste it into the admin console (signed in as admin), read the plan, then set dryRun to false and paste again.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
