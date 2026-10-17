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
    return { shared, agreeCount: agree.length, disagreeCount: disagree.length, pct, agree, disagree, label: tasteLabel(pct, shared), tier: tasteTier(pct, shared) };
}

// Label tiers. Under 3 shared matches a percentage is mostly luck, so no label or percent is shown. The two extremes need 5+
// shared matches ("Soul mates" at 100%, "Arch-rivals" at 0%); with 3-4 they read as Kindred spirits / Rivals instead.
// tone: 'agree' (green), 'mixed' (amber), 'differ' (pink), 'none' (neutral).
export function tasteTier(pct, shared) {
    if (!shared) return null;
    if (shared < 3) return { label: `${shared} match${shared === 1 ? '' : 'es'} in common`, tone: 'none', showPct: false };
    const strong = shared >= 5;
    if (pct === 100 && strong) return { label: 'Soul mates', tone: 'agree', showPct: true };
    if (pct >= 90) return { label: 'Kindred spirits', tone: 'agree', showPct: true };
    if (pct >= 75) return { label: 'Same wavelength', tone: 'agree', showPct: true };
    if (pct >= 60) return { label: 'Similar taste', tone: 'agree', showPct: true };
    if (pct >= 40) return { label: 'Split decision', tone: 'mixed', showPct: true };
    if (pct >= 25) return { label: 'Different tastes', tone: 'differ', showPct: true };
    if (pct === 0 && strong) return { label: 'Arch-rivals', tone: 'differ', showPct: true };
    return { label: 'Rivals', tone: 'differ', showPct: true };
}

export function tasteLabel(pct, shared) { return tasteTier(pct, shared)?.label ?? null; }

export function pickThumb(row, side) {
    const key = side === 'yours' ? row.yourChoice : row.theirChoice;
    const id = row.match?.[key]?.videoId;
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

export function pickTitle(row, side) {
    const key = side === 'yours' ? row.yourChoice : row.theirChoice;
    const t = row.match?.[key]?.title;
    return t || (side === 'yours' ? row.yourName : row.theirName) || (key === 'song1' ? 'First edit' : 'Second edit');
}
