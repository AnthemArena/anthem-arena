// ========================================
// GROUP STAGE BUILDER (pure logic, no Firebase)
// ========================================
// A cup with a group stage: edits are drawn into groups of 4, everyone in a group plays everyone else (6 head-to-heads),
// the top 2 of each group go into a normal single-elimination knockout.
//
// Runs in the browser (admin page) and in Node (tools/group-preview.mjs, tools/test-group-builder.mjs), so keep this file free of
// DOM / Firebase calls. It builds on js/bracket-builder.js.
//
// HOW IT FITS THE EXISTING CODE (one cup, two stages, no changes to how matches open, close and advance):
//   - The group stage is ROUND 1. Every group match is an ordinary two-edit match (song1 / song2), so voting, the live page,
//     closing a match (admin deciding vote on a tie) and "Open Batch" / "Close Batch" all work as they do now.
//     batch = group (or several groups together, see groupsPerBatch), so "Open Batch" opens one group at a time.
//   - The knockout is rounds 2, 3, ... (round 1 is never 0: several pages treat a falsy round as 1).
//     Its matches use the usual sourceMatch links, so advancing winners is unchanged.
//   - Matches carry stage: 'group' | 'knockout'. The tournament doc has format 'groups-knockout'.
//
// RULES (decided 11 Oct 2026):
//   - groups of 4; top 2 qualify; entries must be 8, 16, 32, 64, 128 or 256 (groups = a power of two, so the 2 x groups
//     qualifiers make a power-of-two knockout)
//   - seeded draw: edits are ranked, split into 4 pots, and each group gets one edit from each pot (drawn with the published
//     draw seed), so the strongest edits cannot knock each other out in the groups
//   - several edits by one creator are allowed; they are only listed in notes
//   - standings: wins, then share of the votes in the group, then total votes, then draw position (see groupStandings)
import {
    checkEntered, drawEntries, toCompetitor, matchIdFor, roundLabel, PLACEHOLDER
} from './bracket-builder.js';

export const GROUP_SIZE = 4;
export const QUALIFY_PER_GROUP = 2;
export const GROUP_STAGE_SIZES = [8, 16, 32, 64, 128, 256];
const MAX_SIZE = GROUP_STAGE_SIZES[GROUP_STAGE_SIZES.length - 1];

export const isValidGroupStageSize = n => GROUP_STAGE_SIZES.includes(n);
export const groupCountFor = size => size / GROUP_SIZE;
export const qualifierCountFor = size => groupCountFor(size) * QUALIFY_PER_GROUP;
// The knockout rounds plus the group stage (round 1).
export const totalRoundsFor = size => 1 + Math.log2(qualifierCountFor(size));

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 0 -> A, 25 -> Z, 26 -> AA, 63 -> BL (64 groups need more than 26 letters)
export function groupName(index) {
    let n = index, name = '';
    do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return name;
}

function sizeAdvice(count) {
    if (count === 0) return 'No edits are entered yet.';
    if (count > MAX_SIZE) return `That is more than the ${MAX_SIZE} maximum: remove ${count - MAX_SIZE}.`;
    const up = GROUP_STAGE_SIZES.find(s => s > count);
    const down = [...GROUP_STAGE_SIZES].reverse().find(s => s < count);
    const parts = [];
    if (up) parts.push(`add ${up - count} to reach ${up}`);
    if (down) parts.push(`remove ${count - down} to drop to ${down}`);
    return parts.length ? `You can ${parts.join(', or ')}.` : '';
}

// Same shape as selectEntries() in bracket-builder.js: { entries, errors, notes, size }.
export function selectGroupEntries(edits, cupId, size = null) {
    const errors = [];
    const entered = (edits || []).filter(e => Array.isArray(e.tournaments) && e.tournaments.includes(cupId));
    const auto = size == null, target = auto ? entered.length : size;
    const sizeOk = isValidGroupStageSize(target);

    if (!sizeOk) {
        errors.push(auto
            ? `${cupId} has ${entered.length} edits entered. A group-stage cup needs exactly ${GROUP_STAGE_SIZES.join(', ')}. ${sizeAdvice(entered.length)}`
            : `Group-stage size must be one of ${GROUP_STAGE_SIZES.join(', ')}. Got ${size}.`);
    }
    const checked = checkEntered(entered);
    errors.push(...checked.errors);
    if (sizeOk && !auto && entered.length !== size) {
        errors.push(`The ${cupId} entry list has ${entered.length} edits but the cup needs exactly ${size}. ` +
            `Add or remove "${cupId}" in the "tournaments" list of edits in data/edits.json.`);
    }
    return { entries: entered, errors, notes: checked.notes, size: sizeOk ? target : null };
}

