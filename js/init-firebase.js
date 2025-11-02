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
             tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
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
// Proper bracket seeding: #1 and #2 in opposite halves
// ========================================

console.log('🎯 Generating Round 2 (16 matches)...');

const byeSeeds = [allSongs[0], allSongs[1], allSongs[2]]; // Seeds 1, 2, 3

// ========================================
// TOP QUARTER (Matches 1-4): Seed #1's Region
// ========================================

// Match 1: Seed 1 (bye) vs Winner(4 vs 61)
allMatches.push({
    matchId: 'round-2-match-1',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 1,
    status: 'upcoming',
    totalVotes: 0,
    winnerId: null,
    
    song1: {
        ...byeSeeds[0], // Seed 1
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
        sourceMatch: 'round-1-match-1' // 4 vs 61
    }
});

// Match 2: Winner(8 vs 57) vs Winner(9 vs 56)
allMatches.push({
    matchId: 'round-2-match-2',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 2,
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
        sourceMatch: 'round-1-match-5' // 8 vs 57
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
        sourceMatch: 'round-1-match-6' // 9 vs 56
    }
});

// Match 3: Winner(5 vs 60) vs Winner(12 vs 53)
allMatches.push({
    matchId: 'round-2-match-3',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 3,
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
        sourceMatch: 'round-1-match-2' // 5 vs 60
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
        sourceMatch: 'round-1-match-9' // 12 vs 53
    }
});

// Match 4: Winner(13 vs 52) vs Winner(16 vs 49)
allMatches.push({
    matchId: 'round-2-match-4',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 4,
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
        sourceMatch: 'round-1-match-10' // 13 vs 52
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
        sourceMatch: 'round-1-match-13' // 16 vs 49
    }
});

// ========================================
// UPPER-MIDDLE QUARTER (Matches 5-8): Seed #3's Region
// ========================================

// Match 5: Seed 3 (bye) vs Winner(6 vs 59)
allMatches.push({
    matchId: 'round-2-match-5',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 5,
    status: 'upcoming',
    totalVotes: 0,
    winnerId: null,
    
    song1: {
        ...byeSeeds[2], // Seed 3
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
        sourceMatch: 'round-1-match-3' // 6 vs 59
    }
});

// Match 6: Winner(11 vs 54) vs Winner(14 vs 51)
allMatches.push({
    matchId: 'round-2-match-6',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 6,
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
        sourceMatch: 'round-1-match-8' // 11 vs 54
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
        sourceMatch: 'round-1-match-11' // 14 vs 51
    }
});

// Match 7: Winner(7 vs 58) vs Winner(10 vs 55)
allMatches.push({
    matchId: 'round-2-match-7',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 7,
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
        sourceMatch: 'round-1-match-4' // 7 vs 58
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
        sourceMatch: 'round-1-match-7' // 10 vs 55
    }
});

// Match 8: Winner(15 vs 50) vs Winner(18 vs 47)
allMatches.push({
    matchId: 'round-2-match-8',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 8,
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
        sourceMatch: 'round-1-match-12' // 15 vs 50
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
        sourceMatch: 'round-1-match-15' // 18 vs 47
    }
});

// ========================================
// LOWER-MIDDLE QUARTER (Matches 9-12)
// ========================================

// Match 9: Winner(19 vs 46) vs Winner(22 vs 43)
allMatches.push({
    matchId: 'round-2-match-9',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 9,
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
        sourceMatch: 'round-1-match-16' // 19 vs 46
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
        sourceMatch: 'round-1-match-19' // 22 vs 43
    }
});

// Match 10: Winner(27 vs 38) vs Winner(30 vs 35)
allMatches.push({
    matchId: 'round-2-match-10',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 10,
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
        sourceMatch: 'round-1-match-24' // 27 vs 38
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
        sourceMatch: 'round-1-match-27' // 30 vs 35
    }
});

// Match 11: Winner(23 vs 42) vs Winner(26 vs 39)
allMatches.push({
    matchId: 'round-2-match-11',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 11,
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
        sourceMatch: 'round-1-match-20' // 23 vs 42
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
        sourceMatch: 'round-1-match-23' // 26 vs 39
    }
});

// Match 12: Winner(31 vs 34) vs Winner(32 vs 33)
allMatches.push({
    matchId: 'round-2-match-12',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 12,
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
        sourceMatch: 'round-1-match-28' // 31 vs 34
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
        sourceMatch: 'round-1-match-29' // 32 vs 33
    }
});

// ========================================
// BOTTOM QUARTER (Matches 13-16): Seed #2's Region
// ========================================

// Match 13: Seed 2 (bye) vs Winner(17 vs 48)
allMatches.push({
    matchId: 'round-2-match-13',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 13,
    status: 'upcoming',
    totalVotes: 0,
    winnerId: null,
    
    song1: {
        ...byeSeeds[1], // Seed 2
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
        sourceMatch: 'round-1-match-14' // 17 vs 48
    }
});

// Match 14: Winner(24 vs 41) vs Winner(25 vs 40)
allMatches.push({
    matchId: 'round-2-match-14',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 14,
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
        sourceMatch: 'round-1-match-21' // 24 vs 41
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
        sourceMatch: 'round-1-match-22' // 25 vs 40
    }
});

// Match 15: Winner(20 vs 45) vs Winner(29 vs 36)
allMatches.push({
    matchId: 'round-2-match-15',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 15,
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
        sourceMatch: 'round-1-match-17' // 20 vs 45
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
        sourceMatch: 'round-1-match-26' // 29 vs 36
    }
});

// Match 16: Winner(21 vs 44) vs Winner(28 vs 37)
allMatches.push({
    matchId: 'round-2-match-16',
     tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
    round: 2,
    matchNumber: 16,
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
        sourceMatch: 'round-1-match-18' // 21 vs 44
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
        sourceMatch: 'round-1-match-25' // 28 vs 37
    }
});

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
             tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
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
             tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
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
             tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
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
         tournament: TOURNAMENT_CONFIG.id,           // ← ADD
    tournamentName: TOURNAMENT_CONFIG.name,     // ← ADD
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