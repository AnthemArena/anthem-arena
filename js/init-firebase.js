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
    name: 'Worlds Anthems Championship 2025',
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

async function generateAllMatches(allSongs) {
    const allMatches = [];
    
    // ========================================
    // ROUND 1: 29 MATCHES
    // ========================================
    
    console.log('🎯 Generating Round 1 (29 matches)...');
    
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
            round: 1,
            matchNumber: i + 1,
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
    
    console.log(`✅ Round 1: ${allMatches.length} matches`);
    
    // ========================================
    // ROUND 2: 16 MATCHES (with byes)
    // ========================================
    
    console.log('🎯 Generating Round 2 (16 matches)...');
    
    // Top 3 seeds get byes
    const byeSeeds = [allSongs[0], allSongs[1], allSongs[2]];
    
    // Match 1: Seed 1 vs Winner R1-1
    allMatches.push({
        matchId: 'round-2-match-1',
        round: 2,
        matchNumber: 1,
        status: 'upcoming',
        totalVotes: 0,
        winnerId: null,
        
        song1: {
            ...byeSeeds[0],
            votes: 0,
            hasBye: true
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
            sourceMatch: 'round-1-match-1'
        }
    });
    
    // Match 2: Seed 2 vs Winner R1-2
    allMatches.push({
        matchId: 'round-2-match-2',
        round: 2,
        matchNumber: 2,
        status: 'upcoming',
        totalVotes: 0,
        winnerId: null,
        
        song1: {
            ...byeSeeds[1],
            votes: 0,
            hasBye: true
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
            sourceMatch: 'round-1-match-2'
        }
    });
    
    // Match 3: Seed 3 vs Winner R1-3
    allMatches.push({
        matchId: 'round-2-match-3',
        round: 2,
        matchNumber: 3,
        status: 'upcoming',
        totalVotes: 0,
        winnerId: null,
        
        song1: {
            ...byeSeeds[2],
            votes: 0,
            hasBye: true
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
            sourceMatch: 'round-1-match-3'
        }
    });
    
    // Remaining 13 R2 matches
    for (let i = 1; i <= 13; i++) {
        const matchNum = i + 3;
        const r1match1 = (i * 2) + 2;
        const r1match2 = (i * 2) + 3;
        
        allMatches.push({
            matchId: `round-2-match-${matchNum}`,
            round: 2,
            matchNumber: matchNum,
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
                sourceMatch: `round-1-match-${r1match1}`
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
                sourceMatch: `round-1-match-${r1match2}`
            }
        });
    }
    
    console.log(`✅ Round 2: 16 matches (${allMatches.length} total)`);
    
    // ========================================
    // ROUND 3: 8 MATCHES (Sweet 16)
    // ========================================
    
    console.log('🎯 Generating Round 3 (8 matches)...');
    
    for (let i = 1; i <= 8; i++) {
        const r2match1 = (i * 2) - 1;
        const r2match2 = i * 2;
        
        allMatches.push({
            matchId: `round-3-match-${i}`,
            round: 3,
            matchNumber: i,
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
    
    console.log(`✅ Round 3: 8 matches (${allMatches.length} total)`);
    
    // ========================================
    // ROUND 4: 4 MATCHES (Quarterfinals)
    // ========================================
    
    console.log('🎯 Generating Round 4 (4 matches)...');
    
    for (let i = 1; i <= 4; i++) {
        const r3match1 = (i * 2) - 1;
        const r3match2 = i * 2;
        
        allMatches.push({
            matchId: `round-4-match-${i}`,
            round: 4,
            matchNumber: i,
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
    
    console.log(`✅ Round 4: 4 matches (${allMatches.length} total)`);
    
    // ========================================
    // ROUND 5: 2 MATCHES (Semifinals)
    // ========================================
    
    console.log('🎯 Generating Round 5 (2 matches)...');
    
    for (let i = 1; i <= 2; i++) {
        const r4match1 = (i * 2) - 1;
        const r4match2 = i * 2;
        
        allMatches.push({
            matchId: `round-5-match-${i}`,
            round: 5,
            matchNumber: i,
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
    
    console.log(`✅ Round 5: 2 matches (${allMatches.length} total)`);
    
    // ========================================
    // ROUND 6: FINALS
    // ========================================
    
    console.log('🎯 Generating Finals...');
    
    allMatches.push({
        matchId: 'finals',
        round: 6,
        matchNumber: 1,
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
    
    console.log(`✅ Finals: 1 match (${allMatches.length} total)`);
    
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