// ----------------------------------------
// SEEDING
// ----------------------------------------
// Rank by views and by likes, average the two ranks, break ties by views then video id. Views and likes track each other
// closely, so likes mostly nudge close calls. Some creators hide their like count: for those, likes are estimated as
// views x the median likes-per-view of the edits that show it (flagged likesEstimated).
// Returns [{ entry, seedRank, viewsRank, likesRank, likesEstimated }] best seed first.
export function seedEntries(entries) {
    const rates = entries.filter(e => e.likes != null && e.views > 0).map(e => e.likes / e.views).sort((a, b) => a - b);
    const medianRate = rates.length ? rates[Math.floor(rates.length / 2)] : 0;
    const info = entries.map(entry => {
        const hidden = entry.likes == null;
        return { entry, views: entry.views || 0, likes: hidden ? Math.round((entry.views || 0) * medianRate) : entry.likes, likesEstimated: hidden };
    });
    const rank = (key) => {
        const order = [...info].sort((a, b) => b[key] - a[key] || b.views - a.views || cmp(a.entry.videoId, b.entry.videoId));
        return new Map(order.map((x, i) => [x.entry.videoId, i + 1]));
    };
    const viewsRank = rank('views'), likesRank = rank('likes');
    const rows = info.map(x => ({
        entry: x.entry, viewsRank: viewsRank.get(x.entry.videoId), likesRank: likesRank.get(x.entry.videoId),
        likesEstimated: x.likesEstimated
    }));
    rows.sort((a, b) => (a.viewsRank + a.likesRank) - (b.viewsRank + b.likesRank) || a.viewsRank - b.viewsRank
        || cmp(a.entry.videoId, b.entry.videoId));
    rows.forEach((r, i) => { r.seedRank = i + 1; });
    return rows;
}

// ----------------------------------------
// DRAW
// ----------------------------------------
// Pot 1 = the best `groups` seeds, pot 2 the next `groups`, and so on. Each pot is shuffled with the draw seed and dealt
// one edit per group. Anyone can re-run it with the published seed and the seeding snapshot saved in the tournament doc.
// Returns [{ name, index, slots: [{ entry, seedRank, pot, drawPosition }] }] with slots in pot order.
export function drawGroups(entries, drawSeed) {
    if (!drawSeed) throw new Error('A draw seed is required.');
    if (!isValidGroupStageSize(entries.length)) {
        throw new Error(`Cannot draw ${entries.length} edits into groups. Sizes: ${GROUP_STAGE_SIZES.join(', ')}.`);
    }
    const G = groupCountFor(entries.length);
    const seeded = seedEntries(entries), byId = new Map(seeded.map(s => [s.entry.videoId, s]));
    const groups = Array.from({ length: G }, (_, i) => ({ name: groupName(i), index: i + 1, slots: [] }));

    for (let pot = 0; pot < GROUP_SIZE; pot++) {
        const potEntries = seeded.slice(pot * G, (pot + 1) * G).map(s => s.entry);
        drawEntries(potEntries, `${drawSeed}|pot${pot + 1}`).forEach((entry, g) => {
            groups[g].slots.push({ entry, seedRank: byId.get(entry.videoId).seedRank, pot: pot + 1, drawPosition: pot * G + g + 1 });
        });
    }
    return groups;
}

