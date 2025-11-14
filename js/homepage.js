// ========================================
// IMPORTS
// ========================================
import { getBookForSong } from './bookMappings.js';
import { getAllMatches } from './api-client.js';
import './youtube-playlist.js';

import { db } from './firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createMatchCard } from './match-card-renderer.js';

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

// ========================================
// STATE
// ========================================
let currentMatch = null;
let voteState = {
    leftVotes: 0,
    rightVotes: 0,
    totalVotes: 0,
    userVote: null
};
let musicVideos = [];
let countdownInterval = null;

// ========================================
// INITIALIZE ON PAGE LOAD
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.time('⏱️ Total Homepage Load');
    console.log('🎵 League Music Tournament loaded');
    
    try {
        showHomepageLoading();
        
        console.time('⏱️ Music Videos');
        await loadMusicVideos();
        console.timeEnd('⏱️ Music Videos');
        
        console.time('⏱️ Fetch All Matches');
        const allMatches = await getAllMatches();
        console.timeEnd('⏱️ Fetch All Matches');
        
        console.time('⏱️ Tournament Info');
        await loadTournamentInfo(allMatches);
        console.timeEnd('⏱️ Tournament Info');
        
        console.time('⏱️ Featured Match');
        await loadFeaturedMatch(allMatches);
        console.timeEnd('⏱️ Featured Match');
        
        console.time('⏱️ Your Active Votes');
        await loadYourActiveVotes(allMatches);
        console.timeEnd('⏱️ Your Active Votes');
        
        console.time('⏱️ Live Matches');
        await loadLiveMatches(allMatches);
        console.timeEnd('⏱️ Live Matches');
        
        console.time('⏱️ Recent Results');
        await loadRecentResults(allMatches);
        console.timeEnd('⏱️ Recent Results');
        
        console.time('⏱️ Next Match Countdown');
        await loadNextMatchCountdown(allMatches);
        console.timeEnd('⏱️ Next Match Countdown');
        
        // ✅ MOVED: Hide champions and show sections FIRST
        hideChampionsSection();
        hideHomepageLoading();
        showHomepageSections();
        
        // ✅ NOW update hero stats (after sections are visible)
        console.time('⏱️ Hero Stats');
        await updateHeroStats(allMatches);
        console.timeEnd('⏱️ Hero Stats');
        
        console.timeEnd('⏱️ Total Homepage Load');
        
    } catch (error) {
        console.error('❌ Error loading homepage:', error);
        hideHomepageLoading();
        showHomepageError(error);
    }
});

// ========================================
// VOTE TRACKING HELPERS
// ========================================
function hasUserVoted(matchId) {
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    return !!userVotes[matchId];
}

function getUserVotedSongId(matchId) {
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    return userVotes[matchId]?.songId || null;
}

// ========================================
// LOAD MUSIC VIDEOS DATA
// ========================================
async function loadMusicVideos() {
    try {
        const response = await fetch('/data/music-videos.json');
        musicVideos = await response.json();
        console.log('✅ Music videos loaded:', musicVideos.length);
    } catch (error) {
        console.error('❌ Error loading music videos:', error);
    }
}

