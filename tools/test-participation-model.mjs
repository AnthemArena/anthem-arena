import assert from 'node:assert/strict';
import { buildParticipation, percent, shortStage } from '../js/participation-model.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const s = id => ({ id, shortTitle: id });
const g = (id, status, extra = {}) => ({ matchId: id, stage: 'group', roundLabel: 'Group A', round: 1, status, song1: s('a' + id), song2: s('b' + id), ...extra });
const k = (id, status, label, round) => ({ matchId: id, stage: 'knockout', roundLabel: label, round, status, song1: s('a' + id), song2: s('b' + id) });

t('empty input is safe', () => { const p = buildParticipation(); assert.equal(p.totalVotes, 0); assert.equal(p.totalPossible, 0); assert.deepEqual(p.byStage, []); assert.equal(p.current, null); });
t('only opened matches count', () => { const p = buildParticipation({ matches: [g('1', 'live'), g('2', 'live'), g('3', 'upcoming'), g('4', 'completed')], votes: [{ matchId: '1' }] }); assert.equal(p.totalPossible, 3); assert.equal(p.totalVotes, 1); assert.equal(p.overallPercentage, 33); });
t('votes on matches that are not in the list are ignored', () => { const p = buildParticipation({ matches: [g('1', 'live')], votes: [{ matchId: 'old-test-cup-1' }, { matchId: '1' }] }); assert.equal(p.totalVotes, 1); });
t('duplicate votes count once', () => { const p = buildParticipation({ matches: [g('1', 'live')], votes: [{ matchId: '1' }, { matchId: '1' }] }); assert.equal(p.totalVotes, 1); });
t('TBD slots are never counted', () => { const p = buildParticipation({ matches: [g('1', 'live'), { ...g('2', 'live'), song2: { id: 'TBD' } }] }); assert.equal(p.totalPossible, 1); });
t('group stage is one row; knockout rounds follow in order', () => {
  const p = buildParticipation({ matches: [k('k2', 'live', 'Quarterfinals', 3), g('1', 'completed'), g('2', 'completed', { roundLabel: 'Group B' }), k('k1', 'live', 'Round of 16', 2)] });
  assert.deepEqual(p.byStage.map(r => r.label), ['Group stage', 'Round of 16', 'Quarterfinals']); assert.deepEqual(p.byStage.map(r => r.short), ['Groups', 'R16', 'QF']); assert.equal(p.byStage[0].total, 2);
});
t('current stage is the first live one with votes left', () => {
  const p = buildParticipation({ matches: [g('1', 'completed'), k('k1', 'live', 'Round of 16', 2), k('k2', 'live', 'Round of 16', 2)], votes: [{ matchId: '1' }, { matchId: 'k1' }] });
  assert.equal(p.current.label, 'Round of 16'); assert.equal(p.current.total - p.current.voted, 1);
  assert.equal(buildParticipation({ matches: [g('1', 'live')], votes: [{ matchId: '1' }] }).current, null);
});
t('cup filter ignores other cups when matches carry a tournament', () => { const p = buildParticipation({ matches: [g('1', 'live', { tournament: 'a' }), g('2', 'live', { tournament: 'b' })], cupId: 'a' }); assert.equal(p.totalPossible, 1); });
t('under 1% shows a decimal', () => { assert.equal(percent(1, 384), 0.3); assert.equal(percent(0, 384), 0); assert.equal(percent(1, 6), 17); assert.equal(percent(5, 0), 0); });
t('short stage names', () => { assert.equal(shortStage('Round of 64'), 'R64'); assert.equal(shortStage('Semifinals'), 'SF'); assert.equal(shortStage('Final'), 'F'); assert.equal(shortStage('Something'), 'Something'); });
console.log(`${n} passed`);
