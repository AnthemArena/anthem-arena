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

export const DEFAULT_BRACKET_SIZE = 16;

async function loadEdits() {
    const response = await fetch('/data/edits.json', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Could not load data/edits.json (${response.status}). Run the importer and commit the file first.`);
    }
    return response.json();
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

// Builds everything in memory and returns it. Writes nothing.
export async function previewEditsTournament({
    cupId = ARCANE_CONFIG.tournamentId,
    size = DEFAULT_BRACKET_SIZE,
    drawSeed = null,
    batchSize = 4
} = {}) {
    assertCupIsActive(cupId);

    const edits = await loadEdits();
    const { entries, errors } = selectEntries(edits, cupId, size);
    if (errors.length) {
        throw new Error(`Cannot build ${cupId}:\n\n- ${errors.join('\n- ')}`);
    }

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
