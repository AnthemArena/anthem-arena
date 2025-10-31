// ========================================
// MY VOTES PAGE - LEAGUE MUSIC TOURNAMENT
// ========================================

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

// State
let userId = null;
let allVotes = [];
let currentFilter = 'all';

// ========================================
// INITIALIZE
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🗳️ My Votes page loaded');
    
    // Get user ID
    userId = await getUserId();
    console.log('👤 User ID:', userId);
    
    // Load vote history
    await loadVoteHistory();
    
    // Setup filters
    setupFilters();
});

// ========================================
// GET USER ID
// ========================================

async function getUserId() {
    // Check localStorage first
    const stored = localStorage.getItem('tournamentUserId');
    if (stored) {
        console.log('🆔 Using stored user ID');
        return stored;
    }
    
    console.log('🆔 Generating new user ID...');
    
    // Get IP address
    let ipAddress = 'unknown';
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ipAddress = data.ip;
    } catch (error) {
        console.warn('⚠️ Could not get IP address');
    }
    
    // Generate browser fingerprint
    const fingerprint = generateBrowserFingerprint();
    
    // Combine and hash
    const combined = `${ipAddress}_${fingerprint}_salt2025`;
    const newUserId = btoa(combined).substring(0, 32);
    
    // Store it
    localStorage.setItem('tournamentUserId', newUserId);
    
    return newUserId;
}

function generateBrowserFingerprint() {
    const components = [
        navigator.userAgent,
        navigator.language,
        navigator.platform,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        !!window.sessionStorage,
        !!window.localStorage,
        navigator.hardwareConcurrency || 0
    ].join('|');
    
    return btoa(components).substring(0, 16);
}

// ========================================
// LOAD VOTE HISTORY
// ========================================

async function loadVoteHistory() {
    try {
        console.log('📥 Loading vote history for user:', userId);
        
        // Query votes collection for this user
        const votesRef = collection(db, 'votes');
        const userVotesQuery = query(
            votesRef,
            where('userId', '==', userId)
        );
        
        const votesSnapshot = await getDocs(userVotesQuery);
        
        if (votesSnapshot.empty) {
            showNoVotesState();
            return;
        }
        
        console.log(`✅ Found ${votesSnapshot.size} votes`);
        
        // Get all vote data with match details
        const votePromises = votesSnapshot.docs.map(async (voteDoc) => {
            const voteData = voteDoc.data();
            
            // Get match details
const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, voteData.matchId);
            const matchDoc = await getDoc(matchRef);
            
            if (!matchDoc.exists()) {
                console.warn('⚠️ Match not found:', voteData.matchId);
                return null;
            }
            
            const matchData = matchDoc.data();
            
            // Determine if this was an underdog pick or mainstream pick
            const votedForSong = voteData.choice; // 'song1' or 'song2'
            const song1Votes = matchData.song1.votes || 0;
            const song2Votes = matchData.song2.votes || 0;
            const totalMatchVotes = song1Votes + song2Votes;
            
            const votedSongVotes = votedForSong === 'song1' ? song1Votes : song2Votes;
            const votedSongPercentage = totalMatchVotes > 0 
                ? Math.round((votedSongVotes / totalMatchVotes) * 100) 
                : 50;
            
            // Categorize vote type
            let voteType = 'balanced';
            if (votedSongPercentage < 40) {
                voteType = 'underdog'; // Voted for the less popular song
            } else if (votedSongPercentage > 60) {
                voteType = 'mainstream'; // Voted for the more popular song
            } else {
                voteType = 'closeCall'; // Close match (40-60%)
            }
            
            const isCompleted = matchData.status === 'completed';
            const status = isCompleted ? 'completed' : 'live';
            
            return {
                id: voteDoc.id,
                matchId: voteData.matchId,
                choice: votedForSong,
                timestamp: voteData.timestamp,
                round: voteData.round || 1,
                votedForSeed: voteData.votedForSeed,
                votedForName: voteData.votedForName,
                match: matchData,
                voteType: voteType,
                votedSongPercentage: votedSongPercentage,
                status: status,
                isCompleted: isCompleted
            };
        });
        
        allVotes = (await Promise.all(votePromises)).filter(v => v !== null);
        
        // Sort by timestamp (newest first)
        allVotes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        console.log('✅ Vote history loaded:', allVotes.length);
        
        // Update stats
        updateStats();
        
        // Display votes
        displayVotes();
        
        // Hide loading state
        document.getElementById('loadingState').style.display = 'none';
        
    } catch (error) {
        console.error('❌ Error loading vote history:', error);
        document.getElementById('loadingState').innerHTML = `
            <div class="no-votes-icon">⚠️</div>
            <h3>Error Loading History</h3>
            <p>Could not load your vote history. Please try again later.</p>
        `;
    }
}

