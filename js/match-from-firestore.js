// When the edge function that serves /api/matches is not available (local dev without Deno, a deploy problem, Firestore throttling the
// edge), the site reads the match documents from Firestore directly and shapes them exactly as the edge function does:
// timestamps as ISO strings, the document id as `id`, and totalVotes / percentages worked out from the counters on the match document.

export function plainValue(v) {
    if (v && typeof v.toDate === 'function') return v.toDate().toISOString();        // Firestore Timestamp
    if (Array.isArray(v)) return v.map(plainValue);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plainValue(x)]));
    return v;
}

export function matchFromFirestore(id, data) {
    const match = { ...plainValue(data || {}) };
    if (!match.id) match.id = id;
    const song1Votes = Number(match.song1?.votes) || 0;
    const song2Votes = Number(match.song2?.votes) || 0;
    const totalVotes = song1Votes + song2Votes;
    const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
    const song2Percentage = totalVotes > 0 ? 100 - song1Percentage : 50;
    return {
        ...match,
        totalVotes,
        song1: { ...(match.song1 || {}), votes: song1Votes, percentage: song1Percentage },
        song2: { ...(match.song2 || {}), votes: song2Votes, percentage: song2Percentage }
    };
}