// Information only: groups where one creator has two or more edits.
export function groupNotes(groups) {
    const notes = [];
    for (const g of groups) {
        const by = new Map();
        for (const s of g.slots) {
            const key = s.entry.channelId || (s.entry.artist ? `name:${s.entry.artist.toLowerCase()}` : null);
            if (key) (by.get(key) || by.set(key, []).get(key)).push(s.entry);
        }
        for (const list of by.values()) if (list.length > 1) notes.push(`Group ${g.name}: "${list[0].artist}" has ${list.length} edits in this group.`);
    }
    return notes;
}

// ----------------------------------------
// GROUP MATCHES
// ----------------------------------------
// Positions in a group are pot 1..4 (0..3). Three matchdays; everyone plays once per matchday.
const FIXTURES = [
    [1, [0, 3], [1, 2]],
    [2, [0, 2], [3, 1]],
    [3, [0, 1], [2, 3]]
];

// groupsPerBatch = how many groups open together in one admin batch (default 1: "Open Batch" opens one group).
export function buildGroupStage({ cupId, cupName, entries, drawSeed, groupsPerBatch = 1 }) {
    const groups = drawGroups(entries, drawSeed);
    const competitor = s => ({ ...toCompetitor(s.entry, s.drawPosition), seed: s.seedRank, pot: s.pot });
    const matches = [];
    let matchNumber = 0;

    for (const g of groups) {
        let inGroup = 0;
        for (const [matchday, ...pairs] of FIXTURES) {
            for (const [a, b] of pairs) {
                inGroup++; matchNumber++;
                matches.push({
                    matchId: `${cupId}-group-${g.name}-match-${inGroup}`,
                    tournament: cupId,
                    tournamentName: cupName,
                    stage: 'group',
                    group: g.name,
                    groupIndex: g.index,
                    matchday,
                    round: 1,                                   // the group stage is round 1 (never 0, see the header)
                    roundLabel: `Group ${g.name}`,
                    matchNumber,
                    batch: Math.floor((g.index - 1) / groupsPerBatch) + 1,
                    status: 'upcoming',
                    totalVotes: 0,
                    winnerId: null,
                    song1: { ...competitor(g.slots[a]), group: g.name },
                    song2: { ...competitor(g.slots[b]), group: g.name }
                });
            }
        }
    }
    const seeding = seedEntries(entries).map(s => ({
        videoId: s.entry.videoId, views: s.entry.views || 0, likes: s.entry.likes ?? null,
        likesEstimated: s.likesEstimated, seedRank: s.seedRank
    }));
    return { groups, matches, seeding, notes: groupNotes(groups) };
}

export function buildGroupTournamentDoc({ cupId, cupName, size, drawSeed, entries, seeding, groupsPerBatch = 1 }) {
    const groups = groupCountFor(size), qualifiers = qualifierCountFor(size);
    return {
        id: cupId,
        name: cupName,
        status: 'active',
        format: 'groups-knockout',
        stage: 'group',                                        // becomes 'knockout' when the knockout is built
        bracketSize: size,
        totalRounds: totalRoundsFor(size),                      // the group stage counts as round 1
        totalMatches: groups * 6 + (qualifiers - 1),
        totalCompetitors: size,
        groupStage: { groups, groupSize: GROUP_SIZE, qualifyPerGroup: QUALIFY_PER_GROUP, qualifiers, groupsPerBatch, matches: groups * 6, knockoutBuilt: false },
        drawSeed,
        drawMethod: 'Edits ranked by the average of their views rank and likes rank, split into 4 pots by rank; each pot shuffled with a seeded PRNG ' +
            '(xmur3 + mulberry32, seed = draw seed + "|pot" + number, entries sorted by video id first) and dealt one per group. ' +
            'The seeding snapshot below is the views and likes used. Re-run tools/group-preview.mjs with this seed to check the draw.',
        seeding,
        entryVideoIds: entries.map(e => e.videoId).sort(),
        description: `${cupName}: ${size} edits in ${groups} groups of ${GROUP_SIZE}. The top ${QUALIFY_PER_GROUP} of each group go into a ${qualifiers}-edit knockout. Ties in a match are decided by the admin's vote.`,
        createdAt: new Date().toISOString()
    };
}

