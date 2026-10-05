// ========================================
// EDITS TOURNAMENT BUILDER (admin page)
// ========================================
// Replaces the legacy music builder (init-firebase.js).
//   1. loads data/edits.json
//   2. takes the edits whose "tournaments" list contains the cup id
//   3. checks them, draws the bracket from a published seed, builds size - 1 matches
//   4. writes tournaments/<cupId> and tournaments/<cupId>/matches/* in ONE atomic batch
// The cup id is the active tournament id from arcane-config.js. To build a different cup, change it there
// (and in the two edge functions) first, as the plan describes: tournaments run one at a time.

import { db } from './firebase-config.js';
import { ARCANE_CONFIG } from './arcane-config.js';
import {
    collection, doc, getDoc, getDocs, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
    selectEntries, buildMatches, buildTournamentDoc, makeDrawSeed, cupDisplayName, describePairings
} from './bracket-builder.js';

// Bracket size is not configured anywhere: it is the number of edits entered in the cup (2, 4, 8, 16, 32, 64 or 128).

async function loadEdits() {
    const response = await fetch('/data/edits.json', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Could not load data/edits.json (${response.status}). Run the importer and commit the file first.`);
    }
    // The site has a catch-all redirect (/* -> /index.html, status 200), so a missing file comes back as the
    // homepage HTML with status 200. Read as text so we can say what actually went wrong.
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            'data/edits.json came back as a web page, not JSON. The file is almost certainly not deployed yet: ' +
            'run `node tools/edits-import.js --character Jinx`, commit data/edits.json, and make sure the site has redeployed. Nothing was changed.'
        );
    }
}

function assertCupIsActive(cupId) {
    if (cupId !== ARCANE_CONFIG.tournamentId) {
        throw new Error(
            `Blocked: asked to build "${cupId}" but the active tournament is "${ARCANE_CONFIG.tournamentId}". ` +
            `Set tournamentId in js/arcane-config.js (and the two edge functions) first. Nothing was changed.`
        );
    }
}

// The draw seed saved with the cup, so a reset can rebuild the SAME draw instead of reshuffling.
export async function getStoredDrawSeed(cupId = ARCANE_CONFIG.tournamentId) {
    const snap = await getDoc(doc(db, 'tournaments', cupId));
    return snap.exists() ? (snap.data().drawSeed || null) : null;
}

// Seed AND size of the cup as it was first built. A reset passes both, so it rebuilds the same draw
// and refuses (rather than reshuffling into a different-sized bracket) if the entry list has changed.
export async function getStoredDraw(cupId = ARCANE_CONFIG.tournamentId) {
    const snap = await getDoc(doc(db, 'tournaments', cupId));
    if (!snap.exists()) return { drawSeed: null, size: null };
    const t = snap.data();
    return { drawSeed: t.drawSeed || null, size: t.bracketSize || null };
}

// Builds everything in memory and returns it. Writes nothing.
export async function previewEditsTournament({
    cupId = ARCANE_CONFIG.tournamentId,
    size = null,            // null = as many edits as are entered in the cup
    drawSeed = null,
    batchSize = 4
} = {}) {
    assertCupIsActive(cupId);

    const edits = await loadEdits();
    const selected = selectEntries(edits, cupId, size);
    const { entries, errors } = selected;
    if (errors.length) {
        throw new Error(`Cannot build ${cupId}:\n\n- ${errors.join('\n- ')}`);
    }
    size = selected.size;

    const seed = drawSeed || makeDrawSeed(cupId);
    const cupName = cupDisplayName(cupId);
    const matches = buildMatches({ cupId, cupName, entries, drawSeed: seed, batchSize });
    const tournament = buildTournamentDoc({ cupId, cupName, size, drawSeed: seed, entries });

    return { cupId, cupName, size, drawSeed: seed, tournament, matches, pairings: describePairings(matches) };
}

// Writes a previewed bracket. Refuses if the cup already has matches (use the admin Reset to clear them first).
export async function writeEditsTournament(built) {
    assertCupIsActive(built.cupId);

    const matchesRef = collection(db, `tournaments/${built.cupId}/matches`);
    const existing = await getDocs(matchesRef);
    if (!existing.empty) {
        throw new Error(
            `${built.cupId} already has ${existing.size} matches. Nothing was changed. ` +
            `Use "Reset & Regenerate" if you really mean to rebuild it.`
        );
    }

    const batch = writeBatch(db);   // up to 500 writes, all-or-nothing: no half-built bracket
    batch.set(doc(db, 'tournaments', built.cupId), built.tournament);
    for (const match of built.matches) {
        batch.set(doc(matchesRef, match.matchId), match);
    }
    await batch.commit();

    console.log(`✅ ${built.cupName}: ${built.matches.length} matches written. Draw seed: ${built.drawSeed}`);
    return built;
}

export async function initializeEditsTournament(options = {}) {
    return writeEditsTournament(await previewEditsTournament(options));
}
