// ============================================================================
// SWAP ONE EDIT FOR ANOTHER IN A CUP THAT HAS NOT OPENED THAT MATCH YET
// ============================================================================
// Use when a creator removes an edit from YouTube before its group opens. Run it from the browser console on the ADMIN page
// while signed in as admin (https://arcanemoments.netlify.app/admin.html). Paste the whole file, press Enter.
//
//   1. Leave dryRun true first. It changes nothing: it prints every match it would touch and downloads a backup file.
//   2. Set dryRun to false and paste again to do it.
//
// It refuses (and changes nothing) unless EVERY match containing the removed edit is still 'upcoming' with 0 votes.
// A match that has opened is a forfeit, not a swap: the people who voted voted on the edit that was there.
//
// What it changes: in each of those matches, the removed edit's slot gets the replacement (same group, same draw position,
// same pot, votes 0), and the cup's own document records the swap under "replacements" so the published draw stays auditable.
// It does NOT edit data/edits.json: do that in the repo (status "removed" for the old edit, the cup added to the new one).

const CONFIG = {
    tournament: 'jinx-cup-1',
    removedVideoId: 'M_3X5IbhuPk',
    replacementVideoId: 'uBnaLEcEOJY',
    // A few words of the REMOVED edit's title. The script refuses if the video ID you gave does not match them,
    // so a wrong ID is caught before anything is changed.
    expectTitleContains: "Jinx Edit | Inspiration",
    dryRun: false,
};

(function () {
    // same fields as toCompetitor() in js/bracket-builder.js; seed stays empty because the replacement was never in the seeded draw
    const competitorFor = (edit, slot, removedVideoId) => ({
        id: edit.id || edit.videoId,
        seed: null,
        drawPosition: slot.drawPosition ?? null,
        pot: slot.pot ?? null,
        group: slot.group ?? null,
        shortTitle: edit.shortTitle || edit.title,
        title: edit.title,
        artist: edit.artist || '',
        creatorUrl: edit.creatorUrl || null,
        channelId: edit.channelId || null,
        videoId: edit.videoId,
        year: edit.year || null,
        slug: edit.slug || edit.videoId,
        votes: 0,
        replacementFor: removedVideoId,
    });

    async function swapEdit({ fs, db, edits, config = CONFIG, download = () => {}, log = console.log, now = () => new Date().toISOString() }) {
        const { collection, getDocs, doc, getDoc, updateDoc, writeBatch, arrayUnion } = fs;
        const T = config.tournament;
        const problems = [];

        const replacement = edits.find(e => e.videoId === config.replacementVideoId);
        if (!replacement) problems.push(`The replacement ${config.replacementVideoId} is not in data/edits.json.`);
        else if (replacement.status !== 'ok' || replacement.embedAllowed === false) problems.push(`The replacement is not playable (status ${replacement.status}, embedAllowed ${replacement.embedAllowed}).`);

        const matchDocs = (await getDocs(collection(db, `tournaments/${T}/matches`))).docs;
        const affected = matchDocs.filter(d => d.data().song1?.videoId === config.removedVideoId || d.data().song2?.videoId === config.removedVideoId);
        if (!affected.length) problems.push(`No match in ${T} contains ${config.removedVideoId}.`);
        if (matchDocs.some(d => d.data().song1?.videoId === config.replacementVideoId || d.data().song2?.videoId === config.replacementVideoId)) {
            problems.push('The replacement is already in a match of this cup.');
        }
        for (const d of affected) {
            const m = d.data();
            if (m.status !== 'upcoming') problems.push(`${m.matchId} is '${m.status}', not 'upcoming': use a forfeit, not a swap.`);
            if ((m.totalVotes || 0) > 0 || (m.song1?.votes || 0) > 0 || (m.song2?.votes || 0) > 0) problems.push(`${m.matchId} already has votes.`);
        }

        const slotTitle = affected.length ? String(affected[0].data()[affected[0].data().song1?.videoId === config.removedVideoId ? 'song1' : 'song2'].title || '') : '';
        if (config.expectTitleContains && affected.length && !slotTitle.toLowerCase().includes(config.expectTitleContains.toLowerCase())) {
            problems.push(`${config.removedVideoId} is "${slotTitle.slice(0, 60)}", which does not contain "${config.expectTitleContains}". Wrong video ID?`);
        }

        log('=== PLAN ===');
        log(`Removing: "${slotTitle.slice(0, 70)}" (${config.removedVideoId})   Replacing with: "${(replacement?.title || '').slice(0, 70)}" (${config.replacementVideoId})`);
        for (const d of affected) {
            const m = d.data();
            const side = m.song1?.videoId === config.removedVideoId ? 'song1' : 'song2';
            const other = side === 'song1' ? m.song2 : m.song1;
            log(`${m.matchId} (group ${m.group}, ${m.status}, ${m.totalVotes || 0} votes): ${side} "${(m[side].shortTitle || m[side].title || '').slice(0, 40)}"  ->  "${(replacement?.shortTitle || replacement?.title || '').slice(0, 40)}"   vs "${(other?.shortTitle || other?.title || '').slice(0, 40)}"`);
        }
        problems.forEach(p => log('PROBLEM:', p));

        const cupRef = doc(db, 'tournaments', T);
        const cupSnap = await getDoc(cupRef);
        const backup = { matches: affected.map(d => ({ path: d.ref.path, data: d.data() })), tournament: cupSnap.exists() ? cupSnap.data() : null };
        download(`backup-swap-${T}-${config.removedVideoId}-${now().replace(/[:.]/g, '-')}.json`, JSON.stringify(backup, null, 2));

        if (problems.length) { log('STOPPED: nothing was changed.'); return { changed: false, problems }; }
        if (config.dryRun) { log('DRY RUN: nothing was changed. Set dryRun to false to swap.'); return { changed: false, problems, planned: affected.length }; }

        const batch = writeBatch(db);
        for (const d of affected) {
            const m = d.data();
            const side = m.song1?.videoId === config.removedVideoId ? 'song1' : 'song2';
            batch.update(d.ref, { [side]: competitorFor(replacement, m[side], config.removedVideoId) });
        }
        const cup = cupSnap.exists() ? cupSnap.data() : {};
        const ids = Array.isArray(cup.entryVideoIds) ? cup.entryVideoIds.map(v => v === config.removedVideoId ? config.replacementVideoId : v).sort() : undefined;
        batch.update(cupRef, {
            ...(ids ? { entryVideoIds: ids } : {}),
            replacements: arrayUnion({ removed: config.removedVideoId, replacement: config.replacementVideoId, reason: 'removed from YouTube by its creator before the match opened', date: now(), matches: affected.map(d => d.id) }),
        });
        await batch.commit();
        log(`DONE: ${affected.length} match(es) updated and the swap recorded on the cup. The site can take about a minute to show it.`);
        return { changed: true, problems, updated: affected.length };
    }

    if (globalThis.__swapTest) globalThis.__swapTest.fn = swapEdit;

    if (typeof window !== 'undefined' && window.db) {
        (async () => {
            const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const download = (name, text) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
                a.download = name; document.body.appendChild(a); a.click(); a.remove();
            };
            try {
                const edits = await (await fetch('/data/edits.json', { cache: 'no-store' })).json();
                await swapEdit({ fs, db: window.db, edits, download });
            } catch (e) { console.error('Swap stopped:', e); }
        })();
    }
})();
