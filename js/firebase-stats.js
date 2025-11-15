// ========================================
// FIREBASE-STATS.JS - ADVANCED QUERIES
// Cross-tournament historical data
// ========================================

import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAllMatches } from './api-client.js';

// ========================================
// CROSS-TOURNAMENT H2H HISTORY
// ========================================

/**
 * Get H2H history between two songs across ALL tournaments
 * @param {number} seed1 - First song's seed
 * @param {number} seed2 - Second song's seed
 */
export async function getCrossTournamentH2H(seed1, seed2) {
    try {
        const tournamentsRef = collection(db, 'tournaments');
        const tournamentsSnap = await getDocs(tournamentsRef);
        
        const h2hMatches = [];
        
        for (const tournamentDoc of tournamentsSnap.docs) {
            const tournamentId = tournamentDoc.id;
            const tournamentData = tournamentDoc.data();
            
            // Get matches from this tournament
            const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
            const matchesSnap = await getDocs(matchesRef);
            
            matchesSnap.forEach(matchDoc => {
                const match = matchDoc.data();
                
                // Check if this match involves both songs
                const involvesBothSongs = 
                    (match.song1?.seed === seed1 && match.song2?.seed === seed2) ||
                    (match.song1?.seed === seed2 && match.song2?.seed === seed1);
                
                if (involvesBothSongs && match.status === 'completed') {
                    const song1Data = match.song1.seed === seed1 ? match.song1 : match.song2;
                    const song2Data = match.song1.seed === seed1 ? match.song2 : match.song1;
                    
                    h2hMatches.push({
                        tournament: tournamentData.name,
                        tournamentId: tournamentId,
                        round: match.round,
                        date: match.date,
                        song1Name: song1Data.shortTitle,
                        song2Name: song2Data.shortTitle,
                        song1Votes: song1Data.votes,
                        song2Votes: song2Data.votes,
                        totalVotes: match.totalVotes,
                        winnerId: match.winnerId,
                        winnerName: match.winnerId === 'song1' 
                            ? song1Data.shortTitle 
                            : song2Data.shortTitle
                    });
                }
            });
        }
        
        // Calculate summary
        const song1Wins = h2hMatches.filter(m => 
            (m.song1Name === h2hMatches[0]?.song1Name && m.winnerId === 'song1') ||
            (m.song2Name === h2hMatches[0]?.song1Name && m.winnerId === 'song2')
        ).length;
        
        const song2Wins = h2hMatches.length - song1Wins;
        
        return {
            hasHistory: h2hMatches.length > 0,
            matches: h2hMatches.sort((a, b) => new Date(b.date) - new Date(a.date)),
            song1Wins,
            song2Wins,
            totalMeetings: h2hMatches.length,
            lastMeeting: h2hMatches[0] || null
        };
        
    } catch (error) {
        console.error('Error getting cross-tournament H2H:', error);
        return {
            hasHistory: false,
            matches: [],
            song1Wins: 0,
            song2Wins: 0,
            totalMeetings: 0,
            lastMeeting: null
        };
    }
}

// ========================================
// SONG ALL-TIME STATS (CROSS-TOURNAMENT)
// ========================================

/**
 * Get a song's all-time tournament stats
 * @param {number} seedNumber - Song's seed number
 */