// ========================================
// UPDATE STATS
// ========================================

function updateStats() {
    const totalVotes = allVotes.length;
    const completedVotes = allVotes.filter(v => v.isCompleted);
    const liveVotes = allVotes.filter(v => !v.isCompleted);
    
    // Categorize votes
    const underdogPicks = allVotes.filter(v => v.voteType === 'underdog').length;
    const mainstreamPicks = allVotes.filter(v => v.voteType === 'mainstream').length;
    const closeCallPicks = allVotes.filter(v => v.voteType === 'closeCall').length;
    
    // Calculate majority alignment (for taste profile)
    const majorityAlignment = totalVotes > 0 
        ? Math.round((mainstreamPicks / totalVotes) * 100) 
        : 0;
    
    // Calculate voting streak (consecutive days)
    const votingStreak = calculateVotingStreak();
    
    // Get artist preferences
    const artistPreferences = getArtistPreferences();
    const favoriteArtist = artistPreferences[0];
    
    // Update DOM
    document.getElementById('totalVotes').textContent = totalVotes;
    document.getElementById('underdogPicks').textContent = underdogPicks;
    document.getElementById('mainstreamPicks').textContent = mainstreamPicks;
    document.getElementById('votingStreak').textContent = votingStreak;
    
    // Update filter counts
    document.getElementById('countAll').textContent = totalVotes;
    document.getElementById('countUnderdog').textContent = underdogPicks;
    document.getElementById('countMainstream').textContent = mainstreamPicks;
    document.getElementById('countLive').textContent = liveVotes.length;
    
    // Determine taste profile
    const tasteProfile = getTasteProfile(majorityAlignment, totalVotes, underdogPicks);
    
    // Show achievement badge
    showAchievementBadge(tasteProfile, totalVotes, underdogPicks, mainstreamPicks, votingStreak, favoriteArtist);
    
    console.log('📊 Stats:', { 
        totalVotes, 
        underdogPicks,
        mainstreamPicks,
        closeCallPicks,
        majorityAlignment, 
        votingStreak,
        tasteProfile,
        favoriteArtist
    });
}

// ========================================
// CALCULATE VOTING STREAK
// ========================================

function calculateVotingStreak() {
    if (allVotes.length === 0) return 0;
    
    // Get unique voting days
    const votingDays = [...new Set(allVotes.map(v => {
        const date = new Date(v.timestamp);
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }))].sort().reverse();
    
    if (votingDays.length === 0) return 0;
    
    // Check for consecutive days
    let streak = 1;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    
    // If no vote today, check if voted yesterday
    let checkDate = votingDays[0] === todayStr ? new Date() : new Date(Date.now() - 86400000);
    
    for (let i = 0; i < votingDays.length - 1; i++) {
        const currentDay = new Date(votingDays[i]);
        const nextDay = new Date(votingDays[i + 1]);
        
        const dayDiff = Math.floor((currentDay - nextDay) / 86400000);
        
        if (dayDiff === 1) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}

// ========================================
// GET ARTIST PREFERENCES
// ========================================

function getArtistPreferences() {
    const artistCounts = {};
    
    allVotes.forEach(vote => {
        const match = vote.match;
        const votedSong = vote.choice === 'song1' ? match.song1 : match.song2;
        const artist = votedSong.artist || 'Unknown';
        
        artistCounts[artist] = (artistCounts[artist] || 0) + 1;
    });
    
    // Sort by count
    return Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([artist, count]) => ({ artist, count }));
}

// ========================================
// GET TASTE PROFILE
// ========================================

function getTasteProfile(majorityAlignment, totalVotes, underdogPicks) {
    if (totalVotes < 5) {
        return {
            icon: '🎵',
            title: 'New Voter',
            description: 'Just getting started - vote more to unlock your taste profile!'
        };
    }
    
    // Prioritize underdog picks for profile
    const underdogPercentage = Math.round((underdogPicks / totalVotes) * 100);
    
    if (underdogPercentage >= 40) {
        return {
            icon: '🎭',
            title: 'Rebel Voter',
            description: `You champion the underdog ${underdogPercentage}% of the time!`
        };
    } else if (majorityAlignment >= 70) {
        return {
            icon: '🎯',
            title: 'Mainstream Maven',
            description: `Your taste aligns with the crowd ${majorityAlignment}% of the time`
        };
    } else if (majorityAlignment >= 55) {
        return {
            icon: '⚖️',
            title: 'Balanced Critic',
            description: 'You have your own taste but appreciate popular picks too'
        };
    } else if (underdogPercentage >= 25) {
        return {
            icon: '🎸',
            title: 'Independent Voter',
            description: 'You march to the beat of your own drum'
        };
    } else {
        return {
            icon: '🎵',
            title: 'Music Enthusiast',
            description: 'You appreciate all kinds of League music'
        };
    }
}

