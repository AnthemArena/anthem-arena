import { mixFeed, digestSummary, rankTrending, findPostById, RUN_MIN } from '../js/feed-mix-model.js';
let pass = 0, fail = 0;
const t = (n, ok) => { console.log(`  ${ok ? 'ok ' : 'FAIL'} ${n}`); ok ? pass++ : fail++; };
const vote = (i, u = 'u' + i) => ({ type: 'vote', postId: 'v' + i, username: u, timestamp: 1000 - i });
const post = (i, ts) => ({ type: 'text', postId: 'p' + i, username: 'w', timestamp: ts });

let r = mixFeed({ votes: [vote(1), vote(2), vote(3)], posts: [] });
t(`runs under ${RUN_MIN} stay individual`, r.length === 3 && r.every(x => x.type === 'vote'));
r = mixFeed({ votes: [1, 2, 3, 4, 5].map(i => vote(i)), posts: [] });
t('a run of 5 becomes one digest', r.length === 1 && r[0].type === 'vote-digest' && r[0].count === 5);
t('digest keeps newest timestamp and the votes', r[0].timestamp === 999 && r[0].votes.length === 5);
r = mixFeed({ votes: [1, 2, 3, 4, 5, 6].map(i => vote(i)), posts: [post(1, 997.5)] });
t('a post splits runs: 2 votes, post, 4 votes', r.map(x => x.type).join() === 'vote,vote,text,vote-digest');
const flood = Array.from({ length: 500 }, (_, i) => vote(i));
r = mixFeed({ votes: flood, posts: [post(1, 0), post(2, -5)] });
t('posts are never dropped by a flood of votes', r.filter(x => x.type === 'text').length === 2);
t('votes are capped', r.reduce((n, x) => n + (x.count || (x.type === 'vote' ? 1 : 0)), 0) === 100);
r = mixFeed({ votes: flood, posts: [post(1, 5), { type: 'vote', postId: 'old', timestamp: 3 }], mode: 'posts' });
t('posts mode: written posts only', r.length === 1 && r[0].postId === 'p1');
r = mixFeed({ votes: [vote(1), vote(2)], posts: [post(1, 5)], mode: 'votes' });
t('votes mode: votes only, no digests', r.length === 2 && r.every(x => x.type === 'vote'));
t('old vote-type social posts are ignored', mixFeed({ posts: [{ type: 'vote', postId: 'x', timestamp: 1 }] }).length === 0);
t('summary: names', digestSummary({ names: ['A', 'B', 'C', 'D'], count: 9 }) === 'A, B and 2 others cast 9 votes');
t('summary: two names', digestSummary({ names: ['A', 'B'], count: 4 }) === 'A and B cast 4 votes');
t('summary: one name', digestSummary({ names: ['A'], count: 4 }) === 'A cast 4 votes');
const NOW = 1e12, D = 24 * 3600e3;
const tp = (id, likes, comments, ageDays, type = 'text') => ({ postId: id, type, likeCount: likes, commentCount: comments, timestamp: NOW - ageDays * D });
r = rankTrending({ posts: [tp('a', 1, 0, 1), tp('b', 0, 2, 2), tp('c', 5, 0, 8), tp('d', 0, 0, 0), tp('e', 2, 0, 3, 'vote')], now: NOW });
t('trending: window, engagement, score order (comment = 2 likes)', r.map(x => x.postId).join() === 'b,e,a');
t('trending: ties go to the newer', rankTrending({ posts: [tp('x', 2, 0, 3), tp('y', 2, 0, 1)], now: NOW }).map(x => x.postId).join() === 'y,x');
t('trending: includes vote posts', r.some(x => x.type === 'vote'));
{
    const posts = mixFeed({ votes: [1, 2, 3, 4, 5].map(i => ({ ...vote(i), userId: 'voter' + i })), posts: [post(1, 5000)] });
    t('findPostById finds a top-level post', findPostById(posts, 'p1')?.postId === 'p1');
    t('findPostById finds a vote inside a digest (its owner is the voter)', findPostById(posts, 'v3')?.userId === 'voter3');
    t('findPostById: unknown id and empty list give null', findPostById(posts, 'nope') === null && findPostById(null, 'x') === null);
}
console.log(`${pass} passed${fail ? `, ${fail} FAILED` : ''}`); process.exit(fail ? 1 : 0);
