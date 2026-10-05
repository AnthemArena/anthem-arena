// ========================================
// BRACKET BUILDER (pure logic, no Firebase)
// ========================================
// Turns the edits in data/edits.json into the match documents for one cup.
// Runs in the browser (admin page) and in Node (tools/bracket-preview.mjs, tools/test-bracket-builder.mjs),
// so keep this file free of imports and DOM / Firebase calls.
//
// Rules it enforces (see the plan):
//   - bracket size is a power of two (8, 16, 32, 64)
//   - every entry is a public, embeddable edit that has been checked (status "ok")
//   - one entry per creator
//   - random draw, reproducible from a published draw seed
//   - match ids carry the cup id, so votes from one cup can never collide with another
//     (votes are stored as {matchId}_{userId})

export const PLACEHOLDER = {
    id: 'TBD',
    seed: null,
    shortTitle: 'TBD',
    title: 'To Be Determined',
    artist: 'Pending',
    videoId: 'dQw4w9WgXcQ',   // same placeholder the old builder used; brackets.js checks id === 'TBD'
    year: null,
    slug: 'tbd'
};

export function isPowerOfTwo(n) {
    return Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0;
}

export function roundsForSize(size) {
    return Math.log2(size);
}

// "jinx-cup-1" -> "Jinx Cup 1"
export function cupDisplayName(cupId) {
    return String(cupId).split('-').filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ----------------------------------------
// ENTRY SELECTION + CHECKS
// ----------------------------------------
// An edit enters a cup when its "tournaments" list contains the cup id (the importer's last line says the same).
// Anything that is entered but not usable is reported as an error, never silently skipped,
// because you chose to enter it on purpose.
export function selectEntries(edits, cupId, size) {
    const errors = [];
    const entered = (edits || []).filter(e => Array.isArray(e.tournaments) && e.tournaments.includes(cupId));

    if (!isPowerOfTwo(size)) {
        errors.push(`Bracket size must be a power of two (8, 16, 32, 64). Got ${size}.`);
    }

    const label = e => `${e.shortTitle || e.title || e.videoId || '(no title)'} [${e.videoId || 'no id'}]`;

    for (const e of entered) {
        if (!e.videoId) errors.push(`${label(e)}: no videoId.`);
        if (!e.title) errors.push(`${label(e)}: no title.`);
        if (e.status !== 'ok') {
            const why = (e.flags && e.flags.length) ? ` (${e.flags.join('; ')})` : '';
            errors.push(`${label(e)}: status is "${e.status}", not "ok"${why}. Check it, then set status to "ok" in data/edits.json.`);
        }
        if (e.embedAllowed === false) errors.push(`${label(e)}: embedding is disabled, it cannot be played on the site.`);
    }

    const seenVideo = new Map();
    const seenCreator = new Map();
    for (const e of entered) {
        if (seenVideo.has(e.videoId)) errors.push(`${label(e)}: listed twice.`);
        seenVideo.set(e.videoId, true);

        const creatorKey = e.channelId || (e.artist ? `name:${e.artist.toLowerCase()}` : null);
        if (creatorKey) {
            if (seenCreator.has(creatorKey)) {
                errors.push(`One entry per creator: "${e.artist}" has ${label(seenCreator.get(creatorKey))} and ${label(e)}.`);
            } else {
                seenCreator.set(creatorKey, e);
            }
        }
    }

    if (isPowerOfTwo(size) && entered.length !== size) {
        errors.push(`The ${cupId} entry list has ${entered.length} edits but the bracket needs exactly ${size}. ` +
            `Add or remove "${cupId}" in the "tournaments" list of edits in data/edits.json.`);
    }

    return { entries: entered, errors };
}

// ----------------------------------------
// SEEDED RANDOM DRAW
// ----------------------------------------
// Anyone can re-run this with the published draw seed and the same entries to check the draw.
function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}