// ========================================
// SHOW ACHIEVEMENT BADGE
// ========================================

function showAchievementBadge(tasteProfile, totalVotes, underdogPicks, mainstreamPicks, votingStreak, favoriteArtist) {
    const badge = document.getElementById('achievementBadge');
    const title = document.getElementById('badgeTitle');
    const description = document.getElementById('badgeDescription');
    
    // Determine primary badge to show
    let badgeData = null;
    
    // Priority: Special achievements > Taste profile
    if (votingStreak >= 7) {
        badgeData = {
            title: '🔥 Week Warrior',
            description: `${votingStreak} days voting streak! You're incredibly dedicated!`
        };
    } else if (underdogPicks >= 10) {
        badgeData = {
            title: '🎭 Underdog Champion',
            description: `You've voted for the underdog ${underdogPicks} times! True rebel!`
        };
    } else if (votingStreak >= 5) {
        badgeData = {
            title: '🔥 Hot Streak',
            description: `${votingStreak} days of voting in a row!`
        };
    } else if (totalVotes >= 30) {
        badgeData = {
            title: '🗳️ Super Voter',
            description: `${totalVotes} votes cast! You're incredibly active!`
        };
    } else if (favoriteArtist && favoriteArtist.count >= 5) {
        badgeData = {
            title: `🎸 ${favoriteArtist.artist} Superfan`,
            description: `You've voted for ${favoriteArtist.artist} ${favoriteArtist.count} times!`
        };
    } else if (underdogPicks >= 5) {
        badgeData = {
            title: '🎭 Underdog Supporter',
            description: `${underdogPicks} underdog picks! You support the underdogs!`
        };
    } else if (totalVotes >= 20) {
        badgeData = {
            title: '🎵 Dedicated Fan',
            description: `${totalVotes} votes and counting!`
        };
    } else if (totalVotes >= 10) {
        badgeData = {
            title: `${tasteProfile.icon} ${tasteProfile.title}`,
            description: tasteProfile.description
        };
    } else if (totalVotes >= 5) {
        badgeData = {
            title: '🎵 Music Enthusiast',
            description: `${totalVotes} votes cast - keep going!`
        };
    }
    
    if (badgeData) {
        title.textContent = badgeData.title;
        description.textContent = badgeData.description;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// ========================================
// DISPLAY VOTES
// ========================================

function displayVotes() {
    const grid = document.getElementById('votesGrid');
    
    // Filter votes based on current filter
    let filteredVotes = allVotes;
    if (currentFilter === 'underdog') {
        filteredVotes = allVotes.filter(v => v.voteType === 'underdog');
    } else if (currentFilter === 'mainstream') {
        filteredVotes = allVotes.filter(v => v.voteType === 'mainstream');
    } else if (currentFilter === 'live') {
        filteredVotes = allVotes.filter(v => !v.isCompleted);
    }
    
    if (filteredVotes.length === 0) {
        grid.innerHTML = `
            <div class="no-votes-state">
                <div class="no-votes-icon">🔍</div>
                <h3>No ${currentFilter} votes found</h3>
                <p>Try a different filter</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredVotes.map(vote => createVoteCard(vote)).join('');
}

// ========================================
// CREATE VOTE CARD
// ========================================

function createVoteCard(vote) {
    const match = vote.match;
    const song1 = match.song1;
    const song2 = match.song2;
    
    // Determine which song user voted for
    const votedSong = vote.choice === 'song1' ? song1 : song2;
    const opponentSong = vote.choice === 'song1' ? song2 : song1;
    
    // Status icon based on vote type
    const statusIcon = {
        'underdog': '🎭',
        'mainstream': '🎯',
        'closeCall': '⚖️'
    }[vote.voteType] || '🗳️';
    
    // Vote type label
    const voteTypeLabel = {
        'underdog': 'Underdog Pick',
        'mainstream': 'Mainstream Pick',
        'closeCall': 'Close Call'
    }[vote.voteType] || 'Your Vote';
    
    // Current percentage
    const percentage = vote.votedSongPercentage;
    
    // Format timestamp
    const timestamp = new Date(vote.timestamp);
    const timeAgo = getTimeAgo(timestamp);
    
    // Get round name
    const roundName = getRoundName(vote.round);
    
    // Get tournament name
    const tournamentName = match.tournamentName || 'All Music Championship 2025';
    
    // Determine card class
    const cardClass = vote.voteType;
    const statusClass = vote.isCompleted ? 'completed' : 'live';
    
    return `
        <div class="vote-card ${cardClass} ${statusClass}" data-type="${vote.voteType}">
            <div class="vote-status">${statusIcon}</div>
            
            <div class="vote-matchup">
                <img 
                    src="https://img.youtube.com/vi/${votedSong.videoId}/mqdefault.jpg" 
                    alt="${votedSong.shortTitle}" 
                    class="vote-thumbnail"
                    loading="lazy">
                
                <div class="vote-details">
                    <div class="vote-round">${tournamentName} • ${roundName}</div>
                    <h3 class="vote-title">
                        ${song1.shortTitle} <span style="color: rgba(255,255,255,0.4);">vs</span> ${song2.shortTitle}
                    </h3>
                    <p class="vote-choice">
                        You voted for: <strong>${votedSong.shortTitle}</strong>
                    </p>
                    <div class="vote-timestamp">${timeAgo}</div>
                </div>
            </div>
            
            <div class="vote-result">
                <div class="vote-percentage">${percentage}%</div>
                <div class="vote-type-label">${voteTypeLabel}</div>
                <div class="vote-status-label">${vote.isCompleted ? 'Completed' : 'Live'}</div>
                <a href="/vote.html?id=${vote.matchId}" class="view-match-btn">View Match →</a>
            </div>
        </div>
    `;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function getRoundName(roundNumber) {
    const roundNames = {
        1: 'Round 1',
        2: 'Round 2',
        3: 'Round 3 (Sweet 16)',
        4: 'Quarterfinals',
        5: 'Semifinals',
        6: 'Finals'
    };
    return roundNames[roundNumber] || `Round ${roundNumber}`;
}

function getTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ========================================
// SETUP FILTERS
// ========================================

function setupFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all
            filterButtons.forEach(b => b.classList.remove('active'));
            
            // Add active to clicked
            btn.classList.add('active');
            
            // Update filter
            currentFilter = btn.dataset.filter;
            
            // Re-display votes
            displayVotes();
            
            console.log('🔍 Filter changed to:', currentFilter);
        });
    });
}

// ========================================
// SHOW NO VOTES STATE
// ========================================

function showNoVotesState() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('noVotesState').style.display = 'block';
    
    // Hide stats
    document.querySelector('.stats-overview').style.display = 'none';
    document.querySelector('.filters-section').style.display = 'none';
}

// ========================================
// SHARE STATS
// ========================================

function shareStats() {
    const totalVotes = allVotes.length;
    const underdogPicks = allVotes.filter(v => v.voteType === 'underdog').length;
    const mainstreamPicks = allVotes.filter(v => v.voteType === 'mainstream').length;
    
    const majorityAlignment = totalVotes > 0 
        ? Math.round((mainstreamPicks / totalVotes) * 100) 
        : 0;
    
    const tasteProfile = getTasteProfile(majorityAlignment, totalVotes, underdogPicks);
    
    const artistPreferences = getArtistPreferences();
    const favoriteArtist = artistPreferences[0];
    
    // Generate share text
    let shareText = `🎵 My League Music Tournament Profile:\n\n` +
        `🗳️ ${totalVotes} votes cast\n` +
        `${tasteProfile.icon} ${tasteProfile.title}\n`;
    
    if (underdogPicks > 0) {
        shareText += `🎭 ${underdogPicks} underdog picks\n`;
    }
    
    if (favoriteArtist) {
        shareText += `🎸 Favorite: ${favoriteArtist.artist}\n`;
    }
    
    shareText += `\nVote for your favorite League music videos!`;
    
    // Update share preview
    document.getElementById('sharePreview').innerHTML = shareText.replace(/\n/g, '<br>');
    
    // Store for sharing
    window.currentShareText = shareText;
    
    // Show modal
    document.getElementById('shareModal').style.display = 'flex';
}

window.shareStats = shareStats;

function closeShareModal() {
    document.getElementById('shareModal').style.display = 'none';
}

window.closeShareModal = closeShareModal;

// ========================================
// SHARE FUNCTIONS
// ========================================

function shareToTwitter() {
    const text = encodeURIComponent(window.currentShareText);
    const url = encodeURIComponent(window.location.origin);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}

window.shareToTwitter = shareToTwitter;

function shareToFacebook() {
    const url = encodeURIComponent(window.location.origin);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
}

window.shareToFacebook = shareToFacebook;

function copyShareText() {
    navigator.clipboard.writeText(window.currentShareText).then(() => {
        showNotification('Stats copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('Failed to copy', 'error');
    });
}

window.copyShareText = copyShareText;

// ========================================
// NOTIFICATION
// ========================================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const colors = {
        success: '#00c896',
        error: '#ff4444',
        info: '#4a9eff'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${colors[type]};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        font-family: 'Lora', serif;
        font-weight: 600;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

console.log('✅ My Votes page initialized');