// ========================================
// UPDATE HERO STATS
// ========================================
async function updateHeroStats(allMatches) {
    try {
        console.log('🔍 updateHeroStats STARTED');
        
        // ✅ Fetch founding member milestone data FIRST
        const { getTotalVotes } = await import('./api-client.js');
        console.log('✅ getTotalVotes imported');
        
        const totalVotesData = await getTotalVotes();
        console.log('📊 totalVotesData received:', totalVotesData);
        
        const foundingMemberProgress = totalVotesData.totalVotes || 0;
        const milestoneReached = totalVotesData.milestoneReached || false;
        
        console.log(`👑 Milestone check: ${foundingMemberProgress}/1,000 (reached: ${milestoneReached})`);
        
        // ✅ Add milestone banner if not reached
        if (!milestoneReached) {
            console.log('🎯 Milestone NOT reached - attempting to display banner...');
            
            const heroSection = document.getElementById('heroSection');
            console.log('🔍 heroSection found:', !!heroSection);
            
            const heroStats = heroSection?.querySelector('.hero-stats');
            console.log('🔍 heroStats found:', !!heroStats);
            
            const existingBanner = document.querySelector('.founding-member-milestone');
            console.log('🔍 existing banner:', !!existingBanner);
            
            if (heroStats && !existingBanner) {
                console.log('✅ DOM ready - injecting milestone HTML...');
                
                const milestoneHTML = `
                    <div class="founding-member-milestone" style="background: red; padding: 20px; color: white; font-size: 24px;">
                        <div class="milestone-content">
                            <span class="milestone-icon">👑</span>
                            <div class="milestone-info">
                                <span class="milestone-label">Founding Member Challenge</span>
                                <span class="milestone-progress-text">
                                    <strong>${foundingMemberProgress.toLocaleString()}/1,000</strong> votes • 
                                    Vote now to earn your badge!
                                </span>
                            </div>
                            <div class="milestone-bar">
                                <div class="milestone-fill" style="width: ${(foundingMemberProgress/1000)*100}%; background: yellow; height: 20px;"></div>
                            </div>
                        </div>
                    </div>
                `;
                
                heroStats.insertAdjacentHTML('beforebegin', milestoneHTML);
                console.log(`✅ Founding Member milestone HTML INJECTED`);
                
                // Verify it was added
                const addedBanner = document.querySelector('.founding-member-milestone');
                console.log('🔍 Banner now in DOM:', !!addedBanner);
            } else {
                console.error('❌ Cannot display milestone:', {
                    heroStatsExists: !!heroStats,
                    bannerAlreadyExists: !!existingBanner
                });
            }
        } else {
            console.log('ℹ️ Milestone already reached - not displaying banner');
        }
        
        // ✅ CONTINUE WITH EXISTING CODE
        const totalVideosEl = document.getElementById('totalVideos');
        if (totalVideosEl) {
            totalVideosEl.textContent = musicVideos.length;
        }
        
        let totalVotes = 0;
        let activeMatches = 0;
        
        allMatches.forEach(match => {
            totalVotes += (match.totalVotes || 0);
            if (match.status === 'live') activeMatches++;
        });
        
        const totalVotesEl = document.getElementById('totalVotes');
        const matchesLeftEl = document.getElementById('matchesLeft');
        
        if (totalVotesEl) {
            totalVotesEl.textContent = totalVotes.toLocaleString();
        }
        
        if (matchesLeftEl) {
            matchesLeftEl.textContent = activeMatches;
        }
        
        console.log('✅ Hero stats updated:', { totalVotes, activeMatches });
        
    } catch (error) {
        console.error('❌ Error updating hero stats:', error);
    }
}

// ========================================
// LOAD TOURNAMENT INFO (BADGE)
// ========================================
async function loadTournamentInfo(allMatches) {
    try {
        const liveMatches = allMatches.filter(m => m.status === 'live');
        const upcomingMatches = allMatches.filter(m => m.status === 'upcoming');
        
        const tournamentNameEl = document.getElementById('tournamentName');
        const tournamentStatusEl = document.getElementById('tournamentStatus');
        const badgeIcon = document.querySelector('.tournament-badge .badge-icon');
        
        if (!tournamentNameEl || !tournamentStatusEl) return;
        
        // SCENARIO 1: Live matches exist
        if (liveMatches.length > 0) {
            const actualLiveMatches = liveMatches.filter(match => {
                const isTBD = !match.song1?.id || !match.song2?.id ||
                             String(match.song1.id).includes('TBD') ||
                             String(match.song2.id).includes('TBD');
                return !isTBD;
            });
            
            if (actualLiveMatches.length === 1) {
                const liveMatch = actualLiveMatches[0];
                const song1 = liveMatch.song1.shortTitle || liveMatch.song1.title;
                const song2 = liveMatch.song2.shortTitle || liveMatch.song2.title;
                
                badgeIcon.textContent = '🔴';
                tournamentNameEl.textContent = 'Live Now';
                tournamentStatusEl.textContent = `${song1} vs ${song2}`;
                tournamentStatusEl.style.maxWidth = '400px';
                tournamentStatusEl.style.overflow = 'hidden';
                tournamentStatusEl.style.textOverflow = 'ellipsis';
                tournamentStatusEl.style.whiteSpace = 'nowrap';
                
                console.log(`✅ Tournament badge: ${song1} vs ${song2}`);
                return;
            } else if (actualLiveMatches.length > 1) {
                const currentRound = actualLiveMatches[0].round || 1;
                
                badgeIcon.textContent = '🔴';
                tournamentNameEl.textContent = 'Live Now';
                tournamentStatusEl.textContent = `${actualLiveMatches.length} matches • ${getRoundDisplayName(currentRound)}`;
                
                console.log(`✅ Tournament badge: ${actualLiveMatches.length} live matches`);
                return;
            }
        }
        
        // SCENARIO 2: No live matches - show next upcoming match
        if (upcomingMatches.length > 0) {
            const validUpcomingMatches = upcomingMatches.filter(match => {
                const isTBD = !match.song1?.id || !match.song2?.id ||
                             String(match.song1.id).includes('TBD') ||
                             String(match.song2.id).includes('TBD');
                return !isTBD && match.date;
            });
            
            if (validUpcomingMatches.length > 0) {
                validUpcomingMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
                
                const nextMatch = validUpcomingMatches[0];
                const song1 = nextMatch.song1.shortTitle || nextMatch.song1.title;
                const song2 = nextMatch.song2.shortTitle || nextMatch.song2.title;
                const roundName = getRoundDisplayName(nextMatch.round);
                const timeUntil = getTimeUntilMatch(nextMatch.date);
                
                badgeIcon.textContent = '⏰';
                tournamentNameEl.textContent = `${song1} vs ${song2}`;
                tournamentStatusEl.textContent = `${roundName} • Starts ${timeUntil}`;
                tournamentStatusEl.style.maxWidth = '500px';
                tournamentStatusEl.style.overflow = 'hidden';
                tournamentStatusEl.style.textOverflow = 'ellipsis';
                tournamentStatusEl.style.whiteSpace = 'nowrap';
                
                console.log(`✅ Tournament badge: Next match - ${song1} vs ${song2}`);
                return;
            }
        }
        
        // SCENARIO 3: Fallback
        badgeIcon.textContent = '🎵';
        tournamentNameEl.textContent = 'Music Tournament';
        tournamentStatusEl.textContent = 'Season 1';
        
        console.log('✅ Tournament badge: Fallback');
        
    } catch (error) {
        console.error('❌ Error loading tournament info:', error);
        const tournamentNameEl = document.getElementById('tournamentName');
        const tournamentStatusEl = document.getElementById('tournamentStatus');
        if (tournamentNameEl) tournamentNameEl.textContent = 'Music Tournament';
        if (tournamentStatusEl) tournamentStatusEl.textContent = 'Season 1';
    }
}