// ----------------------------------------
// STANDINGS
// ----------------------------------------
// groupMatches = the match documents of ONE group. Only completed matches count.
// Rank: 1) wins  2) share of the votes in the group (votes for / votes for + against)  3) total votes for
//       4) draw position (a fixed, published last resort, so the table is never left undecided).
// unresolvedTie is true when places 2 and 3, the qualification line, are level on all of 1-3: the admin may want to look.
export function groupStandings(groupMatches) {
    const rows = new Map();
    const row = song => {
        if (!rows.has(song.id)) {
            rows.set(song.id, { id: song.id, title: song.shortTitle || song.title, artist: song.artist || '', played: 0, wins: 0, losses: 0,
                votesFor: 0, votesAgainst: 0, share: 0, drawPosition: song.drawPosition ?? 0, seed: song.seed ?? null, competitor: song });
        }
        return rows.get(song.id);
    };
    let completed = 0;
    for (const m of groupMatches) {
        const a = row(m.song1), b = row(m.song2);
        if (m.status !== 'completed' || !m.winnerId) continue;
        completed++;
        const v1 = m.song1.votes || 0, v2 = m.song2.votes || 0;
        a.played++; b.played++;
        a.votesFor += v1; a.votesAgainst += v2; b.votesFor += v2; b.votesAgainst += v1;
        const [w, l] = m.winnerId === m.song1.id ? [a, b] : [b, a];
        w.wins++; l.losses++;
    }
    const list = [...rows.values()];
    for (const r of list) r.share = r.votesFor + r.votesAgainst ? r.votesFor / (r.votesFor + r.votesAgainst) : 0;
    const level = (x, y) => x === y || Math.abs(x - y) < 1e-9;
    list.sort((a, b) => b.wins - a.wins || (level(a.share, b.share) ? 0 : b.share - a.share) || b.votesFor - a.votesFor
        || a.drawPosition - b.drawPosition);
    list.forEach((r, i) => { r.rank = i + 1; });
    const [, p2, p3] = list;
    const unresolvedTie = completed === groupMatches.length && !!p2 && !!p3
        && p2.wins === p3.wins && level(p2.share, p3.share) && p2.votesFor === p3.votesFor;
    return { rows: list, complete: groupMatches.length > 0 && completed === groupMatches.length, unresolvedTie };
}

// All group matches of a cup -> [{ name, index, rows, complete, unresolvedTie }] in group order.
export function allGroupStandings(matches) {
    const by = new Map();
    for (const m of matches.filter(m => m.stage === 'group')) {
        if (!by.has(m.group)) by.set(m.group, { name: m.group, index: m.groupIndex, matches: [] });
        by.get(m.group).matches.push(m);
    }
    return [...by.values()].sort((a, b) => a.index - b.index)
        .map(g => ({ name: g.name, index: g.index, ...groupStandings(g.matches) }));
}

// ----------------------------------------
// KNOCKOUT FROM THE GROUPS
// ----------------------------------------
// Group winners meet runners-up of ANOTHER group, never their own group. Groups are paired (A+B, C+D, ...):
//   A1 v B2  and  B1 v A2.
// Round 1 of the knockout lists every "odd group winner v even group runner-up" match first, then every "even group winner v
// odd group runner-up" match, so two edits from the same group pair cannot meet again before the final of their half.
export function knockoutPairs(standings) {
    if (standings.length < 2 || standings.length % 2) throw new Error('The knockout needs an even number of groups.');
    const c = (g, place) => {
        const r = g.rows[place - 1];
        return { ...r.competitor, votes: 0, sourceMatch: undefined, fromGroup: g.name, groupRank: place };
    };
    const top = [], bottom = [];
    for (let p = 0; p < standings.length; p += 2) {
        const odd = standings[p], even = standings[p + 1];
        top.push([c(odd, 1), c(even, 2)]);
        bottom.push([c(even, 1), c(odd, 2)]);
    }
    return [...top, ...bottom];
}

