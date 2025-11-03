// ========================================
// STATS QUERIES - LEAGUE MUSIC TOURNAMENT
// All Firebase queries for the stats page
// ========================================

import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// TOURNAMENT OVERVIEW STATS
// ========================================

/**
 * Get overall tournament statistics
 * @param {string} tournamentId - Tournament ID (e.g. "2025-worlds-anthems")
 */
export async function getTournamentOverview(tournamentId) {
    try {
        const matchesRef = collection(db, `tournaments/${tournamentId}/matches`);
        const matchesSnap = await getDocs(matchesRef);
        
        let totalVotes = 0;
        let completedMatches = 0;
        let liveMatches = 0;
        let upcomingMatches = 0;
        let highestVoteMatch = null;
        let closestMatch = null;
        let biggestBlowout = null;
        
        matchesSnap.forEach(doc => {
            const match = doc.data();
            
            // Count votes
            totalVotes += match.totalVotes || 0;
            
            // Count match statuses
            if (match.status === 'completed') completedMatches++;
            if (match.status === 'live') liveMatches++;
            if (match.status === 'upcoming') upcomingMatches++;
            
            // Only analyze completed matches with votes
            if (match.totalVotes > 0) {
                // Track highest vote match
                if (!highestVoteMatch || match.totalVotes > highestVoteMatch.totalVotes) {
                    highestVoteMatch = {
                        matchId: match.matchId,
                        round: match.round,
                        song1: match.song1.shortTitle,
                        song2: match.song2.shortTitle,
                        totalVotes: match.totalVotes,
                        song1Votes: match.song1.votes,
                        song2Votes: match.song2.votes
                    };
                }
                
                // Track closest match
                const song1Percent = (match.song1.votes / match.totalVotes) * 100;
                const diff = Math.abs(50 - song1Percent);
                
                if (!closestMatch || diff < closestMatch.diff) {
                    closestMatch = {
                        matchId: match.matchId,
                        round: match.round,
                        song1: match.song1.shortTitle,
                        song2: match.song2.shortTitle,
                        diff: diff,
                        voteDiff: Math.abs(match.song1.votes - match.song2.votes),
                        song1Percent: song1Percent,
                        song2Percent: 100 - song1Percent,
                        totalVotes: match.totalVotes
                    };
                }
                
                // Track biggest blowout
                if (!biggestBlowout || diff > biggestBlowout.diff) {
                    biggestBlowout = {
                        matchId: match.matchId,
                        round: match.round,
                        song1: match.song1.shortTitle,
                        song2: match.song2.shortTitle,
                        diff: diff,
                        winner: song1Percent > 50 ? match.song1.shortTitle : match.song2.shortTitle,
                        loser: song1Percent < 50 ? match.song1.shortTitle : match.song2.shortTitle,
                        winnerPercent: Math.max(song1Percent, 100 - song1Percent),
                        loserPercent: Math.min(song1Percent, 100 - song1Percent),
                        totalVotes: match.totalVotes
                    };
                }
            }
        });
        
        return {
            totalVotes,
            completedMatches,
            liveMatches,
            upcomingMatches,
            totalMatches: matchesSnap.size,
            highestVoteMatch,
            closestMatch,
            biggestBlowout
        };
        
    } catch (error) {
        console.error('Error getting tournament overview:', error);
        return null;
    }
}

// ========================================
// ALL-TIME SONG RANKINGS
// ========================================

/**
 * Get all-time rankings across all tournaments
 * (For now, just current tournament - can expand later)
 */