function getRoundDisplayName(roundNumber) {
    const roundNames = {
        1: 'Round 1',
        2: 'Round 2',
        3: 'Sweet 16',
        4: 'Quarterfinals',
        5: 'Semifinals',
        6: 'Finals'
    };
    return roundNames[roundNumber] || `Round ${roundNumber}`;
}

function getTimeUntilMatch(dateString) {
    if (!dateString) return 'soon';
    
    const matchDate = new Date(dateString);
    const now = new Date();
    const diff = matchDate - now;
    
    if (diff < 0) return 'soon';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `in ${days}d ${hours}h`;
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    if (minutes > 0) return `in ${minutes}m`;
    return 'soon';
}

// ========================================
// LOAD FEATURED MATCH (DAILY ROTATION)
// ========================================
async function loadFeaturedMatch(allMatches) {
    try {
        console.log('🔍 Searching for live matches...');
        
        let liveMatches = allMatches.filter(m => {
            if (m.status !== 'live') return false;
            const isTBD = !m.song1?.id || !m.song2?.id ||
                         String(m.song1.id).includes('TBD') ||
                         String(m.song2.id).includes('TBD');
            return !isTBD;
        });
        
        if (liveMatches.length === 0) {
            console.log('❌ No live matches found');
            hideFeaturedSection();
            return;
        }
        
        currentMatch = selectDailyFeaturedMatch(liveMatches);
        
        console.log(`✅ Featured match of the day: ${currentMatch.matchId}`);
        console.log(`   ${liveMatches.length} total live matches rotating daily`);
        
        await displayFeaturedMatch();
        
    } catch (error) {
        console.error('❌ Error loading featured match:', error);
        hideFeaturedSection();
    }
}

