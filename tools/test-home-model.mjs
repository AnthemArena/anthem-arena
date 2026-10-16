import assert from 'node:assert/strict';
import { homeState, newestEdits, mostWatched, countdownText, isEntered } from '../js/home-model.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const c = (id, votes = 0) => ({ id, videoId: 'v' + id, shortTitle: `Edit ${id} #jinx`, artist: 'Maker ' + id, votes });
const m = (id, a, b, status, winner, extra = {}) => ({ matchId: id, roundLabel: 'Group A', status, winnerId: winner, song1: a, song2: b, ...extra });
const ed = (id, up, views, extra = {}) => ({ id, videoId: id, title: `Title ${id} #x`, artist: 'A', uploadDate: up, views, tournaments: ['c'], status: 'ok', ...extra });

t('no matches means "soon"', () => { const s = homeState([]); assert.equal(s.phase, 'soon'); assert.equal(s.featured, null); assert.equal(s.closesAt, null); });
t('live cup: featured is the live match with most votes', () => {
    const s = homeState([m('1', c('a', 5), c('b', 5), 'live', null), m('2', c('c', 30), c('d', 1), 'live', null), m('3', c('e', 99), c('f', 0), 'completed', 'e')]);
    assert.equal(s.phase, 'live'); assert.equal(s.featured.matchId, '2'); assert.equal(s.liveCount, 2); assert.equal(s.votes, 140);
    assert.ok(!s.featured.a.title.includes('#'));
});
t('countdown uses the earliest future close time', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const s = homeState([m('1', c('a'), c('b'), 'live', null, { endDate: '2026-10-18T20:00:00Z' }), m('2', c('c'), c('d'), 'live', null, { endDate: '2026-10-17T20:00:00Z' }), m('3', c('e'), c('f'), 'live', null, { endDate: '2026-10-10T20:00:00Z' })], now);
    assert.equal(s.closesAt, Date.parse('2026-10-17T20:00:00Z'));
});
t('drawn but not started: upcoming', () => { assert.equal(homeState([m('1', c('a'), c('b'), 'upcoming', null)]).phase, 'upcoming'); });
t('between rounds: nothing live', () => { assert.equal(homeState([m('1', c('a'), c('b'), 'completed', 'a'), m('2', c('c'), c('d'), 'upcoming', null)]).phase, 'between'); });
t('final decided: finished with a champion', () => {
    const s = homeState([m('f', c('a', 9), c('b', 3), 'completed', 'a', { roundLabel: 'Final' })]);
    assert.equal(s.phase, 'finished'); assert.equal(s.champion.id, 'a');
});
t('recent results: newest first, winner and loser', () => {
    const s = homeState([m('1', c('a', 9), c('b', 3), 'completed', 'a', { endDate: '2026-10-01T00:00:00Z' }), m('2', c('c', 2), c('d', 8), 'completed', 'd', { endDate: '2026-10-02T00:00:00Z' })]);
    assert.equal(s.recent[0].matchId, '2'); assert.equal(s.recent[0].winner.id, 'd'); assert.equal(s.recent[0].loser.id, 'c');
});
t('top voted edits', () => { const s = homeState([m('1', c('a', 9), c('b', 3), 'completed', 'a')]); assert.equal(s.topVoted[0].id, 'a'); assert.equal(homeState([m('1', c('a'), c('b'), 'upcoming', null)]).topVoted.length, 0); });
t('newest and most watched', () => {
    const e = [ed('1', '2025-01-01', 50), ed('2', '2026-05-01', 10), ed('3', '2024-01-01', 900), ed('4', '2026-09-01', 5, { tournaments: [] }), ed('5', '2026-07-01', 1, { status: 'removed' })];
    assert.deepEqual(newestEdits(e, 2).map(x => x.id), ['2', '1']);
    assert.deepEqual(mostWatched(e, 2).map(x => x.id), ['3', '1']);
    assert.ok(!newestEdits(e)[0].title.includes('#'));
});
t('isEntered mirrors the gallery rule', () => { assert.ok(isEntered(ed('1', 'x', 1))); assert.ok(!isEntered(ed('1', 'x', 1, { embedAllowed: false }))); assert.ok(!isEntered(null)); });
t('countdown text', () => { const now = 0; assert.equal(countdownText(2 * 86400e3 + 4 * 3600e3, now), '2d 4h'); assert.equal(countdownText(5 * 3600e3 + 12 * 60e3, now), '5h 12m'); assert.equal(countdownText(30e3, now), '1m'); assert.equal(countdownText(-5, now), 'closing now'); assert.equal(countdownText(null), ''); });
console.log(`${n} passed`);