// Knockout match documents (rounds firstRound, firstRound + 1, ...), same shape as buildMatches() in bracket-builder.js:
// later rounds are filled by sourceMatch links (advanceWinnerToNextRound in admin.js).
export function buildKnockoutMatches({ cupId, cupName, pairs, totalRounds, firstRound = 2, batchSize = 4 }) {
    const n = pairs.length;
    if (!(n >= 1 && (n & (n - 1)) === 0)) throw new Error(`The knockout needs a power-of-two number of matches in its first round. Got ${n}.`);
    const rounds = Math.log2(n) + 1;
    if (totalRounds !== firstRound - 1 + rounds) throw new Error(`totalRounds is ${totalRounds} but a ${n * 2}-edit knockout starting at round ${firstRound} ends at round ${firstRound - 1 + rounds}.`);
    const matches = [];
    const base = (round, matchNumber) => ({
        matchId: matchIdFor(cupId, round, matchNumber, totalRounds),
        tournament: cupId,
        tournamentName: cupName,
        stage: 'knockout',
        round,
        roundLabel: roundLabel(round, totalRounds),
        matchNumber,
        batch: Math.floor((matchNumber - 1) / batchSize) + 1,
        status: 'upcoming',
        totalVotes: 0,
        winnerId: null
    });
    pairs.forEach(([a, b], i) => matches.push({ ...base(firstRound, i + 1), song1: a, song2: b }));
    for (let r = firstRound + 1; r < firstRound + rounds; r++) {
        const count = n / Math.pow(2, r - firstRound);
        for (let m = 1; m <= count; m++) {
            matches.push({
                ...base(r, m),
                song1: { ...PLACEHOLDER, votes: 0, sourceMatch: matchIdFor(cupId, r - 1, 2 * m - 1, totalRounds) },
                song2: { ...PLACEHOLDER, votes: 0, sourceMatch: matchIdFor(cupId, r - 1, 2 * m, totalRounds) }
            });
        }
    }
    return matches;
}

// Human-readable tables for the preview tool and the admin confirm box.
export function describeGroups(groups) {
    return groups.map(g => `Group ${g.name}: ` + g.slots.map(s => `${String(s.entry.shortTitle || s.entry.title).slice(0, 34)} (seed ${s.seedRank})`).join('  |  '));
}

// ----------------------------------------
// PLANS (what the admin page writes; pure, so they are tested without Firebase)
// ----------------------------------------
// Re-applies the views and likes saved in the tournament doc, so a Reset rebuilds the SAME draw even though views have moved on.
export function applySeedingSnapshot(entries, seeding) {
    const byId = new Map((seeding || []).map(s => [s.videoId, s]));
    const missing = entries.filter(e => !byId.has(e.videoId));
    if (missing.length) throw new Error(`The saved seeding does not cover ${missing.length} entered edit(s) (${missing.slice(0, 3).map(e => e.videoId).join(', ')}). The entry list has changed since the cup was built; nothing was changed.`);
    return entries.map(e => ({ ...e, views: byId.get(e.videoId).views, likes: byId.get(e.videoId).likes }));
}

// Everything needed to write a new group-stage cup. `entries` are already checked (selectGroupEntries).
// `seedingSnapshot` (optional) is the saved `seeding` of an existing cup, used by a Reset.
export function planGroupBuild({ cupId, cupName, entries, drawSeed, seedingSnapshot = null, groupsPerBatch = 1 }) {
    if (!(Number.isInteger(groupsPerBatch) && groupsPerBatch >= 1)) throw new Error('Groups per batch must be a whole number, 1 or more.');
    const size = entries.length;
    const seeded = seedingSnapshot ? applySeedingSnapshot(entries, seedingSnapshot) : entries;
    const built = buildGroupStage({ cupId, cupName, entries: seeded, drawSeed, groupsPerBatch });
    const tournament = buildGroupTournamentDoc({ cupId, cupName, size, drawSeed, entries, seeding: built.seeding, groupsPerBatch });
    return { cupId, cupName, size, drawSeed, tournament, matches: built.matches, groups: built.groups, notes: built.notes, lines: describeGroups(built.groups) };
}

