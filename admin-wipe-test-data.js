// ============================================================================
// WIPE TEST VOTES AND THE DATA THEY LEFT BEHIND (one cup)
// ============================================================================
// Run from the browser console on the ADMIN page while signed in as admin
// (https://arcanemoments.netlify.app/admin.html). Paste the whole file, press Enter.
//
//   1. Leave dryRun true first. It changes nothing: it prints what it found and downloads a backup file.
//   2. Read the report. Pick what to do with each profile (see profileActions below).
//   3. Set dryRun to false and paste again. It backs up again, then deletes.
//
// What it removes for the cup in CONFIG.tournament:
//   votes, activity rows, vote posts (and their likes and comments), the vote counters on the matches (set back to 0).
// What it does to profiles: nothing unless you name a profile in profileActions.
//   'reset'  keeps the account (name, avatar, bio) and clears XP, champion XP and achievements.
//   'delete' removes the whole profile.
// What it cannot reach (the rules only let the owner read or delete these): other people's notification bells and the
// copies of posts in followers' feeds. Test accounts that no longer exist leave nothing visible behind.
//
// After a real run, on EVERY browser or phone you tested with: clear this site's data (or run the line printed at the
// end). Otherwise that browser still holds the old XP, and the site copies the larger number back up to the profile.

(function () {
const CONFIG = {
    tournament: 'jinx-cup-1',
    dryRun: false,
    // uid -> 'reset' | 'delete'. The dry run lists every profile with its uid, name and XP.
    profileActions: {
        '0RfiRu8ZUDNLucNK00ZPtBlEZ5g2': 'delete',
        '3St5GAUYeodgGsiSiLRLwRMGO9Q2': 'delete',
        'CxNLIo8NXrWGwmtotfJGo8gULQk2': 'delete',
        'FJLlNtkeVpckFRp0QoVAZIyZjnU2': 'delete',
        'FJxQTFR75ydwUian4SXABOSSQqX2': 'delete',
        'GyyEV1GZVLO1zA0sALKnRrHWwlw1': 'delete',
        'HMmVDVnN0PMMFdOk1WiYXMjF9uM2': 'delete',
        'HSFPtnFxxAfapoVNtKtJjd4NhKG2': 'delete',
        'O0bF3CCvyTNFangMuO8O4LNX5OQ2': 'delete',
        'Uq41dkXQvfWZDGYRRuCuftzrwPU2': 'delete',
        'VBC6FO5ZOIN5xTkWpbw2Z3ngG652': 'reset',
        'VnSHBZxSUcQGMgjkynkPAPlvA4R2': 'delete',
        'XCPFF9UpBYPIytsWKMEx133w4B92': 'delete',
        'YNuY5MPwJZe50b5pXg6vXAIp9Qq1': 'delete',
        'cUJ4mtkdb8YOXAbVEfARKzfCVpA3': 'delete',
        'ijyeX1Tv97eBihNJENHOHIsieIl1': 'delete',
        'lpoFnVl6fRZpFG8NKkamjY7vlGZ2': 'delete',
        'mxNTH7PtXnamof3zOnlF5eYobiF3': 'delete',
    },
};

const RESET_FIELDS = { xp: 0, packXp: {}, unlockedAchievements: [] };
const RESET_IF_PRESENT = ['level', 'votingStreak', 'streak', 'totalVotes', 'voteCount', 'achievementXP', 'achievementXp'];

async function wipeTestData({ fs, db, config = CONFIG, download = () => {}, log = console.log }) {
    const { collection, getDocs, query, where, doc, writeBatch, updateDoc } = fs;
    const T = config.tournament;
    const prefix = `${T}-`;
    const report = {};
    const backup = {};

    const read = async (name, ...cons) => (await getDocs(query(collection(db, name), ...cons))).docs;
    const inCup = d => String(d.data().matchId || '').startsWith(prefix);

    // ---- find everything ----
    const votes = await read('votes', where('tournament', '==', T));
    const activity = (await read('activity', where('tournamentId', '==', T)));
    const postsAll = await read('posts', where('type', '==', 'vote'), where('privacy', '==', 'public'));
    const posts = postsAll.filter(d => d.data().tournamentId === T || inCup(d));

    const postIds = new Set(posts.map(d => d.id));
    const children = [];
    for (const name of ['comments', 'likes']) {
        for (const id of postIds) {
            try { children.push(...(await read(name, where('postId', '==', id)))); } catch { /* collection shape differs: reported below */ }
        }
    }

    const matchSnap = await getDocs(collection(db, `tournaments/${T}/matches`));
    const matches = matchSnap.docs.filter(d => {
        const m = d.data();
        return Number(m.totalVotes) > 0 || Number(m.song1?.votes) > 0 || Number(m.song2?.votes) > 0;
    });
    const closedWithVotes = matches.filter(d => d.data().status && d.data().status !== 'live' && d.data().status !== 'upcoming');

    const profiles = (await getDocs(collection(db, 'profiles'))).docs;

    // ---- report ----
    const voters = {};
    for (const v of votes) { const d = v.data(); voters[d.userId] = voters[d.userId] || { username: d.username, votes: 0 }; voters[d.userId].votes++; }
    report.counts = { votes: votes.length, activity: activity.length, posts: posts.length, postLikesAndComments: children.length, matchesWithVotes: matches.length };
    report.voters = voters;
    report.profiles = profiles.map(p => ({ uid: p.id, username: p.data().username, xp: p.data().xp || 0, achievements: (p.data().unlockedAchievements || []).length, votedHere: !!voters[p.id], action: config.profileActions[p.id] || '(none)' }));
    report.warnings = [];
    if (closedWithVotes.length) report.warnings.push(`${closedWithVotes.length} match(es) are not live (${closedWithVotes.map(d => d.id).join(', ')}): counters will be zeroed but winner and status are left alone, check them in admin.`);
    for (const uid of Object.keys(config.profileActions)) if (!profiles.some(p => p.id === uid)) report.warnings.push(`profileActions names ${uid}, which is not a profile.`);
    const outsiders = Object.keys(voters).filter(uid => !profiles.some(p => p.id === uid));
    if (outsiders.length) report.warnings.push(`${outsiders.length} voter(s) have no profile document (their votes are still removed).`);

    log('=== REPORT ===');
    log(report.counts);
    log(report.profiles.map(p => `${p.uid}  ${p.username}  xp=${p.xp}  achievements=${p.achievements}  votedHere=${p.votedHere}  action=${p.action}`).join('\n'));
    report.warnings.forEach(w => log('WARNING:', w));

    // ---- backup (everything about to change) ----
    const dump = d => ({ path: d.ref?.path || d.id, data: d.data() });
    backup.votes = votes.map(dump); backup.activity = activity.map(dump); backup.posts = posts.map(dump); backup.postChildren = children.map(dump);
    backup.matches = matches.map(dump);
    backup.profiles = profiles.filter(p => config.profileActions[p.id]).map(dump);
    download(`backup-${T}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(backup, null, 2));

    if (config.dryRun) { log('DRY RUN: nothing was changed. Set dryRun to false to wipe.'); return { report, changed: false }; }

    // ---- wipe ----
    const ops = [];
    for (const d of [...votes, ...activity, ...posts, ...children]) ops.push(b => b.delete(d.ref));
    for (const d of matches) ops.push(b => b.update(d.ref, { 'song1.votes': 0, 'song2.votes': 0, totalVotes: 0 }));
    for (const p of profiles) {
        const action = config.profileActions[p.id];
        if (action === 'delete') ops.push(b => b.delete(p.ref));
        else if (action === 'reset') {
            const patch = { ...RESET_FIELDS };
            for (const k of RESET_IF_PRESENT) if (k in p.data()) patch[k] = typeof p.data()[k] === 'number' ? 0 : p.data()[k];
            ops.push(b => b.update(p.ref, patch));
        }
    }
    // The vote and its counter live in separate documents with no rule tying them here, so batches of 400 are safe.
    let done = 0;
    for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach(op => op(batch));
        await batch.commit();
        done += Math.min(400, ops.length - i);
        log(`...${done}/${ops.length}`);
    }
    log(`DONE: ${done} changes. On each test browser/phone run: localStorage.clear(); then reload. The site can take about a minute to show the new counts.`);
    return { report, changed: true, done };
}

if (globalThis.__wipeTest) globalThis.__wipeTest.fn = wipeTestData;

if (typeof window !== 'undefined' && window.db) {
    (async () => {
        const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const download = (name, text) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            a.download = name; document.body.appendChild(a); a.click(); a.remove();
        };
        try { await wipeTestData({ fs, db: window.db, download }); }
        catch (e) { console.error('Wipe stopped:', e); }
    })();
}
})();
