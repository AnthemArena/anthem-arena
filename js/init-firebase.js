// ========================================
// INITIALIZE COMPLETE TOURNAMENT
// Creates all 63 matches at once
// Supports multiple tournaments
// ========================================

import { db } from './firebase-config.js';
import { collection, doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// TOURNAMENT CONFIGURATION
// ========================================

const TOURNAMENT_CONFIG = {
    id: '2025-worlds-anthems',           // ← Change for Tournament 2
    name: 'Anthem Area: Season 1',
    startDate: '2025-11-01',
    endDate: '2025-12-31',
    status: 'active',
    description: 'Vote for the greatest League music video of all time!'
};

// ========================================
// LOAD SONGS FROM JSON
// ========================================

async function loadSongs() {
    const response = await fetch('/data/music-videos.json');
    const songs = await response.json();
    return songs.sort((a, b) => a.seed - b.seed);
}

// ========================================
// CREATE TOURNAMENT INFO
// ========================================

async function createTournamentInfo() {
    const tournamentRef = doc(db, 'tournaments', TOURNAMENT_CONFIG.id);
    
    await setDoc(tournamentRef, {
        ...TOURNAMENT_CONFIG,
        createdAt: new Date().toISOString(),
        totalMatches: 63,
        totalSongs: 64
    });
    
    console.log(`✅ Tournament info created: ${TOURNAMENT_CONFIG.id}`);
}

// ========================================
// GENERATE ALL 63 MATCHES
// ========================================

// ========================================
// GENERATE ALL 63 MATCHES (with batch assignments)
// ========================================

async function generateAllMatches(allSongs) {
    const allMatches = [];
    
    // ========================================
    // ROUND 1: 29 MATCHES (5 matches per batch = 6 batches)
    // ========================================
    
    console.log('🎯 Generating Round 1 (29 matches, 6 batches)...');
    
    for (let i = 0; i < 29; i++) {
        const topSeedIndex = i + 3;      // Seeds 4-32
        const bottomSeedIndex = 60 - i;  // Seeds 61-33
        
        const song1 = allSongs[topSeedIndex];
        const song2 = allSongs[bottomSeedIndex];
        
        if (!song1 || !song2) {
            console.error(`❌ Missing song for R1 Match ${i + 1}`);
            continue;
        }
        
        allMatches.push({
            matchId: `round-1-match-${i + 1}`,
            tournament: TOURNAMENT_CONFIG.id,
            tournamentName: TOURNAMENT_CONFIG.name,
            round: 1,
            matchNumber: i + 1,
            batch: Math.floor(i / 5) + 1,  // Batches 1-6 (5 per batch, last batch has 4)
            status: 'upcoming',
            totalVotes: 0,
            winnerId: null,
            
            song1: {
                id: song1.id,
                seed: song1.seed,
                shortTitle: song1.shortTitle,
                title: song1.title,
                artist: song1.artist,
                videoId: song1.videoId,
                year: song1.year || '2024',
                slug: song1.slug,
                votes: 0
            },
            
            song2: {
                id: song2.id,
                seed: song2.seed,
                shortTitle: song2.shortTitle,
                title: song2.title,
                artist: song2.artist,
                videoId: song2.videoId,
                year: song2.year || '2024',
                slug: song2.slug,
                votes: 0
            }
        });
    }
    
    console.log(`✅ Round 1: ${allMatches.length} matches in 6 batches`);

    // ========================================
// ✅ DEFINE BYE SEEDS (Seeds 1, 2, 3)
// ========================================

const byeSeeds = [allSongs[0], allSongs[1], allSongs[2]]; // Seeds 1, 2, 3

console.log('✅ Bye seeds defined:', byeSeeds.map(s => `${s.seed}. ${s.shortTitle}`));
    
// ========================================
// ROUND 2: 16 MATCHES – FIXED & CORRECT (2025-worlds-anthems)
// ========================================

console.log('Generating Round 2 (16 matches, 4 batches)...');

const TBD = {
    id: 'TBD',
    seed: '?',
    shortTitle: 'TBD',
    title: 'To Be Determined',
    artist: 'Pending',
    videoId: 'dQw4w9WgXcQ',
    year: '2024',
    slug: 'tbd'
};

// Re-define the helper just for Round 2 (safe & clean)
const addRound2Match = (matchNum, song1Data, song2Data) => {
    allMatches.push({
        matchId: `round-2-match-${matchNum}`,
        tournament: TOURNAMENT_CONFIG.id,
        tournamentName: TOURNAMENT_CONFIG.name,
        round: 2,
        matchNumber: matchNum,
        batch: Math.floor((matchNum - 1) / 4) + 1,
        status: 'upcoming',
        totalVotes: 0,
        winnerId: null,
        song1: { ...song1Data, votes: 0 },
        song2: { ...song2Data, votes: 0 }
    });
};

// TOP QUARTER – Seed #1 Region
addRound2Match(1,  { ...byeSeeds[0], hasBye: true },                              { ...TBD, sourceMatch: 'round-1-match-1' });
addRound2Match(2,  { ...TBD, sourceMatch: 'round-1-match-2' },                   { ...TBD, sourceMatch: 'round-1-match-3' });
addRound2Match(3,  { ...TBD, sourceMatch: 'round-1-match-4' },                   { ...TBD, sourceMatch: 'round-1-match-5' });
addRound2Match(4,  { ...TBD, sourceMatch: 'round-1-match-6' },                   { ...TBD, sourceMatch: 'round-1-match-7' });

// UPPER-MIDDLE – Seed #3 Region
addRound2Match(5,  { ...byeSeeds[2], hasBye: true },                              { ...TBD, sourceMatch: 'round-1-match-8' });
addRound2Match(6,  { ...TBD, sourceMatch: 'round-1-match-9' },                    { ...TBD, sourceMatch: 'round-1-match-10' });
addRound2Match(7,  { ...TBD, sourceMatch: 'round-1-match-11' },                   { ...TBD, sourceMatch: 'round-1-match-12' });
addRound2Match(8,  { ...TBD, sourceMatch: 'round-1-match-13' },                   { ...TBD, sourceMatch: 'round-1-match-14' });

// LOWER-MIDDLE – No bye
addRound2Match(9,  { ...TBD, sourceMatch: 'round-1-match-15' },                   { ...TBD, sourceMatch: 'round-1-match-16' });
addRound2Match(10, { ...TBD, sourceMatch: 'round-1-match-17' },                   { ...TBD, sourceMatch: 'round-1-match-18' });
addRound2Match(11, { ...TBD, sourceMatch: 'round-1-match-19' },                   { ...TBD, sourceMatch: 'round-1-match-20' });
addRound2Match(12, { ...TBD, sourceMatch: 'round-1-match-21' },                   { ...TBD, sourceMatch: 'round-1-match-22' });

// BOTTOM – Seed #2 Region
addRound2Match(13, { ...byeSeeds[1], hasBye: true },                              { ...TBD, sourceMatch: 'round-1-match-23' });
addRound2Match(14, { ...TBD, sourceMatch: 'round-1-match-24' },                   { ...TBD, sourceMatch: 'round-1-match-25' });
addRound2Match(15, { ...TBD, sourceMatch: 'round-1-match-26' },                   { ...TBD, sourceMatch: 'round-1-match-27' });
addRound2Match(16, { ...TBD, sourceMatch: 'round-1-match-28' },                   { ...TBD, sourceMatch: 'round-1-match-29' });

console.log('Round 2: 16 matches correctly mapped – all 29 R1 winners now feed perfectly');
 // ========================================
    // ROUND 3: 8 MATCHES (4 per batch = 2 batches)
    // ========================================
    
    console.log('🎯 Generating Round 3 (8 matches, 2 batches)...');
    
    for (let i = 1; i <= 8; i++) {
        const r2match1 = (i * 2) - 1;
        const r2match2 = i * 2;
        
        allMatches.push({
            matchId: `round-3-match-${i}`,
            tournament: TOURNAMENT_CONFIG.id,
            tournamentName: TOURNAMENT_CONFIG.name,
            round: 3,
            matchNumber: i,
            batch: Math.floor((i - 1) / 4) + 1,  // Batches 1-2 (4 per batch)
            status: 'upcoming',
            totalVotes: 0,
            winnerId: null,
            
            song1: {
                id: 'TBD',
                seed: '?',
                shortTitle: 'TBD',
                title: 'To Be Determined',
                artist: 'Pending',
                videoId: 'dQw4w9WgXcQ',
                year: '2024',
                slug: 'tbd',
                votes: 0,
                sourceMatch: `round-2-match-${r2match1}`
            },
            
            song2: {
                id: 'TBD',
                seed: '?',
                shortTitle: 'TBD',
                title: 'To Be Determined',
                artist: 'Pending',
                videoId: 'dQw4w9WgXcQ',
                year: '2024',
                slug: 'tbd',
                votes: 0,
                sourceMatch: `round-2-match-${r2match2}`
            }
        });
    }
    
    console.log(`✅ Round 3: 8 matches in 2 batches (${allMatches.length} total)`);
    
    // ========================================
    // ROUND 4: 4 MATCHES (all in 1 batch - Quarterfinals)
    // ========================================
    
    console.log('🎯 Generating Round 4 (4 matches, 1 batch)...');
    
    for (let i = 1; i <= 4; i++) {
        const r3match1 = (i * 2) - 1;
        const r3match2 = i * 2;
        
        allMatches.push({
            matchId: `round-4-match-${i}`,
            tournament: TOURNAMENT_CONFIG.id,
            tournamentName: TOURNAMENT_CONFIG.name,
            round: 4,
            matchNumber: i,
            batch: 1,  // All 4 QF matches in 1 batch
            status: 'upcoming',
            totalVotes: 0,
            winnerId: null,
            
            song1: {
                id: 'TBD',
                seed: '?',
                shortTitle: 'TBD',
                title: 'To Be Determined',
                artist: 'Pending',
                videoId: 'dQw4w9WgXcQ',
                year: '2024',
                slug: 'tbd',
                votes: 0,
                sourceMatch: `round-3-match-${r3match1}`
            },
            
            song2: {
                id: 'TBD',
                seed: '?',
                shortTitle: 'TBD',
                title: 'To Be Determined',
                artist: 'Pending',
                videoId: 'dQw4w9WgXcQ',
                year: '2024',
                slug: 'tbd',
                votes: 0,
                sourceMatch: `round-3-match-${r3match2}`
            }
        });
    }
    
    console.log(`✅ Round 4: 4 matches in 1 batch (${allMatches.length} total)`);
    
    // ========================================
    // ROUND 5: 2 MATCHES (all in 1 batch - Semifinals)
    // ========================================
    
    console.log('🎯 Generating Round 5 (2 matches, 1 batch)...');
    
    for (let i = 1; i <= 2; i++) {
        const r4match1 = (i * 2) - 1;
        const r4match2 = i * 2;
        
        allMatches.push({
            matchId: `round-5-match-${i}`,
            tournament: TOURNAMENT_CONFIG.id,
            tournamentName: TOURNAMENT_CONFIG.name,
            round: 5,
            matchNumber: i,
            batch: 1,  // Both semis in 1 batch
            status: 'upcoming',
            totalVotes: 0,
            winnerId: null,
            
            song1: {
                id: 'TBD',
                seed: '?',
                shortTitle: 'TBD',
                title: 'To Be Determined',
                artist: 'Pending',
                videoId: 'dQw4w9WgXcQ',
                year: '2024',
                slug: 'tbd',
                votes: 0,
                sourceMatch: `round-4-match-${r4match1}`
            },
            
            song2: {
                id: 'TBD',
                seed: '?',
                shortTitle: 'TBD',
                title: 'To Be Determined',
                artist: 'Pending',
                videoId: 'dQw4w9WgXcQ',
                year: '2024',
                slug: 'tbd',
                votes: 0,
                sourceMatch: `round-4-match-${r4match2}`
            }
        });
    }
    
    console.log(`✅ Round 5: 2 matches in 1 batch (${allMatches.length} total)`);
    
    // ========================================
    // ROUND 6: FINALS (1 batch)
    // ========================================
    
    console.log('🎯 Generating Finals...');
    
    allMatches.push({
        matchId: 'finals',
        tournament: TOURNAMENT_CONFIG.id,
        tournamentName: TOURNAMENT_CONFIG.name,
        round: 6,
        matchNumber: 1,
        batch: 1,  // Finals obviously in 1 batch
        status: 'upcoming',
        totalVotes: 0,
        winnerId: null,
        
        song1: {
            id: 'TBD',
            seed: '?',
            shortTitle: 'TBD',
            title: 'To Be Determined',
            artist: 'Pending',
            videoId: 'dQw4w9WgXcQ',
            year: '2024',
            slug: 'tbd',
            votes: 0,
            sourceMatch: 'round-5-match-1'
        },
        
        song2: {
            id: 'TBD',
            seed: '?',
            shortTitle: 'TBD',
            title: 'To Be Determined',
            artist: 'Pending',
            videoId: 'dQw4w9WgXcQ',
            year: '2024',
            slug: 'tbd',
            votes: 0,
            sourceMatch: 'round-5-match-2'
        }
    });
    
    console.log(`✅ The Finals: 1 match (${allMatches.length} total)`);
    
    return allMatches;
}

// ========================================
// WRITE TO FIREBASE
// ========================================

async function writeMatchesToFirebase(allMatches) {
    console.log(`🔥 Writing ${allMatches.length} matches to Firebase...`);
    
    // Use tournament-namespaced path
    const tournamentId = TOURNAMENT_CONFIG.id;
    const matchesRef = collection(db, `tournaments/${tournamentId}/matches`);
    
    let successCount = 0;
    
    for (const match of allMatches) {
        try {
            await setDoc(doc(matchesRef, match.matchId), match);
            successCount++;
            
            if (successCount % 10 === 0) {
                console.log(`✅ Progress: ${successCount}/${allMatches.length}`);
            }
        } catch (error) {
            console.error(`❌ Failed: ${match.matchId}:`, error);
        }
    }
    
    console.log(`\n🎉 Complete! Created ${successCount}/${allMatches.length} matches`);
    return successCount;
}

// ========================================
// MAIN INITIALIZATION
// ========================================

async function initializeCompleteTournament() {
    try {
        console.log('🚀 Starting complete tournament initialization...\n');
        console.log(`Tournament: ${TOURNAMENT_CONFIG.name}`);
        console.log(`ID: ${TOURNAMENT_CONFIG.id}\n`);
        
        // Create tournament info
        await createTournamentInfo();
        
        // Load songs
        const allSongs = await loadSongs();
        console.log(`✅ Loaded ${allSongs.length} songs\n`);
        
        // Generate all matches
        const allMatches = await generateAllMatches(allSongs);
        console.log(`\n✅ Generated ${allMatches.length} total matches\n`);
        
        // Write to Firebase
        const successCount = await writeMatchesToFirebase(allMatches);
        
        alert(`
🎉 Tournament Initialized!

✅ ${successCount}/63 matches created
📊 Tournament: ${TOURNAMENT_CONFIG.name}
🆔 ID: ${TOURNAMENT_CONFIG.id}

Refresh brackets.html to view!
        `);
        
    } catch (error) {
        console.error('❌ Failed:', error);
        alert(`❌ Error: ${error.message}`);
    }
}

// ========================================
// LEGACY: Keep old function for backward compatibility
// ========================================

async function initializeRound1Matches() {
    console.warn('⚠️ initializeRound1Matches() is deprecated. Use initializeCompleteTournament() instead.');
    alert('This function only creates Round 1.\n\nUse initializeCompleteTournament() to create all 63 matches at once!');
}

// ========================================
// EXPORTS
// ========================================

export { initializeCompleteTournament, initializeRound1Matches };

window.initializeCompleteTournament = initializeCompleteTournament;
window.initializeRound1Matches = initializeRound1Matches;

console.log('💡 Ready! Run initializeCompleteTournament() to create entire tournament.');