// What "Build knockout from group results" would do, or why it cannot yet. Returns { error } or the plan.
//   tournament = the tournaments/{cup} document, matches = every match document of the cup.
export function planKnockoutBuild({ tournament, matches, batchSize = 4 }) {
    if (!tournament || tournament.format !== 'groups-knockout') return { error: 'This cup is not a group-stage cup, so there is no knockout to build.' };
    const gs = tournament.groupStage || {};
    if (gs.knockoutBuilt || matches.some(m => m.stage === 'knockout')) return { error: 'The knockout has already been built for this cup. Nothing was changed.' };
    const groupMatches = matches.filter(m => m.stage === 'group');
    if (groupMatches.length !== gs.matches) return { error: `Expected ${gs.matches} group matches but found ${groupMatches.length}. Check the cup before building the knockout.` };

    const standings = allGroupStandings(matches);
    const open = standings.filter(g => !g.complete);
    if (open.length) {
        const done = g => groupMatches.filter(m => m.group === g.name && m.status === 'completed').length;
        return { error: `${open.length} group(s) are not finished: ${open.slice(0, 8).map(g => `${g.name} (${done(g)} of 6 matches closed)`).join(', ')}${open.length > 8 ? ', ...' : ''}. Close every group match first.` };
    }
    if (standings.length !== gs.groups) return { error: `Expected ${gs.groups} groups but found ${standings.length}.` };

    const pairs = knockoutPairs(standings);
    const knockoutMatches = buildKnockoutMatches({ cupId: tournament.id, cupName: tournament.name, pairs, totalRounds: tournament.totalRounds, batchSize });
    const qualifiedVideoIds = pairs.flat().map(c => c.videoId || c.id);
    if (qualifiedVideoIds.length !== gs.qualifiers) return { error: `Expected ${gs.qualifiers} qualifiers but found ${qualifiedVideoIds.length}.` };

    const warnings = standings.filter(g => g.unresolvedTie).map(g => {
        const [p2, p3] = [g.rows[1], g.rows[2]];
        return `Group ${g.name}: places 2 and 3 are level on wins, vote share and votes. "${p2.title}" goes through ahead of "${p3.title}" on draw position.`;
    });
    const first = knockoutMatches.filter(m => m.round === 2);
    return {
        standings, warnings, pairs, knockoutMatches, qualifiedVideoIds,
        tournamentUpdate: { stage: 'knockout', 'groupStage.knockoutBuilt': true, 'groupStage.qualifiedVideoIds': qualifiedVideoIds, knockoutBuiltAt: new Date().toISOString() },
        lines: first.map(m => `${m.matchNumber}. ${m.song1.fromGroup}${m.song1.groupRank} ${m.song1.shortTitle}  vs  ${m.song2.fromGroup}${m.song2.groupRank} ${m.song2.shortTitle}`),
        firstRoundLabel: first[0].roundLabel
    };
}

// ----------------------------------------
// WHAT A CUP LOOKS LIKE (for the brackets page; worked out from the match documents alone, no extra Firestore read)
// ----------------------------------------
// Single elimination: rounds = the highest round, entries = 2 x round-1 matches (as the page always did).
// Group stage + knockout: groups = how many groups there are, entries = 4 x groups, qualifiers = 2 x groups, and the round count
// includes the group stage as round 1 even BEFORE the knockout exists, so round names are right from day one.
export function describeCup(matches) {
    const cupName = matches.find(m => m.tournamentName)?.tournamentName || 'Tournament';
    const groupMatches = matches.filter(m => m.stage === 'group');
    if (!groupMatches.length) {
        return {
            format: 'single-elimination', isGroupCup: false, cupName,
            totalRounds: Math.max(...matches.map(m => m.round)),
            entries: matches.filter(m => m.round === 1).length * 2
        };
    }
    const groups = new Set(groupMatches.map(m => m.group)).size;
    const qualifiers = groups * QUALIFY_PER_GROUP;
    const knockoutRounds = Math.max(1, Math.ceil(Math.log2(qualifiers)));
    return {
        format: 'groups-knockout', isGroupCup: true, cupName,
        groups, entries: groups * GROUP_SIZE, qualifiers, knockoutRounds, firstKnockoutRound: 2,
        totalRounds: 1 + knockoutRounds,
        knockoutBuilt: matches.some(m => m.stage === 'knockout')
    };
}
