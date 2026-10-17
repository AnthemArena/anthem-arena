// "Taste match": how often two people picked the same edit in the matches they both voted in.
// Pure (no Firebase): profile-page.js hands it the two vote lists it already loads.

// votes: [{ matchId, choice: 'song1'|'song2', match?: { song1:{title}, song2:{title} }, votedForName? }]
export function compareVotes(mine = [], theirs = []) {
    const mineBy = new Map();
    for (const v of mine) if (v && v.matchId && (v.choice === 'song1' || v.choice === 'song2')) mineBy.set(v.matchId, v);
    const agree = [], disagree = [];
    const seen = new Set();
    for (const t of theirs) {
        if (!t || !t.matchId || seen.has(t.matchId)) continue;
        const m = mineBy.get(t.matchId);
        if (!m || (t.choice !== 'song1' && t.choice !== 'song2')) continue;
        seen.add(t.matchId);
        const row = { matchId: t.matchId, yourChoice: m.choice, theirChoice: t.choice, match: t.match || m.match || null, yourName: m.votedForName || null, theirName: t.votedForName || null, timestamp: Number(t.timestamp || m.timestamp || 0) };
        (m.choice === t.choice ? agree : disagree).push(row);
    }
    const byNewest = (a, b) => b.timestamp - a.timestamp;
    agree.sort(byNewest); disagree.sort(byNewest);
    const shared = agree.length + disagree.length;
    const pct = shared ? Math.round((agree.length / shared) * 100) : null;
    return { shared, agreeCount: agree.length, disagreeCount: disagree.length, pct, agree, disagree, label: tasteLabel(pct, shared) };
}

// Few shared matches say little, so the label stays neutral until there are at least 3.
export function tasteLabel(pct, shared) {
    if (!shared) return null;
    if (shared < 3) return 'Just getting started';
    if (pct >= 80) return 'Kindred spirits';
    if (pct >= 60) return 'Similar taste';
    if (pct >= 40) return 'Mixed opinions';
    return 'Natural rivals';
}

export function pickTitle(row, side) {
    const key = side === 'yours' ? row.yourChoice : row.theirChoice;
    const t = row.match?.[key]?.title;
    return t || (side === 'yours' ? row.yourName : row.theirName) || (key === 'song1' ? 'First edit' : 'Second edit');
}