export async function getSongAllTimeStats(seedNumber) {
    try {
        const tournamentsRef = collection(db, 'tournaments');
        const tournamentsSnap = await getDocs(tournamentsRef);
        
        let totalMatches = 0;
        let totalWins = 0;
        let totalLosses = 0;
        let totalVotesCast = 0;
        let totalVotesReceived = 0;
        const tournamentHistory = [];
        
        for (const tournamentDoc of tournamentsSnap.docs) {
            const tournamentId = tournamentDoc.id;
            const tournamentData = tournamentDoc.data();
            const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
            const matchesSnap = await getDocs(matchesRef);
            
            let tournamentWins = 0;
            let tournamentLosses = 0;
            let highestRound = 0;
            let songName = '';
            
            matchesSnap.forEach(matchDoc => {
                const match = matchDoc.data();
                
                if (match.status !== 'completed') return;
                
                const isSong1 = match.song1?.seed === seedNumber;
                const isSong2 = match.song2?.seed === seedNumber;
                
                if (isSong1 || isSong2) {
                    totalMatches++;
                    
                    // Track votes
                    totalVotesCast += match.totalVotes;
                    totalVotesReceived += isSong1 ? match.song1.votes : match.song2.votes;
                    
                    // Track name
                    if (!songName) {
                        songName = isSong1 ? match.song1.shortTitle : match.song2.shortTitle;
                    }
                    
                    // Track wins/losses
                    const won = 
                        (isSong1 && match.winnerId === 'song1') ||
                        (isSong2 && match.winnerId === 'song2');
                    
                    if (won) {
                        tournamentWins++;
                        totalWins++;
                        highestRound = Math.max(highestRound, match.round);
                    } else {
                        tournamentLosses++;
                        totalLosses++;
                    }
                }
            });
            
            // Determine finish
            let finish = 'Eliminated';
            if (highestRound === 6) {
                finish = 'Champion 🏆';
            } else if (highestRound === 5) {
                finish = 'Finals';
            } else if (highestRound === 4) {
                finish = 'Semifinals';
            } else if (highestRound === 3) {
                finish = 'Quarterfinals';
            }
            
            if (tournamentWins + tournamentLosses > 0) {
                tournamentHistory.push({
                    tournament: tournamentData.name,
                    year: new Date(tournamentData.startDate).getFullYear(),
                    record: `${tournamentWins}-${tournamentLosses}`,
                    finish: finish,
                    highestRound: highestRound
                });
            }
        }
        
        const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
        const avgVoteShare = totalVotesCast > 0 ? Math.round((totalVotesReceived / totalVotesCast) * 100) : 0;
        
        return {
            totalMatches,
            wins: totalWins,
            losses: totalLosses,
            record: `${totalWins}-${totalLosses}`,
            winRate,
            avgVoteShare,
            totalVotesReceived,
            tournamentHistory: tournamentHistory.sort((a, b) => b.year - a.year),
            championships: tournamentHistory.filter(t => t.finish === 'Champion 🏆').length,
            finalsAppearances: tournamentHistory.filter(t => 
                t.finish === 'Champion 🏆' || t.finish === 'Finals'
            ).length
        };
        
    } catch (error) {
        console.error('Error getting all-time stats:', error);
        return null;
    }
}

// ========================================
// CURRENT TOURNAMENT FORM
// ========================================

/**
 * Get song's performance in current tournament
 * @param {number} seedNumber - Song's seed
 */
export async function getCurrentTournamentForm(seedNumber) {
    try {
        const allMatches = await getAllMatches();
        
        const songMatches = [];
        
        allMatches.forEach(match => {
            const isSong1 = match.song1?.seed === seedNumber;
            const isSong2 = match.song2?.seed === seedNumber;
            
            if ((isSong1 || isSong2) && match.status === 'completed') {
                const songData = isSong1 ? match.song1 : match.song2;
                const opponentData = isSong1 ? match.song2 : match.song1;
                const won = 
                    (isSong1 && match.winnerId === 'song1') ||
                    (isSong2 && match.winnerId === 'song2');
                
                songMatches.push({
                    round: match.round,
                    won: won,
                    votesReceived: songData.votes,
                    voteShare: Math.round((songData.votes / match.totalVotes) * 100),
                    opponent: opponentData.shortTitle,
                    opponentSeed: opponentData.seed
                });
            }
        });
        
        // Sort by round
        songMatches.sort((a, b) => a.round - b.round);
        
        const wins = songMatches.filter(m => m.won).length;
        const losses = songMatches.filter(m => !m.won).length;
        const avgVoteShare = songMatches.length > 0
            ? Math.round(songMatches.reduce((sum, m) => sum + m.voteShare, 0) / songMatches.length)
            : 0;
        
        // Detect momentum
        const recentMatches = songMatches.slice(-2);
        const recentAvg = recentMatches.length > 0
            ? Math.round(recentMatches.reduce((sum, m) => sum + m.voteShare, 0) / recentMatches.length)
            : 0;
        
        let momentum = 'Steady';
        if (recentAvg > avgVoteShare + 5) momentum = 'Rising 📈';
        if (recentAvg < avgVoteShare - 5) momentum = 'Declining 📉';
        
        return {
            currentRecord: `${wins}-${losses}`,
            wins,
            losses,
            isEliminated: losses > 0,
            matches: songMatches,
            avgVoteShare,
            momentum,
            lastMatch: songMatches[songMatches.length - 1] || null
        };
        
    } catch (error) {
        console.error('Error getting current form:', error);
        return null;
    }
}