// Pure model for sharing a feed post: what link, what text, and the links for the share targets.
const trunc = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const enc = encodeURIComponent;

export function buildShare(post, origin) {
    const base = String(origin || '').replace(/\/$/, '');
    const who = post.username || 'Someone';
    let url, text;
    if (post.type === 'vote' && post.matchId) {
        // a vote post shares the match itself, so whoever opens it can vote
        url = `${base}/vote?match=${enc(post.matchId)}`;
        text = `${who} chose ${post.votedMomentName || 'a moment'} over ${post.opponentMomentName || 'another'} in Arcane Moments. Who gets your vote?`;
    } else {
        url = `${base}/feed.html?post=${enc(post.postId)}`;
        const body = trunc(post.text || post.content, 120);
        text = body ? `${who} on Arcane Moments: “${body}”` : `A post by ${who} on Arcane Moments`;
    }
    return {
        url, text, title: 'Arcane Moments',
        copyText: `${text} ${url}`,
        targets: {
            x: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
            reddit: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(trunc(text, 280))}`,
            whatsapp: `https://wa.me/?text=${enc(text + ' ' + url)}`
        }
    };
}

// Which post a feed link points at: ?post=<id>, or the older #post-<id>
export function postIdFromLink(search = '', hash = '') {
    const q = new URLSearchParams(search).get('post');
    if (q) return q;
    const m = /^#post-(.+)$/.exec(hash || '');
    return m ? decodeURIComponent(m[1]) : null;
}
