// localVoteCount (js/rank-system.js): the vote count other people see in a profile tooltip.   node tools/test-profile-votes.mjs
import assert from 'node:assert/strict';
import { localVoteCount, countLiveVotes } from '../js/rank-system.js';
const store = o => ({ getItem: k => (k in o ? o[k] : null) });
let pass = 0;
const t = (n, f) => { f(); console.log(`  ok   ${n}`); pass++; };
t('stats lagging behind (0) but 3 saved votes: 3', () => assert.equal(localVoteCount(store({ stats: JSON.stringify({ level: 1, votes: 0 }), userVotes: JSON.stringify({ a: {}, b: {}, c: {} }) })), 3));
t('stats ahead of the saved votes: the larger one', () => assert.equal(localVoteCount(store({ stats: JSON.stringify({ votes: 7 }), userVotes: JSON.stringify({ a: {} }) })), 7));
t('nothing saved: 0', () => assert.equal(localVoteCount(store({})), 0));
t('broken JSON never throws', () => assert.equal(localVoteCount(store({ stats: '{oops', userVotes: 'nope' })), 0));
t('votes from a deleted match are not counted (3 saved, 1 old = 2)', () => assert.equal(countLiveVotes([{ matchId: 'a' }, { matchId: 'b' }, { matchId: 'old' }], [{ matchId: 'a' }, { id: 'b' }]), 2));
t('match list unavailable: count everything', () => assert.equal(countLiveVotes([{ matchId: 'a' }, { matchId: 'old' }], []), 2));
console.log(`${pass} passed`);
