// Writes match fixtures for the brackets page browser test:  node tools/test-support/bracket-fixtures.mjs <outdir>
// Uses the REAL builders and the REAL edits in data/edits.json, so the page is exercised with realistic titles and thumbnails.
import fs from 'node:fs';
import path from 'node:path';
import { buildMatches } from '../../js/bracket-builder.js';
import { planGroupBuild, planKnockoutBuild } from '../../js/group-builder.js';

const out = process.argv[2] || '/tmp/bracket-fixtures';
fs.mkdirSync(out, { recursive: true });
const CUP = 'jinx-cup-1', NAME = 'Jinx Cup 1';
const real = JSON.parse(fs.readFileSync(new URL('../../data/edits.json', import.meta.url), 'utf8')).filter(e => e.status === 'ok');
// a pool of N entries: the real edits first, then clones with new ids (so a 128 cup has 128 distinct entries)
const pool = n => Array.from({ length: n }, (_, i) => {
    const e = real[i % real.length], k = Math.floor(i / real.length);
    return k === 0 ? { ...e } : { ...e, videoId: `${e.videoId.slice(0, 8)}${String(i).padStart(3, '0')}`, id: `${e.videoId.slice(0, 8)}${String(i).padStart(3, '0')}`, title: `${e.title} (copy ${k})`, shortTitle: `${e.shortTitle || e.title} (copy ${k})` };
});
const withVotes = (m, v1, v2) => ({ ...m, totalVotes: v1 + v2, song1: { ...m.song1, votes: v1 }, song2: { ...m.song2, votes: v2 } });
const finish = (m, k = 0) => { const a = m.song1.seed < m.song2.seed, hi = 140 + (k * 37) % 90, lo = 40 + (k * 53) % 80; return { ...withVotes(m, a ? hi : lo, a ? lo : hi), status: 'completed', winnerId: a ? m.song1.id : m.song2.id }; };
const write = (name, matches) => fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(matches));

// 16 edits mid-way: A, B finished; C live; D partly closed (2 matches); the rest upcoming
const p16 = planGroupBuild({ cupId: CUP, cupName: NAME, entries: pool(16), drawSeed: 'fx' });
write('groups-mid-16', p16.matches.map((m, i) => {
    if (m.group === 'A' || m.group === 'B') return finish(m, i);
    if (m.group === 'C') return { ...withVotes(m, 12 + i % 9, 7 + (i * 3) % 11), status: 'live' };
    if (m.group === 'D' && m.matchday === 1) return finish(m, i);
    return m;
}));

// nothing started
write('groups-upcoming-16', p16.matches);

// groups all finished, knockout not built yet
write('groups-done-16', p16.matches.map(finish));

// knockout built, first quarter-final live
const done16 = p16.matches.map((m, i) => finish(m, i));
const k16 = planKnockoutBuild({ tournament: p16.tournament, matches: done16 }).knockoutMatches;
write('knockout-live-16', [...done16, ...k16.map((m, i) => m.round === 2 && i < 2 ? { ...withVotes(m, 20 + i, 9), status: 'live' } : m)]);

// 128 edits: 32 groups, a few finished, a few live
const p128 = planGroupBuild({ cupId: CUP, cupName: NAME, entries: pool(128), drawSeed: 'fx' });
write('groups-mid-128', p128.matches.map((m, i) => {
    if (m.groupIndex <= 6) return finish(m, i);
    if (m.groupIndex <= 9) return { ...withVotes(m, 5 + i % 17, 3 + i % 13), status: 'live' };
    return m;
}));

// plain single elimination (16 edits), a few matches finished: the page must look exactly as before
const se = buildMatches({ cupId: CUP, cupName: NAME, entries: pool(16), drawSeed: 'fx' });
write('single-16', se.map((m, i) => m.round === 1 && i < 4 ? { ...finish(m, i), status: 'completed' } : m.round === 1 && i < 6 ? { ...withVotes(m, 14, 9), status: 'live' } : m));
console.log('fixtures written to', out);
