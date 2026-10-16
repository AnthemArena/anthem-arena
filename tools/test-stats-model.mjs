import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeStats, sortRows } from '../js/stats-model.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const c = (id, votes = 0) => ({ id, shortTitle: `Edit ${id} #jinx`, artist: `Maker ${id}`, videoId: `v${id}`, votes, drawPosition: 1 });
const m = (id, a, b, status, winner, extra = {}) => ({ matchId: id, stage: 'group', group: 'A', groupIndex: 1, roundLabel: 'Group A', round: 1, status, winnerId: winner, totalVotes: a.votes + b.votes, song1: a, song2: b, ...extra });
const ms = [m('m1', c('a', 30), c('b', 10), 'completed', 'a'), m('m2', c('c', 5), c('d', 5), 'completed', 'c'), m('m3', c('a', 20), c('c', 21), 'live', null), m('m4', c('b'), c('d'), 'upcoming', null)];

t('empty input is safe', () => { const s = computeStats(null); assert.equal(s.totalVotes, 0); assert.equal(s.records.closest, null); assert.deepEqual(s.rows, []); });
t('counts matches and votes', () => { const s = computeStats(ms); assert.equal(s.totalMatches, 4); assert.equal(s.completed, 2); assert.equal(s.live, 1); assert.equal(s.upcoming, 1); assert.equal(s.totalVotes, 91); assert.equal(s.editCount, 4); });
t('edit rows add votes and records', () => { const s = computeStats(ms); const a = s.rows.find(r => r.id === 'a'); assert.equal(a.votes, 50); assert.equal(a.wins, 1); assert.equal(a.played, 1); assert.equal(a.record, '1-0'); assert.equal(Math.round(a.share), 62); });
t('hashtags are cleaned from names', () => { assert.ok(!computeStats(ms).rows[0].title.includes('#')); });
t('records pick the right matches', () => { const r = computeStats(ms).records; assert.equal(r.mostVotedMatch.matchId, 'm3'); assert.equal(r.closest.matchId, 'm2'); assert.equal(r.blowout.matchId, 'm1'); assert.equal(r.mostVotedEdit.id, 'a'); });
t('TBD slots are ignored', () => { const s = computeStats([m('k', c('a', 4), { id: 'TBD', shortTitle: 'TBD' }, 'upcoming', null, { stage: 'knockout' })]); assert.equal(s.editCount, 1); });
t('winnerId may be "song1" (old matches)', () => { const s = computeStats([m('o', c('a', 3), c('b', 1), 'completed', 'song1')]); assert.equal(s.rows.find(r => r.id === 'a').wins, 1); });
t('rounds and groups are reported', () => { const s = computeStats(ms); assert.equal(s.rounds[0].label, 'Group A'); assert.equal(s.rounds[0].completed, 2); assert.equal(s.groupCount, 1); assert.equal(s.groupsComplete, 0); });
t('sorting', () => { const s = computeStats(ms); assert.equal(sortRows(s.rows, 'votes')[0].id, 'a'); assert.equal(sortRows(s.rows, 'share')[0].id, 'a'); assert.equal(sortRows(s.rows, 'nope')[0].id, 'a'); });
t('real fixture runs', () => { const f = '/tmp/bracket-fixtures/groups-mid-16.json'; if (!fs.existsSync(f)) return; const s = computeStats(JSON.parse(fs.readFileSync(f))); assert.equal(s.editCount, 16); assert.equal(s.groupCount, 4); });
console.log(`${n} passed`);