function mulberry32(a) {
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function makeDrawSeed(cupId) {
    const rand = Math.floor(Math.random() * 0xffffffff).toString(36);
    return `${cupId}-${new Date().toISOString().slice(0, 10)}-${rand}`;
}

// Entries are sorted by videoId BEFORE shuffling, so the draw depends only on the seed and the set of entries,
// not on the order they happen to sit in edits.json.
export function drawEntries(entries, drawSeed) {
    if (!drawSeed) throw new Error('A draw seed is required.');
    const list = [...entries].sort((a, b) => a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : 0);
    const rand = mulberry32(xmur3(String(drawSeed))());
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

// ----------------------------------------
// MATCH GENERATION
// ----------------------------------------
function toCompetitor(edit, drawPosition) {
    return {
        id: edit.id || edit.videoId,
        seed: null,                       // no seeding: the draw is random (see drawPosition)
        drawPosition,                     // 1-based slot in the draw, for auditing
        shortTitle: edit.shortTitle || edit.title,
        title: edit.title,
        artist: edit.artist || '',        // creator name (the cards show "artist • year")
        creatorUrl: edit.creatorUrl || null,
        channelId: edit.channelId || null,
        videoId: edit.videoId,
        year: edit.year || null,
        slug: edit.slug || edit.videoId,
        votes: 0
    };
}

export function matchIdFor(cupId, round, matchNumber, totalRounds) {
    return round === totalRounds ? `${cupId}-finals` : `${cupId}-round-${round}-match-${matchNumber}`;
}

export function roundLabel(round, totalRounds) {
    const fromEnd = totalRounds - round;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semi-finals';
    if (fromEnd === 2) return 'Quarter-finals';
    return `Round ${round}`;
}

// Returns every match document for the cup (size - 1 of them), in round order.
//   batchSize = how many matches open together in one batch (the admin opens and closes by round + batch)
export function buildMatches({ cupId, cupName, entries, drawSeed, batchSize = 4 }) {
    const size = entries.length;
    if (!isPowerOfTwo(size)) throw new Error(`Cannot build a bracket of ${size}.`);

    const drawn = drawEntries(entries, drawSeed);
    const totalRounds = roundsForSize(size);
    const matches = [];

    const base = (round, matchNumber) => ({
        matchId: matchIdFor(cupId, round, matchNumber, totalRounds),
        tournament: cupId,
        tournamentName: cupName,
        round,
        roundLabel: roundLabel(round, totalRounds),
        matchNumber,
        batch: Math.floor((matchNumber - 1) / batchSize) + 1,
        status: 'upcoming',
        totalVotes: 0,
        winnerId: null
    });

    // Round 1: slots 1+2, 3+4, ...
    for (let m = 1; m <= size / 2; m++) {
        const a = (m - 1) * 2, b = a + 1;
        matches.push({
            ...base(1, m),
            song1: toCompetitor(drawn[a], a + 1),
            song2: toCompetitor(drawn[b], b + 1)
        });
    }

    // Later rounds: match j is fed by matches 2j-1 and 2j of the round before.
    // advanceWinnerToNextRound() in admin.js fills each slot by matching "sourceMatch".
    for (let round = 2; round <= totalRounds; round++) {
        const count = size / Math.pow(2, round);
        for (let m = 1; m <= count; m++) {
            matches.push({
                ...base(round, m),
                song1: { ...PLACEHOLDER, votes: 0, sourceMatch: matchIdFor(cupId, round - 1, 2 * m - 1, totalRounds) },
                song2: { ...PLACEHOLDER, votes: 0, sourceMatch: matchIdFor(cupId, round - 1, 2 * m, totalRounds) }
            });
        }
    }

    return matches;
}

export function buildTournamentDoc({ cupId, cupName, size, drawSeed, entries }) {
    const totalRounds = roundsForSize(size);
    return {
        id: cupId,
        name: cupName,
        status: 'active',
        format: 'single-elimination',
        bracketSize: size,
        totalRounds,
        totalMatches: size - 1,
        totalCompetitors: size,
        drawSeed,
        drawMethod: 'Entries sorted by video id, then shuffled with a seeded PRNG (xmur3 + mulberry32). Re-run tools/bracket-preview.mjs with this seed to check the draw.',
        entryVideoIds: entries.map(e => e.videoId).sort(),
        description: `${cupName}: a ${size}-edit knockout. Ties are decided by the admin's vote.`,
        createdAt: new Date().toISOString()
    };
}

// Human-readable round 1 pairings, for the confirm box and the CLI preview.
export function describePairings(matches) {
    return matches.filter(m => m.round === 1)
        .map(m => `${m.matchNumber}. ${m.song1.shortTitle} (${m.song1.artist})  vs  ${m.song2.shortTitle} (${m.song2.artist})`);
}