function selectDailyFeaturedMatch(liveMatches) {
    if (liveMatches.length === 0) return null;
    if (liveMatches.length === 1) return liveMatches[0];
    
    const today = new Date().toISOString().split('T')[0];
    const dateSeed = hashString(today);
    const index = dateSeed % liveMatches.length;
    
    console.log(`🎲 Daily featured rotation: match ${index + 1} of ${liveMatches.length}`);
    
    return liveMatches[index];
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function hideFeaturedSection() {
    const section = document.getElementById('featured-matchup');
    if (section) section.style.display = 'none';
}

function displayFeaturedMatch() {
    if (!currentMatch) return;
    
    const featuredSection = document.getElementById('featured-matchup');
    if (!featuredSection) return;
    
    const container = featuredSection.querySelector('.container');
    if (!container) return;
    
    const matchId = currentMatch.matchId || currentMatch.id;
    const userHasVoted = hasUserVoted(matchId);
    const userVotedSongId = userHasVoted ? getUserVotedSongId(matchId) : null;
    
    const totalVotes = currentMatch.totalVotes || 0;
    const song1Votes = currentMatch.song1?.votes || 0;
    const song2Votes = currentMatch.song2?.votes || 0;
    
    const song1Pct = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
    const song2Pct = totalVotes > 0 ? Math.round((song2Votes / totalVotes) * 100) : 50;
    
    const timeLeftInfo = getTimeLeftForMatch(currentMatch.endDate);
    
    container.innerHTML = `
        <div class="section-header">
            <span class="section-label">🔥 Featured Match</span>
            <h2 class="section-title">Match of the Day</h2>
            <p class="section-subtitle">
                ${userHasVoted 
                    ? `${totalVotes.toLocaleString()} votes • ${timeLeftInfo}` 
                    : `${timeLeftInfo}`
                }
            </p>
        </div>
        
        <div class="featured-match-card" onclick="voteNow('${matchId}')">
            <div class="featured-match-inner">
                <div class="featured-thumbnails">
                    <div class="thumbnail-wrapper ${userVotedSongId === 'song1' ? 'user-voted' : ''}">
                        <img src="https://img.youtube.com/vi/${currentMatch.song1.videoId}/mqdefault.jpg" 
                             alt="${currentMatch.song1.shortTitle || currentMatch.song1.title}">
                        <div class="thumbnail-overlay">
                            <span class="seed-badge">#${currentMatch.song1.seed}</span>
                            ${userVotedSongId === 'song1' ? '<span class="voted-badge">✓ Your Pick</span>' : ''}
                        </div>
                        ${userHasVoted ? `
                            <div class="thumbnail-result">
                                <span class="result-pct">${song1Pct}%</span>
                                <span class="result-votes">${song1Votes.toLocaleString()}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="featured-vs">
                        <span class="vs-badge">VS</span>
                        ${userHasVoted ? `
                            <div class="vs-progress-bar">
                                <div class="bar-fill left" style="height: ${song1Pct}%"></div>
                                <div class="bar-fill right" style="height: ${song2Pct}%"></div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="thumbnail-wrapper ${userVotedSongId === 'song2' ? 'user-voted' : ''}">
                        <img src="https://img.youtube.com/vi/${currentMatch.song2.videoId}/mqdefault.jpg" 
                             alt="${currentMatch.song2.shortTitle || currentMatch.song2.title}">
                        <div class="thumbnail-overlay">
                            <span class="seed-badge">#${currentMatch.song2.seed}</span>
                            ${userVotedSongId === 'song2' ? '<span class="voted-badge">✓ Your Pick</span>' : ''}
                        </div>
                        ${userHasVoted ? `
                            <div class="thumbnail-result">
                                <span class="result-pct">${song2Pct}%</span>
                                <span class="result-votes">${song2Votes.toLocaleString()}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="featured-info">
                    <div class="song-pair">
                        <div class="song-details">
                            <h3 class="song-title">${currentMatch.song1.shortTitle || currentMatch.song1.title}</h3>
                            <p class="song-meta">${currentMatch.song1.artist} • ${currentMatch.song1.year}</p>
                        </div>
                        
                        <div class="song-details">
                            <h3 class="song-title">${currentMatch.song2.shortTitle || currentMatch.song2.title}</h3>
                            <p class="song-meta">${currentMatch.song2.artist} • ${currentMatch.song2.year}</p>
                        </div>
                    </div>
                    
                    ${userHasVoted ? `
                        <button class="featured-cta voted" onclick="voteNow('${matchId}'); event.stopPropagation();">
                            <span class="cta-icon">📊</span>
                            <span class="cta-text">View Full Results</span>
                            <span class="cta-arrow">→</span>
                        </button>
                    ` : `
                        <button class="featured-cta" onclick="voteNow('${matchId}'); event.stopPropagation();">
                            <span class="cta-icon">🎵</span>
                            <span class="cta-text">Vote Now</span>
                            <span class="cta-arrow">→</span>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
    
    featuredSection.style.display = 'block';
    console.log('✅ Featured match rendered:', matchId);
}

function getTimeLeftForMatch(endDate) {
    if (!endDate) return '🔴 Live Now';
    
    const end = new Date(endDate);
    const now = new Date();
    const diff = end - now;
    
    if (diff <= 0) return '⏱️ Voting Closed';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `⏰ ${days}d ${hours % 24}h left`;
    } else if (hours > 0) {
        return `⏰ ${hours}h ${minutes}m left`;
    } else if (minutes > 5) {
        return `⏰ ${minutes}m left`;
    } else {
        return `🚨 ${minutes}m left - Vote now!`;
    }
}

// ========================================
// NEW: LOAD YOUR ACTIVE VOTES
// ========================================
async function loadYourActiveVotes(allMatches) {
    try {
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        const votedMatchIds = Object.keys(userVotes);
        
        if (votedMatchIds.length === 0) {
            hideYourVotesSection();
            return;
        }
        
        const activeVotedMatches = allMatches.filter(m => 
            m.status === 'live' && votedMatchIds.includes(m.matchId)
        ).slice(0, 4);
        
        if (activeVotedMatches.length === 0) {
            hideYourVotesSection();
            return;
        }
        
        console.log(`✅ Found ${activeVotedMatches.length} active votes for user`);
        displayYourActiveVotes(activeVotedMatches);
        
    } catch (error) {
        console.error('❌ Error loading your active votes:', error);
        hideYourVotesSection();
    }
}

function hideYourVotesSection() {
    const section = document.getElementById('yourVotesSection');
    if (section) section.style.display = 'none';
}

function displayYourActiveVotes(matches) {
    const section = document.getElementById('yourVotesSection');
    const grid = document.getElementById('yourVotesGrid');
    
    if (!section || !grid) return;
    
    grid.innerHTML = '';
    
    matches.forEach(match => {
        const userVotedSongId = getUserVotedSongId(match.matchId);
        const totalVotes = match.totalVotes || 0;
        
        let userSong, opponentSong, userVotes, opponentVotes;
        
        if (userVotedSongId === 'song1') {
            userSong = match.song1;
            opponentSong = match.song2;
            userVotes = match.song1.votes || 0;
            opponentVotes = match.song2.votes || 0;
        } else {
            userSong = match.song2;
            opponentSong = match.song1;
            userVotes = match.song2.votes || 0;
            opponentVotes = match.song1.votes || 0;
        }
        
        const userPct = totalVotes > 0 ? Math.round((userVotes / totalVotes) * 100) : 50;
        const isWinning = userVotes > opponentVotes;
        
        const card = document.createElement('div');
        card.className = `your-vote-card ${isWinning ? 'winning' : 'losing'}`;
        card.onclick = () => voteNow(match.matchId);
        
        card.innerHTML = `
            <div class="your-pick-badge">✓ Your Pick</div>
            <div class="vote-matchup">
                <div class="vote-song">
                    <img src="https://img.youtube.com/vi/${userSong.videoId}/mqdefault.jpg" 
                         alt="${userSong.shortTitle || userSong.title}">
                    <div class="vote-song-info">
                        <h4>${userSong.shortTitle || userSong.title}</h4>
                        <p>${userSong.artist}</p>
                    </div>
                </div>
                <div class="vote-vs">VS</div>
                <div class="vote-song opponent">
                    <img src="https://img.youtube.com/vi/${opponentSong.videoId}/mqdefault.jpg" 
                         alt="${opponentSong.shortTitle || opponentSong.title}">
                    <div class="vote-song-info">
                        <h4>${opponentSong.shortTitle || opponentSong.title}</h4>
                        <p>${opponentSong.artist}</p>
                    </div>
                </div>
            </div>
            <div class="vote-status ${isWinning ? 'winning' : 'losing'}">
                <span class="status-icon">${isWinning ? '🔥' : '⚔️'}</span>
                <span class="status-text">
                    ${isWinning ? 'Leading' : 'Trailing'} at ${userPct}%
                </span>
                <span class="status-votes">${userVotes.toLocaleString()} votes</span>
            </div>
        `;
        
        grid.appendChild(card);
    });
    
    section.style.display = 'block';
    console.log('✅ Your active votes displayed');
}

// ========================================
// LOAD LIVE MATCHES (LIMITED TO 3)
// ========================================
async function loadLiveMatches(allMatches) {
    try {
        let liveMatches = allMatches.filter(m => {
            if (m.status !== 'live') return false;
            if (m.matchId === currentMatch?.matchId) return false;
            const isTBD = !m.song1?.id || !m.song2?.id ||
                         String(m.song1.id).includes('TBD') ||
                         String(m.song2.id).includes('TBD');
            return !isTBD;
        });
        
        if (liveMatches.length === 0) {
            hideLiveMatchesSection();
            return;
        }
        
        const topLiveMatches = liveMatches
            .sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0))
            .slice(0, 4);
        
        console.log(`✅ Showing top ${topLiveMatches.length} live matches`);
        displayLiveMatchesGrid(topLiveMatches);
        
        if (liveMatches.length > 3) {
            addViewAllLiveLink(liveMatches.length);
        }
        
    } catch (error) {
        console.error('❌ Error loading live matches:', error);
    }
}

function displayLiveMatchesGrid(matches) {
    const grid = document.getElementById('liveMatchesGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    matches.forEach(m => {
        const hasVoted = hasUserVoted(m.matchId);
        const userVotedSongId = hasVoted ? getUserVotedSongId(m.matchId) : null;
        const matchData = convertFirebaseMatchToDisplayFormat(m, hasVoted, userVotedSongId);
        const card = createMatchCard(matchData);
        grid.appendChild(card);
    });
}

function hideLiveMatchesSection() {
    const section = document.querySelector('.live-matches-section');
    if (section) section.style.display = 'none';
}

function addViewAllLiveLink(totalCount) {
    const section = document.querySelector('.live-matches-section .section-header');
    if (section) {
        const subtitle = section.querySelector('.section-subtitle');
        if (subtitle) {
            subtitle.innerHTML = `
                Showing 4 of ${totalCount} live matches
                <a href="matches.html?status=live" class="view-all-inline">View All →</a>
            `;
        }
    }
}

// ========================================
// LOAD RECENT RESULTS (LIMITED TO 6)
// ========================================
async function loadRecentResults(allMatches) {
    try {
        let results = allMatches.filter(m => m.status === 'completed');
        
        if (results.length === 0) {
            showNoResultsMessage();
            return;
        }
        
        results.sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
        
        const recentResults = results.slice(0, 6);
        
        console.log(`✅ Showing ${recentResults.length} recent results`);
        displayRecentResultsGrid(recentResults);
        
        if (results.length > 6) {
            addViewAllResultsLink(results.length);
        }
        
    } catch (error) {
        console.error('❌ Error loading recent results:', error);
    }
}



function displayRecentResultsGrid(matches) {
    const grid = document.getElementById('recentResultsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    matches.forEach(m => {
        const hasVoted = hasUserVoted(m.matchId);
        const userVotedSongId = hasVoted ? getUserVotedSongId(m.matchId) : null;
        const matchData = convertFirebaseMatchToDisplayFormat(m, hasVoted, userVotedSongId);
        const card = createMatchCard(matchData);
        grid.appendChild(card);
    });
}

function showNoResultsMessage() {
    const grid = document.getElementById('recentResultsGrid');
    if (!grid) return;
    
    grid.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">⏳</div>
            <h3 class="no-results-title">No Results Yet</h3>
            <p class="no-results-text">
                The tournament hasn't started or matches are still in progress.<br>
                Results will appear here as winners are decided. Check back soon! 🏆
            </p>
        </div>
    `;
}

function addViewAllResultsLink(totalCount) {
    const section = document.querySelector('.recent-results-section .section-header');
    if (section) {
        const subtitle = section.querySelector('.section-subtitle');
        if (subtitle) {
            subtitle.innerHTML = `
                Showing 6 of ${totalCount} completed matches
                <a href="matches.html?status=completed" class="view-all-inline">View All →</a>
            `;
        }
    }
}

// ========================================
// NEW: LOAD NEXT MATCH COUNTDOWN
// ========================================
async function loadNextMatchCountdown(allMatches) {
    try {
        const upcomingMatches = allMatches.filter(m => {
            if (m.status !== 'upcoming') return false;
            const isTBD = !m.song1?.id || !m.song2?.id ||
                         String(m.song1.id).includes('TBD') ||
                         String(m.song2.id).includes('TBD');
            return !isTBD && m.date;
        });
        
        if (upcomingMatches.length === 0) {
            hideNextMatchCountdown();
            return;
        }
        
        upcomingMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const nextMatch = upcomingMatches[0];
        
        console.log('✅ Next match countdown:', nextMatch.matchId);
        displayNextMatchCountdown(nextMatch);
        startCountdown(nextMatch.date);
        
    } catch (error) {
        console.error('❌ Error loading next match countdown:', error);
        hideNextMatchCountdown();
    }
}

function hideNextMatchCountdown() {
    const section = document.getElementById('nextMatchCountdown');
    if (section) section.style.display = 'none';
}

function displayNextMatchCountdown(match) {
    const section = document.getElementById('nextMatchCountdown');
    const titleEl = document.getElementById('nextMatchTitle');
    
    if (!section || !titleEl) return;
    
    const song1 = match.song1.shortTitle || match.song1.title;
    const song2 = match.song2.shortTitle || match.song2.title;
    
    titleEl.textContent = `${song1} vs ${song2}`;
    section.style.display = 'block';
}

function startCountdown(targetDate) {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    const target = new Date(targetDate).getTime();
    
    const updateCountdown = () => {
        const now = new Date().getTime();
        const diff = target - now;
        
        if (diff <= 0) {
            clearInterval(countdownInterval);
            
            document.getElementById('countdownDays').textContent = '00';
            document.getElementById('countdownHours').textContent = '00';
            document.getElementById('countdownMinutes').textContent = '00';
            document.getElementById('countdownSeconds').textContent = '00';
            
            setTimeout(() => {
                location.reload();
            }, 2000);
            return;
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        document.getElementById('countdownDays').textContent = String(days).padStart(2, '0');
        document.getElementById('countdownHours').textContent = String(hours).padStart(2, '0');
        document.getElementById('countdownMinutes').textContent = String(minutes).padStart(2, '0');
        document.getElementById('countdownSeconds').textContent = String(seconds).padStart(2, '0');
    };
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// ========================================
// CONVERT FIREBASE MATCH TO DISPLAY FORMAT
// ========================================
function convertFirebaseMatchToDisplayFormat(firebaseMatch, hasVoted = false, userVotedSongId = null) {
    const totalVotes = firebaseMatch.totalVotes || 0;
    const song1Votes = firebaseMatch.song1?.votes || 0;
    const song2Votes = firebaseMatch.song2?.votes || 0;
    
    const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
    const song2Percentage = totalVotes > 0 ? Math.round((song2Votes / totalVotes) * 100) : 50;
    
    if (!userVotedSongId && hasVoted) {
        userVotedSongId = getUserVotedSongId(firebaseMatch.matchId);
    }
    
    return {
        id: firebaseMatch.matchId || firebaseMatch.id,
        tournament: 'Anthems Arena Championship',
        round: getRoundName(firebaseMatch.round),
        status: firebaseMatch.status || 'upcoming',
        date: firebaseMatch.date || '2025-11-01',
        endDate: firebaseMatch.endDate || null,
        totalVotes: totalVotes,
        timeLeft: firebaseMatch.status === 'live' ? 'Voting Open' : 'Not Started',
        hasVoted: hasVoted,
        competitor1: {
            seed: firebaseMatch.song1.seed,
            name: firebaseMatch.song1.shortTitle || firebaseMatch.song1.title,
            source: `${firebaseMatch.song1.artist} • ${firebaseMatch.song1.year || '2025'}`,
            videoId: firebaseMatch.song1.videoId,
            votes: song1Votes,
            percentage: song1Percentage,
            winner: firebaseMatch.winnerId === firebaseMatch.song1.id,
            leading: userVotedSongId === 'song1',
            userVoted: userVotedSongId === 'song1'
        },
        competitor2: {
            seed: firebaseMatch.song2.seed,
            name: firebaseMatch.song2.shortTitle || firebaseMatch.song2.title,
            source: `${firebaseMatch.song2.artist} • ${firebaseMatch.song2.year || '2025'}`,
            videoId: firebaseMatch.song2.videoId,
            votes: song2Votes,
            percentage: song2Percentage,
            winner: firebaseMatch.winnerId === firebaseMatch.song2.id,
            leading: userVotedSongId === 'song2',
            userVoted: userVotedSongId === 'song2'
        }
    };
}

function getRoundName(roundNumber) {
    const roundNames = {
        1: 'round-1',
        2: 'round-2',
        3: 'round-3',
        4: 'quarterfinals',
        5: 'semifinals',
        6: 'finals'
    };
    return roundNames[roundNumber] || `round-${roundNumber}`;
}

// ========================================
// VOTE NOW NAVIGATION
// ========================================
window.voteNow = function(matchId) {
    if (!matchId) {
        console.error('❌ voteNow: No match ID provided');
        showNotification('Unable to load match. Please try again.', 'error');
        return;
    }
    
    console.log(`✅ Navigating to vote page for match: ${matchId}`);
    window.location.href = `vote?match=${matchId}`;
};

// ========================================
// LOADING STATE HELPERS
// ========================================
function showHomepageLoading() {
    const loadingState = document.getElementById('homepageLoadingState');
    if (loadingState) {
        loadingState.style.display = 'block';
    }
    hideHomepageSections();
    console.log('⏳ Showing homepage loading state');
}

function hideHomepageLoading() {
    const loadingState = document.getElementById('homepageLoadingState');
    if (loadingState) {
        loadingState.style.display = 'none';
    }
    console.log('✅ Hiding homepage loading state');
}

function showHomepageSections() {
    const sections = [
        { id: 'heroSection', stagger: 1 },
        { id: 'featured-matchup', stagger: 2 },
        { id: 'yourVotesSection', stagger: 3 },
        { id: 'liveMatchesSection', stagger: 4 },
        { id: 'recentResultsSection', stagger: 5 },
        { id: 'nextMatchCountdown', stagger: 6 }
    ];
    
    sections.forEach(({ id, stagger }) => {
        const section = document.getElementById(id);
        if (section && section.style.display !== 'none') {
            section.style.display = 'block';
            section.classList.add('homepage-fade-in', `stagger-${stagger}`);
        }
    });
    
    console.log('✅ Homepage sections visible with stagger animation');
}

function hideHomepageSections() {
    const sectionIds = [
        'heroSection',
        'featured-matchup',
        'yourVotesSection',
        'liveMatchesSection',
        'recentResultsSection',
        'nextMatchCountdown'
    ];
    
    sectionIds.forEach(id => {
        const section = document.getElementById(id);
        if (section) {
            section.style.display = 'none';
            section.classList.remove('homepage-fade-in');
        }
    });
}

function showHomepageError(error) {
    const heroSection = document.getElementById('heroSection');
    if (heroSection) {
        heroSection.style.display = 'block';
        heroSection.innerHTML = `
            <div class="container">
                <div style="text-align: center; padding: 5rem 2rem;">
                    <div style="font-size: 5rem; margin-bottom: 1.5rem; opacity: 0.5;">⚠️</div>
                    <h2 style="font-family: 'Cinzel', serif; font-size: 2rem; color: #C8AA6E; margin-bottom: 1rem;">
                        Error Loading Tournament
                    </h2>
                    <p style="font-family: 'Lora', serif; font-size: 1.1rem; color: rgba(255, 255, 255, 0.6); margin-bottom: 2rem;">
                        Could not load tournament data. Please try refreshing the page.
                    </p>
                    <p style="font-size: 0.9rem; color: rgba(255, 255, 255, 0.5);">
                        Error: ${error.message}
                    </p>
                    <button onclick="location.reload()" style="margin-top: 2rem; padding: 1rem 2rem; background: linear-gradient(135deg, #C8AA6E, #b49a5e); border: none; color: #1a1a2e; font-family: 'Lora', serif; font-size: 1rem; font-weight: 600; border-radius: 8px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            </div>
        `;
    }
}

// ========================================
// HIDE CHAMPIONS SECTION
// ========================================
function hideChampionsSection() {
    const championsSection = document.querySelector('.champions');
    if (championsSection) {
        championsSection.style.display = 'none';
        console.log('✅ Hall of Champions hidden (no champions yet)');
    }
}

// ========================================
// VIDEO PLAYER
// ========================================
function playVideo(momentId) {
    const videoWrapper = event.currentTarget.closest('.video-wrapper');
    const thumbnail = videoWrapper.querySelector('.video-thumbnail');
    const playButton = videoWrapper.querySelector('.play-button');
    
    const thumbnailSrc = thumbnail.src;
    const videoIdMatch = thumbnailSrc.match(/vi\/([^\/]+)\//);
    
    if (!videoIdMatch) {
        console.error('Could not extract video ID');
        return;
    }
    
    const videoId = videoIdMatch[1];
    
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    iframe.frameBorder = '0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
    
    thumbnail.style.display = 'none';
    playButton.style.display = 'none';
    videoWrapper.appendChild(iframe);
}

window.playVideo = playVideo;

// ========================================
// BOOK LINK TRACKING
// ========================================
window.trackBookClick = function(songSlug, location) {
    console.log(`📊 Book clicked: ${songSlug} from ${location}`);
    
    if (typeof gtag !== 'undefined') {
        gtag('event', 'book_click', {
            song: songSlug,
            location: location
        });
    }
};

// ========================================
// NOTIFICATION HELPER
// ========================================
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const bgColor = {
        'success': 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))',
        'error': 'linear-gradient(135deg, rgba(220, 50, 50, 0.95), rgba(200, 30, 30, 0.95))',
        'info': 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))',
    }[type] || 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))';
    
    notification.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: ${bgColor};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-family: 'Lora', serif;
        font-size: 0.95rem;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ========================================
// CLEANUP ON PAGE UNLOAD
// ========================================
window.addEventListener('beforeunload', () => {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
});

// ========================================
// CONSOLE BRANDING
// ========================================
console.log(
    '%c🎵 League Music Tournament %c- Powered by the Lore',
    'color: #C8AA6E; font-size: 20px; font-weight: bold; font-family: Cinzel, serif;',
    'color: #888; font-size: 14px; font-family: Lora, serif;'
);