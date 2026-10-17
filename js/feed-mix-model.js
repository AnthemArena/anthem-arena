// Pure model for how the feed is mixed. Automatic "voted for ..." posts (type 'vote') are one per vote, so with traffic they
// would bury what people actually write. Rules:
//  - people's own posts are never dropped or truncated because of votes
//  - runs of RUN_MIN or more votes in a row collapse into one expandable digest row
//  - 'posts' mode = written posts only, 'votes' mode = votes only
export const RUN_MIN = 4;
const isVote = p => p && p.type === 'vote';

export function mixFeed({ votes = [], posts = [], mode = 'all', maxVotes = 100, maxPosts = 100 } = {}) {
    const byNewest = (a, b) => (b.timestamp || 0) - (a.timestamp || 0);
    const v = votes.slice().sort(byNewest).slice(0, maxVotes);
    const p = posts.filter(x => !isVote(x)).slice().sort(byNewest).slice(0, maxPosts);

    if (mode === 'posts') return p;
    if (mode === 'votes') return v;

    const merged = [...v, ...p].sort(byNewest);
    const out = [];
    let run = [];
    const flush = () => {
        if (run.length >= RUN_MIN) out.push(makeDigest(run));
        else out.push(...run);
        run = [];
    };
    for (const item of merged) {
        if (isVote(item)) run.push(item);
        else { flush(); out.push(item); }
    }
    flush();
    return out;
}

export function makeDigest(run) {
    const names = [];
    for (const x of run) if (x.username && !names.includes(x.username)) names.push(x.username);
    return {
        type: 'vote-digest',
        postId: `digest-${run[0].postId}`,
        timestamp: run[0].timestamp || 0,
        oldest: run[run.length - 1].timestamp || 0,
        count: run.length,
        names,
        votes: run
    };
}

export function digestSummary(d) {
    const shown = d.names.slice(0, 2);
    const more = d.names.length - shown.length;
    const who = more > 0 ? `${shown.join(', ')} and ${more} ${more === 1 ? 'other' : 'others'}` : shown.join(' and ');
    return `${who} cast ${d.count} votes`;
}

// Trending: likes + 2 x comments, only items from the last `windowMs` (default 7 days) with some engagement; ties go to the newer one.
export function rankTrending({ posts = [], now = Date.now(), windowMs = 7 * 24 * 3600 * 1000 } = {}) {
    const score = p => (p.likeCount || 0) + (p.commentCount || 0) * 2;
    return posts
        .filter(p => score(p) > 0 && now - (p.timestamp || 0) <= windowMs)
        .sort((a, b) => score(b) - score(a) || (b.timestamp || 0) - (a.timestamp || 0));
}

// A post by id, including the vote posts tucked inside a collapsed "X cast N votes" digest (they are not top-level items).
export function findPostById(posts, postId) {
    for (const p of posts || []) {
        if (p.postId === postId) return p;
        if (p.type === 'vote-digest') {
            const v = (p.votes || []).find(x => x.postId === postId);
            if (v) return v;
        }
    }
    return null;
}
