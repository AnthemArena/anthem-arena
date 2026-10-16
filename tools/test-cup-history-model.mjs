import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCupHistory, renderCupHistory } from '../js/cup-history-model.js';
import { ARCANE_CONFIG } from '../js/arcane-config.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const m = (id, status, winner, extra = {}) => ({ matchId: id, roundLabel: 'Group A', status, winnerId: winner, song1: { id: 'a', shortTitle: 'Alpha #jinx' }, song2: { id: 'b', shortTitle: 'Beta #jinx' }, ...extra });
const cups = [{ id: 'c1', name: 'Cup 1', status: 'complete', startDate: '2026-10-01' }, { id: 'c2', name: 'Cup 2', status: 'active', startDate: '2026-11-01' }];
const v = (matchId, tournament, choice, ts = 1) => ({ matchId, tournament, choice, timestamp: ts });
const matchesByCup = { c1: [m('x1', 'completed', 'a'), m('x2', 'completed', 'b'), m('x3', 'upcoming', null)], c2: [m('y1', 'live', null), m('y2', 'upcoming', null)] };

t('empty and null input are safe', () => { assert.deepEqual(buildCupHistory().cups, []); assert.equal(buildCupHistory({ votes: null, cups: null }).lifetime.totalVotes, 0); });
t('test cups not in cups.json are ignored', () => { const h = buildCupHistory({ votes: [v('t1', 'group-test-01', 'song1')], cups, matchesByCup }); assert.equal(h.lifetime.totalVotes, 0); assert.equal(h.cups.length, 0); });
t('counts votes and participation per cup', () => { const h = buildCupHistory({ votes: [v('x1', 'c1', 'song1'), v('x2', 'c1', 'song1')], cups, matchesByCup }); assert.equal(h.cups[0].votes, 2); assert.equal(h.cups[0].participation, 67); });
t('pick accuracy counts finished matches only', () => { const h = buildCupHistory({ votes: [v('x1', 'c1', 'song1'), v('x2', 'c1', 'song1'), v('x3', 'c1', 'song2')], cups, matchesByCup }); const r = h.cups[0]; assert.equal(r.decided, 2); assert.equal(r.correct, 1); assert.equal(r.accuracy, 50); assert.equal(r.picks.find(p => p.matchId === 'x3').result, 'pending'); });
t('choice may be an edit id', () => { const h = buildCupHistory({ votes: [v('x1', 'c1', 'a')], cups, matchesByCup }); assert.equal(h.cups[0].correct, 1); });
t('duplicate votes on a match count once', () => { const h = buildCupHistory({ votes: [v('x1', 'c1', 'song1'), v('x1', 'c1', 'song1')], cups, matchesByCup }); assert.equal(h.cups[0].votes, 1); });
t('several cups: newest first, lifetime adds up', () => { const h = buildCupHistory({ votes: [v('x1', 'c1', 'song1'), v('y1', 'c2', 'song1')], cups, matchesByCup }); assert.deepEqual(h.cups.map(r => r.id), ['c2', 'c1']); assert.equal(h.lifetime.totalVotes, 2); assert.equal(h.lifetime.cupsEntered, 2); assert.equal(h.lifetime.avgParticipation, Math.round((50 + 33) / 2)); });
t('a cup whose matches failed to load still shows votes', () => { const h = buildCupHistory({ votes: [v('x1', 'c1', 'song1')], cups, matchesByCup: {} }); assert.equal(h.cups[0].votes, 1); assert.equal(h.cups[0].participation, null); assert.equal(h.lifetime.avgParticipation, null); });
t('cleaned titles in picks', () => { const h = buildCupHistory({ votes: [v('x1', 'c1', 'song1')], cups, matchesByCup }); assert.equal(h.cups[0].picks[0].title, 'Alpha'); });
t('TBD slots do not inflate the match total', () => { const mm = { c1: [m('x1', 'completed', 'a'), m('k1', 'upcoming', null, { song2: { id: 'TBD' } })] }; assert.equal(buildCupHistory({ votes: [v('x1', 'c1', 'song1')], cups, matchesByCup: mm }).cups[0].totalMatches, 1); });
t('the active cup is listed in data/cups.json', () => { const f = JSON.parse(fs.readFileSync(new URL('../data/cups.json', import.meta.url))); assert.ok(f.cups.some(c => c.id === ARCANE_CONFIG.tournamentId), 'add the active cup to data/cups.json'); });
t('html: shows cups, lifetime and escapes names', () => { const h = buildCupHistory({ votes: [v('x1', 'c1', 'song1')], cups: [{ ...cups[0], name: 'A <b>Cup</b>' }], matchesByCup }); const html = renderCupHistory(h); assert.ok(html.includes('Cup History')); assert.ok(html.includes('A &lt;b&gt;Cup&lt;/b&gt;')); assert.ok(!html.includes('<b>Cup')); assert.ok(html.includes('Votes cast')); assert.ok(html.includes('ch-won')); });
t('html: empty history explains itself', () => { assert.ok(renderCupHistory(buildCupHistory()).includes('No cup history yet')); });
console.log(`${n} passed`);