export async function getAllTimeSongRankings(tournamentId) {
    try {
        const matchesRef = collection(db, `tournaments/${tournamentId}/matches`);
        const matchesSnap = await getDocs(matchesRef);
        
        const songStats = {};
        
        // Aggregate stats for each song
        matchesSnap.forEach(doc => {
            const match = doc.data();
            
            // Process song1
            if (match.song1.id !== 'TBD') {
                const id = match.song1.id;
                if (!songStats[id]) {
                    songStats[id] = {
                        id,
                        seed: match.song1.seed,
                        name: match.song1.shortTitle,
                        artist: match.song1.artist,
                        totalVotes: 0,
                        wins: 0,
                        losses: 0,
                        matchesPlayed: 0
                    };
                }
                
                songStats[id].totalVotes += match.song1.votes || 0;
                songStats[id].matchesPlayed++;
                
                if (match.winnerId === 'song1') {
                    songStats[id].wins++;
                } else if (match.winnerId === 'song2') {
                    songStats[id].losses++;
                }
            }
            
            // Process song2
            if (match.song2.id !== 'TBD') {
                const id = match.song2.id;
                if (!songStats[id]) {
                    songStats[id] = {
                        id,
                        seed: match.song2.seed,
                        name: match.song2.shortTitle,
                        artist: match.song2.artist,
                        totalVotes: 0,
                        wins: 0,
                        losses: 0,
                        matchesPlayed: 0
                    };
                }
                
                songStats[id].totalVotes += match.song2.votes || 0;
                songStats[id].matchesPlayed++;
                
                if (match.winnerId === 'song2') {
                    songStats[id].wins++;
                } else if (match.winnerId === 'song1') {
                    songStats[id].losses++;
                }
            }
        });
        
        // Convert to array and calculate win percentages
        const rankings = Object.values(songStats).map(song => ({
            ...song,
            winRate: song.matchesPlayed > 0 
                ? Math.round((song.wins / song.matchesPlayed) * 100) 
                : 0,
            winRecord: `${song.wins}-${song.losses}`
        }));
        
        // Sort by total votes (most popular)
        rankings.sort((a, b) => b.totalVotes - a.totalVotes);
        
        return rankings;
        
    } catch (error) {
        console.error('Error getting song rankings:', error);
        return [];
    }
}

// ========================================
// UPSET TRACKER
// ========================================

/**
 * Find all upsets (lower seed beat higher seed)
 */
export async function getUpsets(tournamentId) {
    try {
        const matchesRef = collection(db, `tournaments/${tournamentId}/matches`);
        const matchesSnap = await getDocs(matchesRef);
        
        const upsets = [];
        
        matchesSnap.forEach(doc => {
            const match = doc.data();
            
            // Only completed matches
            if (match.status !== 'completed' || !match.winnerId) return;
            
            const song1Seed = match.song1.seed;
            const song2Seed = match.song2.seed;
            
            // Check if lower seed won
            let isUpset = false;
            let upsetWinner, upsetLoser, seedDiff;
            
            if (match.winnerId === 'song1' && song1Seed > song2Seed) {
                // Song1 won but was lower seed (higher number)
                isUpset = true;
                upsetWinner = match.song1;
                upsetLoser = match.song2;
                seedDiff = song1Seed - song2Seed;
            } else if (match.winnerId === 'song2' && song2Seed > song1Seed) {
                // Song2 won but was lower seed
                isUpset = true;
                upsetWinner = match.song2;
                upsetLoser = match.song1;
                seedDiff = song2Seed - song1Seed;
            }
            
            if (isUpset) {
                const winnerPercent = (upsetWinner.votes / match.totalVotes) * 100;
                
                upsets.push({
                    matchId: match.matchId,
                    round: match.round,
                    winner: upsetWinner.shortTitle,
                    winnerSeed: upsetWinner.seed,
                    loser: upsetLoser.shortTitle,
                    loserSeed: upsetLoser.seed,
                    seedDiff,
                    winnerPercent: Math.round(winnerPercent),
                    loserPercent: Math.round(100 - winnerPercent),
                    totalVotes: match.totalVotes,
                    voteDiff: Math.abs(upsetWinner.votes - upsetLoser.votes)
                });
            }
        });
        
        // Sort by seed difference (biggest upsets first)
        upsets.sort((a, b) => b.seedDiff - a.seedDiff);
        
        return upsets;
        
    } catch (error) {
        console.error('Error getting upsets:', error);
        return [];
    }
}

// ========================================
// PARTICIPATION STATS
// ========================================

/**
 * Get voting participation statistics
 */
