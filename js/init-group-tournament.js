// ========================================
// GROUP-STAGE TOURNAMENT BUILDER (admin page)
// ========================================
// Thin Firestore glue around js/group-builder.js (all the decisions live there and are tested offline).
//   1. previewGroupTournament / writeGroupTournament: draw the groups and write tournaments/<cup> plus every group match
//      in ONE atomic batch (a 256-edit cup is 384 matches + 1 doc, inside the 500-write limit).
//   2. previewKnockoutBuild / writeKnockoutBuild: once every group match is closed, build the knockout from the results.
// Same rules as init-edits-tournament.js: only the active cup can be built, and nothing is overwritten.

import { db } from './firebase-config.js';
import { ARCANE_CONFIG } from './arcane-config.js';
import { collection, doc, getDoc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { makeDrawSeed, cupDisplayName } from './bracket-builder.js';
import { selectGroupEntries, planGroupBuild, planKnockoutBuild } from './group-builder.js';
import { loadEdits, assertCupIsActive } from './init-edits-tournament.js';

export async function getTournamentDoc(cupId = ARCANE_CONFIG.tournamentId) {
    const snap = await getDoc(doc(db, 'tournaments', cupId));
    return snap.exists() ? snap.data() : null;
}

// What a Reset needs to rebuild the SAME draw: seed, size, the views/likes the seeding used, and the batch setting.
export async function getStoredGroupDraw(cupId = ARCANE_CONFIG.tournamentId) {
    const t = await getTournamentDoc(cupId);
    if (!t || t.format !== 'groups-knockout') return null;
    return { drawSeed: t.drawSeed || null, size: t.bracketSize || null, seeding: t.seeding || null, groupsPerBatch: t.groupStage?.groupsPerBatch || 1 };
}

// Builds everything in memory and returns it. Writes nothing.
export async function previewGroupTournament({
    cupId = ARCANE_CONFIG.tournamentId, drawSeed = null, groupsPerBatch = 1, stored = null
} = {}) {
    assertCupIsActive(cupId);
    const edits = await loadEdits();
    const selected = selectGroupEntries(edits, cupId, stored?.size ?? null);
    if (selected.errors.length) throw new Error(`Cannot build ${cupId}:\n\n- ${selected.errors.join('\n- ')}`);
    (selected.notes || []).forEach(n => console.info(`Note: ${n}`));

    const seed = drawSeed || stored?.drawSeed || makeDrawSeed(cupId);
    return planGroupBuild({
        cupId, cupName: cupDisplayName(cupId), entries: selected.entries, drawSeed: seed,
        seedingSnapshot: stored?.seeding || null, groupsPerBatch: stored?.groupsPerBatch || groupsPerBatch
    });
}

// Writes a previewed group stage. Refuses if the cup already has matches (the admin Reset clears them first).
export async function writeGroupTournament(built) {
    assertCupIsActive(built.cupId);
    const matchesRef = collection(db, `tournaments/${built.cupId}/matches`);
    const existing = await getDocs(matchesRef);
    if (!existing.empty) {
        throw new Error(`${built.cupId} already has ${existing.size} matches. Nothing was changed. Use "Reset & Regenerate" if you really mean to rebuild it.`);
    }
    const batch = writeBatch(db);   // all-or-nothing: no half-built cup
    batch.set(doc(db, 'tournaments', built.cupId), built.tournament);
    for (const match of built.matches) batch.set(doc(matchesRef, match.matchId), match);
    await batch.commit();
    console.log(`✅ ${built.cupName}: ${built.matches.length} group matches written. Draw seed: ${built.drawSeed}`);
    return built;
}

// Reads the cup and says what the knockout would be (or why it cannot be built yet). Writes nothing.
export async function previewKnockoutBuild({ cupId = ARCANE_CONFIG.tournamentId, batchSize = 4 } = {}) {
    assertCupIsActive(cupId);
    const tournament = await getTournamentDoc(cupId);
    const snap = await getDocs(collection(db, `tournaments/${cupId}/matches`));
    const matches = snap.docs.map(d => d.data());
    const plan = planKnockoutBuild({ tournament, matches, batchSize });
    if (plan.error) throw new Error(plan.error);
    return { cupId, tournament, batchSize, ...plan };
}

// Writes the knockout and flips the cup to the knockout stage in ONE batch. Re-reads the cup first, so a stale preview
// (or a second click) cannot build it twice or build a different knockout than the one that was confirmed.
export async function writeKnockoutBuild(previewed) {
    const fresh = await previewKnockoutBuild({ cupId: previewed.cupId, batchSize: previewed.batchSize });
    if (fresh.qualifiedVideoIds.join() !== previewed.qualifiedVideoIds.join()) {
        throw new Error('The group results changed since you previewed the knockout. Nothing was written: run it again.');
    }
    const matchesRef = collection(db, `tournaments/${fresh.cupId}/matches`);
    const batch = writeBatch(db);
    for (const match of fresh.knockoutMatches) batch.set(doc(matchesRef, match.matchId), match);
    batch.update(doc(db, 'tournaments', fresh.cupId), fresh.tournamentUpdate);
    await batch.commit();
    console.log(`✅ Knockout built: ${fresh.knockoutMatches.length} matches, ${fresh.qualifiedVideoIds.length} qualifiers.`);
    return fresh;
}
