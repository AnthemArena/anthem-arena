// ========================================
// SHARE STATS (UPDATED WITH IMAGE GENERATION)
// ========================================

async function shareStats() {
    const totalVotes = allVotes.length;
    const underdogPicks = allVotes.filter(v => v.voteType === 'underdog').length;
    const mainstreamPicks = allVotes.filter(v => v.voteType === 'mainstream').length;
    
    const majorityAlignment = totalVotes > 0 
        ? Math.round((mainstreamPicks / totalVotes) * 100) 
        : 0;
    
    const tasteProfile = getTasteProfile(majorityAlignment, totalVotes, underdogPicks);
    const journeyStats = calculateJourneyStats();
    const votingStreak = calculateVotingStreak();
    const supportImpact = calculateSupportImpact();
    const favoriteSongs = getSongPreferences();
    const favoriteSong = favoriteSongs[0];
    
    // Prepare stats data for image generation
    const statsData = {
        totalVotes: totalVotes,
        underdogPicks: underdogPicks,
        mainstreamPicks: mainstreamPicks,
        songsStillAlive: journeyStats.songsStillAlive,
        votingStreak: votingStreak,
        roundsParticipated: supportImpact.roundsParticipated,
        tasteProfile: {
            icon: tasteProfile.icon,
            title: tasteProfile.title,
            description: tasteProfile.description
        },
        favoriteSong: favoriteSong ? {
            name: favoriteSong.name,
            thumbnailUrl: `https://img.youtube.com/vi/${favoriteSong.videoId}/mqdefault.jpg`,
            voteCount: favoriteSong.count
        } : null
    };
    
    // Call the image generator
    if (window.generateAndShareStats) {
        await window.generateAndShareStats(statsData);
    } else {
        console.error('❌ Stats image generator not loaded');
        alert('Stats image generator not available. Please refresh the page.');
    }
}

window.shareStats = shareStats;