export async function getParticipationStats() {
    try {
        const votesRef = collection(db, 'votes');
        const votesSnap = await getDocs(votesRef);
        
        const uniqueUsers = new Set();
        const votingDays = new Set();
        const votingHours = {};
        const roundVotes = {};
        
        votesSnap.forEach(doc => {
            const vote = doc.data();
            
            // Count unique users
            if (vote.userId) {
                uniqueUsers.add(vote.userId);
            }
            
            // Count voting days
            if (vote.timestamp) {
                const date = new Date(vote.timestamp);
                const dayKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
                votingDays.add(dayKey);
                
                // Count voting hours
                const hour = date.getHours();
                votingHours[hour] = (votingHours[hour] || 0) + 1;
            }
            
            // Count votes per round
            if (vote.round) {
                roundVotes[vote.round] = (roundVotes[vote.round] || 0) + 1;
            }
        });
        
        // Find peak voting hour
        let peakHour = 0;
        let peakHourVotes = 0;
        Object.entries(votingHours).forEach(([hour, count]) => {
            if (count > peakHourVotes) {
                peakHour = parseInt(hour);
                peakHourVotes = count;
            }
        });
        
        return {
            totalVotes: votesSnap.size,
            uniqueVoters: uniqueUsers.size,
            votingDays: votingDays.size,
            averageVotesPerUser: uniqueUsers.size > 0 
                ? Math.round(votesSnap.size / uniqueUsers.size * 10) / 10 
                : 0,
            peakHour,
            peakHourVotes,
            votingHours,
            roundVotes
        };
        
    } catch (error) {
        console.error('Error getting participation stats:', error);
        return null;
    }
}

// ========================================
// SEED PERFORMANCE
// ========================================

/**
 * Analyze how different seed ranges performed
 */
export async function getSeedPerformance(tournamentId) {
    try {
        const matchesRef = collection(db, `tournaments/${tournamentId}/matches`);
        const matchesSnap = await getDocs(matchesRef);
        
        const seedRanges = {
            '1-10': { wins: 0, losses: 0 },
            '11-20': { wins: 0, losses: 0 },
            '21-40': { wins: 0, losses: 0 },
            '41-64': { wins: 0, losses: 0 }
        };
        
        function getSeedRange(seed) {
            if (seed <= 10) return '1-10';
            if (seed <= 20) return '11-20';
            if (seed <= 40) return '21-40';
            return '41-64';
        }
        
        matchesSnap.forEach(doc => {
            const match = doc.data();
            
            if (match.status !== 'completed' || !match.winnerId) return;
            
            const song1Range = getSeedRange(match.song1.seed);
            const song2Range = getSeedRange(match.song2.seed);
            
            if (match.winnerId === 'song1') {
                seedRanges[song1Range].wins++;
                seedRanges[song2Range].losses++;
            } else {
                seedRanges[song2Range].wins++;
                seedRanges[song1Range].losses++;
            }
        });
        
        // Calculate win percentages
        Object.keys(seedRanges).forEach(range => {
            const total = seedRanges[range].wins + seedRanges[range].losses;
            seedRanges[range].winRate = total > 0 
                ? Math.round((seedRanges[range].wins / total) * 100) 
                : 0;
            seedRanges[range].total = total;
        });
        
        return seedRanges;
        
    } catch (error) {
        console.error('Error getting seed performance:', error);
        return null;
    }
}

// ========================================
// HEAD-TO-HEAD MATCHUP CHECK
// ========================================

/**
 * Check if two songs have faced each other
 * @param {string} tournamentId - Tournament ID
 * @param {number} seed1 - First song's seed
 * @param {number} seed2 - Second song's seed
 */
export async function getHeadToHeadMatchup(tournamentId, seed1, seed2) {
    try {
        const matchesRef = collection(db, `tournaments/${tournamentId}/matches`);
        const matchesSnap = await getDocs(matchesRef);
        
        let directMatchup = null;
        
        matchesSnap.forEach(doc => {
            const match = doc.data();
            
            // Check if both songs are in this match
            const hasBoth = (match.song1?.seed === seed1 && match.song2?.seed === seed2) ||
                           (match.song1?.seed === seed2 && match.song2?.seed === seed1);
            
            if (hasBoth && match.status === 'completed') {
                const song1Data = match.song1.seed === seed1 ? match.song1 : match.song2;
                const song2Data = match.song1.seed === seed2 ? match.song1 : match.song2;
                
                directMatchup = {
                    round: match.round,
                    song1Votes: song1Data.votes,
                    song2Votes: song2Data.votes,
                    totalVotes: match.totalVotes,
                    winner: match.winnerId === 'song1' 
                        ? (match.song1.seed === seed1 ? seed1 : seed2)
                        : (match.song2.seed === seed1 ? seed1 : seed2),
                    date: match.date
                };
            }
        });
        
        return directMatchup;
        
    } catch (error) {
        console.error('Error checking head-to-head matchup:', error);
        return null;
    }
}