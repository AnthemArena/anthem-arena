console.log('🔔 global-notifications.js loaded');

// ✅ ADD THIS LINE:
import './champion-loader.js';

import { getActivityFeed } from './api-client.js';
import { sendEmoteReaction, checkNewReactions, markReactionSeen } from './emote-system.js';
import { 
    saveNotification, 
    getRecentUnshownNotifications, 
    markNotificationShown,
    getUnreadCount,
    markNotificationRead,
    dismissNotification
} from './notification-storage.js';

// ✅ Import Firestore functions separately
import { db } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    getDocs,
    limit,
      orderBy,      // ✅ ADD THIS
    onSnapshot    // ✅ ADD THIS (for real-time listener)
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// HELPER: NORMALIZE MATCH ID
// ========================================

function getMatchId(match) {
    // Ensure consistent match ID format
    return match.matchId || match.id;
}

// ========================================
// CONFIGURATION
// ========================================

const POLL_CONFIG = {
    BASE_INTERVAL: 120000,      // 2 minutes base
ACTIVE_INTERVAL: 120000,    // 2 minutes when active (still responsive)
    INACTIVE_THRESHOLD: 300000, // 5 minutes = inactive
    MAX_INTERVAL: 300000        // 5 minutes max
};

const BULLETIN_THRESHOLDS = {
    DANGER: 40,        // Below 40% = danger
    NAILBITER: 3,      // Within 3 votes = nailbiter
    WINNING: 65,       // Above 65% = dominating
    COMEBACK_MIN: 5    // Must have been behind by at least 5 votes
};

// ========================================
// STREAK TRACKING CONFIGURATION
// ========================================

const STREAK_CONFIG = {
    MIN_STREAK: 3,        // Minimum matches for streak alert
    MILESTONE_STREAKS: [3, 5, 10, 20], // Show special alerts at these numbers
    MAX_TRACKED: 50       // Track up to 50 people (prevent memory bloat)
};

// ========================================
// STREAK STORAGE FORMAT
// ========================================
// localStorage 'userStreaks' = {
//   'ally-username123': {
//     streak: 5,
//     lastMatchId: 'round-2-match-3',
//     lastUpdated: timestamp,
//     matches: ['round-1-match-1', 'round-1-match-5', ...]
//   },
//   'rival-username456': { ... }
// }
// ========================================
// STATE MANAGEMENT
// ========================================

let pollInterval = null;
let lastActivity = Date.now();
let currentBulletin = null;
let dismissedBulletins = new Set();
let matchStates = {}; // Track previous states for comeback detection
let recentlyShownBulletins = new Map(); // ✅ NEW: Track shown toasts with timestamps

const COOLDOWN_MINUTES = {
    danger: 5,           // ✅ Keep - urgent
    'danger-repeat': 10, // 🔽 Reduce from 15 - still losing is urgent
    novotes: 5,          // ✅ Keep - critical
    nailbiter: 10,       // ✅ Keep - perfect urgency
    comeback: 10,        // 🔽 Reduce from 15 - exciting news!
    winning: 20,         // 🔽 Reduce from 30 - users like wins
    lowvotes: 15,        // ✅ Keep - moderate urgency
    welcome: 720,        // ✅ Keep - 12 hours is right
    encouragement: 45,   // 🔽 Reduce from 120 - nudge inactive browsers more
    achievement: 0,      // ✅ Keep - one-time
    'level-up': 0,       // ✅ Keep - one-time
    trending: 30,        // ✅ Keep - good for engagement
    votesurge: 30,       // ✅ Keep
    mostviewed: 60,       // 🔽 Reduce from 90 - still low priority but more active
        'live-activity': 5,  // ✅ NEW: Show live votes every 5 minutes max
            streak: 30  // ✅ NEW: Show streak alerts max every 30 minutes


};


// ========================================
// ACTIVITY TRACKING
// ========================================

function updateActivity() {
    lastActivity = Date.now();
    adjustPollingRate();
}

function adjustPollingRate() {
    const timeSinceActivity = Date.now() - lastActivity;
    const isActive = timeSinceActivity < POLL_CONFIG.INACTIVE_THRESHOLD;
    
    // ✅ Check if user has any active votes in live matches
    const userId = localStorage.getItem('tournamentUserId');
    const hasActiveVotes = userId && localStorage.getItem('userVotes');
    
    let interval;
    
    if (!hasActiveVotes) {
        // ✅ No votes yet - very slow polling (5 minutes)
        interval = 300000;
        console.log('🐌 Polling: 5min (no active votes)');
    } else if (isActive) {
        // Active user with votes - frequent polling
        interval = POLL_CONFIG.ACTIVE_INTERVAL;
        console.log('⚡ Polling: 30s (active user)');
    } else {
        // Inactive user with votes - moderate polling
        interval = POLL_CONFIG.BASE_INTERVAL;
        console.log('💤 Polling: 2min (inactive user)');
    }
    
    if (pollInterval) {
        clearInterval(pollInterval);
    }
    
    pollInterval = setInterval(checkAndShowBulletin, interval);
}

// Track user activity
['click', 'scroll', 'keydown', 'mousemove'].forEach(event => {
    document.addEventListener(event, updateActivity, { passive: true, once: false });
});

// ========================================
// UTILITY FUNCTIONS
// ========================================

// ========================================
// UTILITY FUNCTIONS
// ========================================

function extractYouTubeId(url) {
    if (!url) return '';
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&\n?#]+)/);
    return match ? match[1] : '';
}

// ✅ FIXED: Handle both song objects and URLs
function getThumbnailUrl(input) {
    // Handle null/undefined
    if (!input) return '';
    
    // Handle if passed a song object (from match data)
    if (typeof input === 'object') {
        // Priority 1: Use videoId directly (your data structure)
        if (input.videoId) {
            return `https://img.youtube.com/vi/${input.videoId}/mqdefault.jpg`;
        }
        
        // Priority 2: Extract from youtubeUrl (fallback)
        if (input.youtubeUrl) {
            const videoId = extractYouTubeId(input.youtubeUrl);
            if (videoId) {
                return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
            }
        }
    }
    
    // Handle if passed a string (legacy - full YouTube URL)
    if (typeof input === 'string') {
        const videoId = extractYouTubeId(input);
        return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';
    }
    
    return '';
}

// ========================================
// HELPER: CALCULATE HOURS UNTIL CLOSE
// ========================================
// ========================================
// HELPER: CALCULATE HOURS UNTIL CLOSE
// ========================================
function getHoursUntilClose(match) {
    // ✅ Support both endTime (Firestore Timestamp) and endDate (ISO string)
    const endTimeValue = match.endTime || match.endDate;
    
    if (!endTimeValue) {
        // ✅ FIXED: Use match.matchId instead of undefined matchId variable
        console.warn('⚠️ Match has no endTime or endDate:', match.matchId || match.id || 'unknown');
        return null;
    }
    
    const now = Date.now();
    
    // Handle Firestore Timestamp object
    if (endTimeValue.toMillis && typeof endTimeValue.toMillis === 'function') {
        const msLeft = endTimeValue.toMillis() - now;
        if (msLeft <= 0) return 0;
        return Math.floor(msLeft / (1000 * 60 * 60));
    }
    
    // Handle ISO string or Date object
    const endDate = new Date(endTimeValue);
    
    if (isNaN(endDate.getTime())) {
        console.warn('⚠️ Invalid endTime/endDate format:', endTimeValue, 'for match:', match.matchId || match.id);
        return null;
    }
    
    const msLeft = endDate.getTime() - now;
    
    if (msLeft <= 0) return 0;
    
    return Math.floor(msLeft / (1000 * 60 * 60));
}

// ========================================
// FIRESTORE DATA FETCHING
// ========================================

// ========================================
// FIRESTORE DATA FETCHING (USE EDGE CACHE)
// ========================================

async function getMatchData(matchId) {
    try {
        // ✅ Use edge cache instead of direct Firestore
        const response = await fetch('/api/matches');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const allMatches = await response.json();
        
        // Find the specific match
        const match = allMatches.find(m => m.matchId === matchId || m.id === matchId);
        
        if (match) {
            return { id: matchId, ...match };
        }
        
        console.warn(`⚠️ Match ${matchId} not found in cache`);
        return null;
        
    } catch (error) {
        console.error(`Error fetching match ${matchId}:`, error);
        return null;
    }
}


// ========================================
// BULLETIN DETECTION LOGIC
// ========================================

// ========================================
// BULLETIN DETECTION LOGIC
// ========================================

async function checkAndShowBulletin() {
    try {
        // ========================================
        // PRIORITY 0: CHECK FOR NEW ROUNDS/BATCHES
        // ========================================
        
        try {
            const { checkRoundOpenings, showRoundOpeningNotification } = await import('./round-alerts.js');
            const roundAlert = await checkRoundOpenings();
            
            if (roundAlert) {
                console.log(`🎪 Round alert detected: ${roundAlert.type} - Round ${roundAlert.round}`);
                showRoundOpeningNotification(roundAlert);
                return; // Exit early - showed round alert (highest priority)
            }
        } catch (error) {
            console.error('⚠️ Error checking round openings:', error);
        }
        
        // ========================================
        // CONTINUE WITH USER ID CHECK
        // ========================================
        
        const userId = localStorage.getItem('tournamentUserId');
        
        if (!userId) {
            console.warn('⚠️ No user ID found - skipping vote checks');
        }
        
        // ✅ Fetch user votes from localStorage
        let userVotes = {};
        let hasVoted = false;
        
        if (userId) {
            try {
                const storedVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
                
                Object.entries(storedVotes).forEach(([matchId, voteData]) => {
                    userVotes[matchId] = {
                        matchId: matchId,
                        choice: voteData.songId,
                        songTitle: voteData.songTitle,
                        opponentTitle: voteData.opponentTitle,
                        timestamp: voteData.timestamp
                    };
                });
                
                hasVoted = Object.keys(userVotes).length > 0;
                console.log(`📊 User has ${Object.keys(userVotes).length} votes (from localStorage)`);
                
            } catch (error) {
                console.error('❌ Error reading votes from localStorage:', error);
            }
        }
            
        // ========================================
        // NON-VOTER ENGAGEMENT SYSTEM
        // ========================================
        
        if (!hasVoted) {
            console.log('👤 First-time visitor - checking engagement prompts');
            
            const lastEncouragement = parseInt(localStorage.getItem('lastEncouragementToast') || '0');
            const timeSinceLastPrompt = Date.now() - lastEncouragement;
            const pageLoadTime = parseInt(sessionStorage.getItem('pageLoadTime') || Date.now().toString());
            const timeOnSite = Date.now() - pageLoadTime;
            
            if (!sessionStorage.getItem('pageLoadTime')) {
                sessionStorage.setItem('pageLoadTime', Date.now().toString());
            }
            
            const shouldWelcome = await shouldShowWelcome(timeOnSite);
            if (shouldWelcome) {
                await showWelcomeToast();
                return;
            }
            
            const welcomeShown = sessionStorage.getItem('welcomeToastShown') || localStorage.getItem('lastWelcomeToast');
            if (welcomeShown && timeOnSite > 120000 && timeSinceLastPrompt > 120000) {
                await showEncouragementToast('gentle');
                return;
            }
            
            if (timeOnSite > 300000 && timeSinceLastPrompt > 180000) {
                const hasUrgentMatches = await checkForClosingMatches();
                if (hasUrgentMatches) {
                    await showEncouragementToast('urgent');
                    return;
                }
            }
            
            return;
        }
        
        const notifications = [];
        
        // ========================================
        // PRIORITY 1: Check user's picks for danger/nailbiter/comeback/winning
        // ========================================
        
        for (const [matchId, vote] of Object.entries(userVotes)) {
            const match = await getMatchData(matchId);
            
            if (!match || match.status !== 'live') continue;
            
            if (!match.id && !match.matchId) {
                console.warn('⚠️ Match missing ID:', match);
                continue;
            }
            
            const userChoice = vote.choice;
            const userSong = userChoice === 'song1' ? match.song1 : match.song2;
            const opponent = userChoice === 'song1' ? match.song2 : match.song1;
            
            if (!userSong || !opponent) {
                continue;
            }
            
            const totalVotes = match.totalVotes || 0;
            const userSongVotes = userSong.votes || 0;
            const opponentVotes = opponent.votes || 0;
            const voteDiff = Math.abs(userSongVotes - opponentVotes);
            
            const userPct = totalVotes > 0 ? Math.round((userSongVotes / totalVotes) * 100) : 50;
            const opponentPct = totalVotes > 0 ? 100 - userPct : 50;
            
            const previousState = matchStates[matchId];
            const isCurrentlyLosing = userSongVotes < opponentVotes;
            const wasLosing = previousState?.wasLosing || false;
            
            matchStates[matchId] = {
                wasLosing: isCurrentlyLosing,
                lastCheck: Date.now()
            };
            
            // ========================================
            // DANGER: User's pick is losing badly
            // ========================================
            
            if (userPct < BULLETIN_THRESHOLDS.DANGER && userSongVotes < opponentVotes) {
                const normalizedMatchId = getMatchId(match);
                
                // ✅ Determine severity tier for dismissal tracking
                let severityTier;
                if (voteDiff === 1) {
                    severityTier = 'trailing-1';
                } else if (voteDiff <= 3) {
                    severityTier = 'trailing-2-3';
                } else if (voteDiff <= 5) {
                    severityTier = 'trailing-4-5';
                } else if (voteDiff <= 10) {
                    severityTier = 'trailing-6-10';
                } else {
                    severityTier = 'trailing-11plus';
                }
                
                const bulletinKey = `danger-${normalizedMatchId}-${severityTier}`;
                
                // ✅ Check if THIS specific severity tier was dismissed
                if (dismissedBulletins.has(bulletinKey)) {
                    console.log(`⏭️ Skipping danger alert (${severityTier} dismissed for 24h): ${bulletinKey}`);
                    continue;
                }
                
                // ✅ Check cooldown for this specific severity
const lastShown = recentlyShownBulletins.get(bulletinKey);
                if (lastShown && (Date.now() - lastShown) < BULLETIN_COOLDOWNS.DANGER) {
                    continue;
                }
                
                // Track alert count for escalation messaging
                const dangerAlertKey = `danger-alert-count-${normalizedMatchId}`;
                const alertCount = parseInt(localStorage.getItem(dangerAlertKey) || '0');
                const notificationType = alertCount === 0 ? 'danger' : 'danger-repeat';
                
                const championMessage = window.championLoader?.getChampionMessage('danger', {
                    songTitle: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
                    opponentTitle: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
                    matchTitle: `${userSong?.shortTitle || userSong?.title} vs ${opponent?.shortTitle || opponent?.title}`,
                    voteDiff: voteDiff,
                    userPct: userPct,
                    opponentPct: opponentPct
                });
                
                notifications.push({
                    priority: 1,
                    type: notificationType,
                    matchId: normalizedMatchId,
                    song: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
                    opponent: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
                    thumbnailUrl: getThumbnailUrl(userSong),
                    userPct,
                    opponentPct,
                    voteDiff,
                    severityTier, // ✅ Store for dismissal key
                    message: championMessage?.message || `🚨 Your pick is in danger!`,
                    detail: championMessage?.detail || `Behind by ${voteDiff} vote${voteDiff !== 1 ? 's' : ''}`,
                    cta: championMessage?.cta || 'View Match Now!'
                });
                
                localStorage.setItem(dangerAlertKey, (alertCount + 1).toString());
            }
            
            // ========================================
            // COMEBACK: Was losing, now winning
            // ========================================
            
            else if (wasLosing && !isCurrentlyLosing && voteDiff >= BULLETIN_THRESHOLDS.COMEBACK_MIN) {
                const normalizedMatchId = getMatchId(match);
                
                // ✅ Severity tier: how much are they winning by now?
                let comebackTier;
                if (voteDiff <= 2) {
                    comebackTier = 'comeback-small';
                } else if (voteDiff <= 5) {
                    comebackTier = 'comeback-medium';
                } else {
                    comebackTier = 'comeback-large';
                }
                
                const bulletinKey = `comeback-${normalizedMatchId}-${comebackTier}`;
                
                if (dismissedBulletins.has(bulletinKey)) {
                    console.log(`⏭️ Skipping comeback alert (${comebackTier} dismissed): ${bulletinKey}`);
                    continue;
                }
                
                const championMessage = window.championLoader?.getChampionMessage('comeback', {
                    songTitle: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
                    opponentTitle: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
                    matchTitle: `${userSong?.shortTitle || userSong?.title} vs ${opponent?.shortTitle || opponent?.title}`,
                    voteDiff: voteDiff,
                    userPct: userPct,
                    opponentPct: opponentPct
                });
                
                notifications.push({
                    priority: 2,
                    type: 'comeback',
                    matchId: normalizedMatchId,
                    song: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
                    opponent: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
                    thumbnailUrl: getThumbnailUrl(userSong),
                    userPct,
                    opponentPct,
                    severityTier: comebackTier, // ✅ Store for dismissal key
                    message: championMessage?.message || `🎉 Comeback complete!`,
                    detail: championMessage?.detail || `Now leading by ${voteDiff}!`,
                    cta: championMessage?.cta || 'View Match!'
                });
            }
            
            // ========================================
            // NAILBITER: Very close match
            // ========================================
            
            else if (voteDiff <= BULLETIN_THRESHOLDS.NAILBITER && totalVotes > 10) {
                const normalizedMatchId = getMatchId(match);
                
                // ✅ Severity tier: how close is it?
                let nailbiterTier;
                if (voteDiff === 0) {
                    nailbiterTier = 'tied';
                } else if (voteDiff === 1) {
                    nailbiterTier = 'diff-1';
                } else {
                    nailbiterTier = `diff-${voteDiff}`;
                }
                
                const bulletinKey = `nailbiter-${normalizedMatchId}-${nailbiterTier}`;
                
                if (dismissedBulletins.has(bulletinKey)) {
                    console.log(`⏭️ Skipping nailbiter alert (${nailbiterTier} dismissed): ${bulletinKey}`);
                    continue;
                }
                
                const championMessage = window.championLoader?.getChampionMessage('nailbiter', {
                    songTitle: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
                    opponentTitle: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
                    matchTitle: `${userSong?.shortTitle || userSong?.title} vs ${opponent?.shortTitle || opponent?.title}`,
                    voteDiff: voteDiff,
                    userPct: userPct,
                    opponentPct: opponentPct
                });
                
                notifications.push({
                    priority: 3,
                    type: 'nailbiter',
                    matchId: normalizedMatchId,
                    song: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
                    opponent: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
                    thumbnailUrl: getThumbnailUrl(userSong),
                    voteDiff,
                    userPct,
                    opponentPct,
                    severityTier: nailbiterTier, // ✅ Store for dismissal key
                    message: championMessage?.message || `🔥 Too close!`,
                    detail: championMessage?.detail || `${voteDiff === 0 ? 'Perfectly tied!' : `Just ${voteDiff} vote${voteDiff === 1 ? '' : 's'} apart!`}`,
                    cta: championMessage?.cta || 'View Match!'
                });
            }
            
            // ========================================
            // WINNING: User's pick is dominating
            // ========================================
            
            else if (userPct >= BULLETIN_THRESHOLDS.WINNING && totalVotes > 20) {
                const normalizedMatchId = getMatchId(match);
                
                // ✅ Severity tier: how much are they winning by?
                let winTier;
                if (voteDiff <= 3) {
                    winTier = 'winning-small';
                } else if (voteDiff <= 10) {
                    winTier = 'winning-medium';
                } else if (voteDiff <= 20) {
                    winTier = 'winning-large';
                } else {
                    winTier = 'winning-dominating';
                }
                
                const bulletinKey = `winning-${normalizedMatchId}-${winTier}`;
                
                if (dismissedBulletins.has(bulletinKey)) {
                    console.log(`⏭️ Skipping winning alert (${winTier} dismissed): ${bulletinKey}`);
                    continue;
                }
                
                const championMessage = window.championLoader?.getChampionMessage('winning', {
                    songTitle: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
                    userPct: userPct,
                    opponentPct: opponentPct,
                    voteDiff: voteDiff
                });
                
                notifications.push({
                    priority: 4,
                    type: 'winning',
                    matchId: normalizedMatchId,
                    song: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
                    opponent: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
                    thumbnailUrl: getThumbnailUrl(userSong),
                    userPct,
                    opponentPct,
                    severityTier: winTier, // ✅ Store for dismissal key
                    message: championMessage?.message || `🎯 Dominating!`,
                    detail: championMessage?.detail || `Leading ${userPct}% to ${opponentPct}%`,
                    cta: championMessage?.cta || 'View Match!'
                });
            }
        }
        
        // ========================================
        // PRIORITY 2: CHECK MATCH OUTCOMES
        // ========================================
        
        try {
            const { checkMatchOutcomes, showMatchOutcomeNotification } = await import('./match-outcomes.js');
            const outcomes = await checkMatchOutcomes();
            
            if (outcomes.length > 0) {
                console.log(`🏆 Found ${outcomes.length} new match outcome(s)`);
                
                const outcome = outcomes[0];
                showMatchOutcomeNotification(outcome);
                
                const { checkAchievements } = await import('./achievement-tracker.js');
                
                try {
                    const votesResponse = await fetch(`/api/user-votes?userId=${userId}`);
                    if (votesResponse.ok) {
                        const allVotes = await votesResponse.json();
                        await checkAchievements(allVotes);
                    }
                } catch (voteError) {
                    console.warn('Could not check achievements:', voteError);
                }
                
                return;
            }
            
        } catch (error) {
            console.error('⚠️ Error checking match outcomes:', error);
        }
        
        // ========================================
        // PRIORITY 3: CHECK ALL LIVE MATCHES FOR VOTE ISSUES
        // ========================================
        
        let zeroVoteCount = 0;
        let lowVoteCount = 0;
        
        const allLiveResponse = await fetch('/api/matches');
        const allMatches = await allLiveResponse.json();
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        for (const match of liveMatches) {
            const matchId = match.matchId || match.id;
            const totalVotes = (match.song1?.votes || 0) + (match.song2?.votes || 0);
            const hoursLeft = getHoursUntilClose(match);
            
            if (!hoursLeft || hoursLeft <= 0) continue;
            
            if (totalVotes === 0 && hoursLeft <= 6) {
                zeroVoteCount++;
                
                const dismissKey = `novotes-${matchId}`;
                if (dismissedBulletins.has(dismissKey)) {
                    continue;
                }
                
                const alertKey = `lastAlert-novotes-${matchId}`;
                const lastAlerted = localStorage.getItem(alertKey);
                const hoursSinceAlert = lastAlerted ? (Date.now() - parseInt(lastAlerted)) / (1000 * 60 * 60) : 999;
                
                if (hoursSinceAlert >= 2 && notifications.filter(n => n.type === 'novotes').length === 0) {
                    notifications.push({
                        priority: 1,
                        type: 'novotes',
                        matchId: matchId,
                        song: match.song1?.title,
                        opponent: match.song2?.title,
                        thumbnailUrl: getThumbnailUrl(match.song1?.youtubeUrl) || getThumbnailUrl(match.song2?.youtubeUrl),
                        hoursLeft: hoursLeft,
                        message: `🚨 URGENT: Match has ZERO votes!`,
                        detail: `${match.song1?.shortTitle} vs ${match.song2?.shortTitle} • Closes in ${hoursLeft}h`,
                        cta: 'Cast First Vote!',
                        action: 'navigate',
                        targetUrl: `/vote.html?match=${matchId}`
                    });
                    
                    localStorage.setItem(alertKey, Date.now().toString());
                    break;
                }
            }
            else if (totalVotes > 0 && totalVotes < 5 && hoursLeft <= 3) {
                lowVoteCount++;
                
                const dismissKey = `lowvotes-${matchId}`;
                if (dismissedBulletins.has(dismissKey)) {
                    continue;
                }
                
                const alertKey = `lastAlert-lowvotes-${matchId}`;
                const lastAlerted = localStorage.getItem(alertKey);
                const hoursSinceAlert = lastAlerted ? (Date.now() - parseInt(lastAlerted)) / (1000 * 60 * 60) : 999;
                
                if (zeroVoteCount === 0 && hoursSinceAlert >= 2 && notifications.filter(n => n.type === 'lowvotes').length === 0) {
                    notifications.push({
                        priority: 6,
                        type: 'lowvotes',
                        matchId: matchId,
                        song: match.song1?.title,
                        opponent: match.song2?.title,
                        thumbnailUrl: getThumbnailUrl(match.song1?.youtubeUrl) || getThumbnailUrl(match.song2?.youtubeUrl),
                        totalVotes: totalVotes,
                        hoursLeft: hoursLeft,
                        message: `⚠️ Match needs more votes!`,
                        detail: `Only ${totalVotes} vote${totalVotes === 1 ? '' : 's'} • Closes in ${hoursLeft}h`,
                        cta: 'Vote Now!',
                        action: 'navigate',
                        targetUrl: `/vote.html?match=${matchId}`
                    });
                    
                    localStorage.setItem(alertKey, Date.now().toString());
                    break;
                }
            }
        }
        
        // ========================================
        // PRIORITY 4: CHECK FOR TRENDING/ENGAGING MATCHES
        // ========================================
        
        if (hasVoted && Object.keys(userVotes).length >= 2) {
            for (const match of liveMatches) {
                const matchId = match.matchId || match.id;
                
                if (userVotes[matchId]) continue;
                
                try {
                    const viewResponse = await fetch(`/api/view-stats?matchId=${matchId}`);
                    
                    if (!viewResponse.ok) continue;
                    
                    const viewStats = await viewResponse.json();
                    const totalViews = viewStats.totalViews || 0;
                    const recentViews = viewStats.recentViews || 0;
                    const totalVotes = match.totalVotes || 0;
                    
                    if (recentViews >= 10 && totalVotes >= 5) {
                        notifications.push({
                            priority: 3,
                            type: 'trending',
                            matchId: matchId,
                            song: match.song1?.shortTitle || match.song1?.title || 'Unknown',
                            opponent: match.song2?.shortTitle || match.song2?.title || 'Unknown',
                            thumbnailUrl: getThumbnailUrl(match.song1?.youtubeUrl),
                            viewCount: recentViews,
                            message: `🔥 Hottest match right now!`,
                            detail: `${match.song1?.shortTitle} vs ${match.song2?.shortTitle} is trending - join the action`,
                            cta: 'Vote Now',
                            action: 'navigate',
                            targetUrl: `/vote.html?match=${matchId}`
                        });
                    }
                    else if (totalViews >= 30 && totalVotes < 15) {
                        notifications.push({
                            priority: 4,
                            type: 'mostviewed',
                            matchId: matchId,
                            song: match.song1?.shortTitle || match.song1?.title || 'Unknown',
                            opponent: match.song2?.shortTitle || match.song2?.title || 'Unknown',
                            thumbnailUrl: getThumbnailUrl(match.song1?.youtubeUrl),
                            viewCount: totalViews,
                            message: `👀 Most popular match today!`,
                            detail: `Everyone's watching ${match.song1?.shortTitle} vs ${match.song2?.shortTitle} - add your vote!`,
                            cta: 'Cast Your Vote',
                            action: 'navigate',
                            targetUrl: `/vote.html?match=${matchId}`
                        });
                    }
                } catch (error) {
                    console.error(`Error checking engagement for ${matchId}:`, error);
                }
            }
        }
        
        // ========================================
        // SHOW HIGHEST PRIORITY NOTIFICATION
        // ========================================
        
        notifications.sort((a, b) => a.priority - b.priority);
        
        for (const notification of notifications) {
            // ✅ Build bulletin key with severity tier if available
            const bulletinKey = notification.severityTier 
                ? `${notification.type}-${notification.matchId}-${notification.severityTier}`
                : `${notification.type}-${notification.matchId}`;
            
            // ✅ Check if THIS specific situation was dismissed
            if (dismissedBulletins.has(bulletinKey)) {
                console.log(`⏭️ Skipping ${notification.type} (dismissed): ${bulletinKey}`);
                continue;
            }
            
            // ✅ Check cooldown
            const lastShown = recentlyShownBulletins.get(bulletinKey);
            if (lastShown) {
                const cooldownMs = (COOLDOWN_MINUTES[notification.type] || 10) * 60000;
                const timeSinceShown = Date.now() - lastShown;
                
                if (timeSinceShown < cooldownMs) {
                    continue;
                }
            }
            
            showBulletin(notification);
            recentlyShownBulletins.set(bulletinKey, Date.now());
            
            // Save to Firestore
            if (userId && userId !== 'anonymous' && notification.matchId) {
                await saveNotification(userId, {
                    type: notification.type,
                    priority: notification.priority,
                    message: notification.message,
                    detail: notification.detail,
                    matchId: notification.matchId,
                    matchTitle: notification.song && notification.opponent ? 
                               `${notification.song} vs ${notification.opponent}` : '',
                    thumbnailUrl: notification.thumbnailUrl,
                    ctaText: notification.cta,
                    ctaAction: notification.action || 'navigate',
                    targetUrl: notification.targetUrl || `/vote.html?match=${notification.matchId}`,
                                severityTier: notification.severityTier, // ✅ ADD THIS!

                    shownAsToast: true
                });
            }
            
            try {
                const persistedData = Object.fromEntries(recentlyShownBulletins);
                sessionStorage.setItem('recentBulletins', JSON.stringify(persistedData));
            } catch (e) {
                console.warn('Could not persist bulletin cooldowns:', e);
            }
            
            console.log(`📢 Toast shown: ${bulletinKey}`);
            break;
        }
        
    } catch (error) {
        console.error('Error checking bulletin:', error);
    }
}

// ========================================
// REAL-TIME VOTE NOTIFICATIONS - COMPLETE REWRITE
// ========================================

let lastActivityCheck = 0;
let lastSeenActivityIds = new Set(); // ✅ Track processed activities to avoid duplicates
const ACTIVITY_CHECK_INTERVAL = 30000; // Check every 30 seconds

// ✅ NEW: Configurable time windows
const TOAST_WINDOW_MINUTES = 60;  // Show toasts for votes in last 60 minutes
const SAVE_WINDOW_HOURS = 72;     // Save notifications for votes in last 72 hours



async function checkRecentVotes() {
    try {
        // Throttle checks
        const now = Date.now();
        if (now - lastActivityCheck < ACTIVITY_CHECK_INTERVAL) return;
        lastActivityCheck = now;
        
        // Get recent activity (increased from 10 to 50)
        const activities = await getActivityFeed(50);
        
        if (!activities || activities.length === 0) return;
        
        // Get current user
        const userId = localStorage.getItem('tournamentUserId');
        if (!userId || userId === 'anonymous') return;
        
        // ✅ Load user's votes from localStorage (fast, no Firestore reads)
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        
        // Calculate time windows
        const toastWindowMs = TOAST_WINDOW_MINUTES * 60 * 1000;
        const saveWindowMs = SAVE_WINDOW_HOURS * 60 * 60 * 1000;
        const toastCutoff = now - toastWindowMs;
        const saveCutoff = now - saveWindowMs;
        
        let toastShown = false; // Only show one toast per check
        let savedCount = 0;
        let skippedCount = 0;
        
        // ✅ Process ALL recent activities
        for (const activity of activities) {
            // Skip if already processed this activity
            if (lastSeenActivityIds.has(activity.activityId)) {
                skippedCount++;
                continue;
            }
            
            // Skip own votes
            if (activity.userId === userId) {
                lastSeenActivityIds.add(activity.activityId);
                continue;
            }
            
            // Skip anonymous votes
            if (activity.username === 'Anonymous') {
                lastSeenActivityIds.add(activity.activityId);
                continue;
            }
            
            // Skip if too old (outside 72-hour save window)
            if (activity.timestamp < saveCutoff) {
                lastSeenActivityIds.add(activity.activityId);
                continue;
            }
            
            // ✅ Check if current user voted in this match
            const userVoteData = userVotes[activity.matchId];
            
            if (!userVoteData) {
                // User hasn't voted in this match - not relevant for ally/rival
                lastSeenActivityIds.add(activity.activityId);
                continue;
            }
            
            // ✅ Determine relationship: ally or opponent
            const isAlly = userVoteData.songId === activity.songId;
            
            // ✅ Build notification data
            const notificationData = buildSocialNotification(activity, isAlly, userId);
            
            // ✅ ALWAYS save to Firestore (within 72-hour window)
            try {
                await saveNotification(userId, notificationData);
                savedCount++;
                console.log(`💾 Saved ${isAlly ? '🤝 ally' : '⚔️ rival'} notification: ${activity.username} in ${activity.matchTitle}`);
            } catch (error) {
                console.error('Failed to save notification:', error);
            }

            // ✅ NEW: Track streaks
const streakData = updateStreak(activity.username, activity.userId, activity.matchId, isAlly);
if (streakData && streakData.isMilestone) {
    // Show streak notification after a short delay (don't spam)
    setTimeout(() => {
        showStreakNotification(streakData);
    }, 3000); // 3 second delay after ally/rival toast
}
            
      // ✅ Show as toast ONLY if within toast window (60 minutes)
if (!toastShown && activity.timestamp >= toastCutoff) {
    // Check cooldown to avoid spamming same match
    const bulletinKey = `live-activity-${activity.matchId}`;
    const lastShown = recentlyShownBulletins.get(bulletinKey);
    const cooldownMs = 5 * 60000; // 5 minutes between toasts per match
    
    if (!lastShown || (now - lastShown) >= cooldownMs) {
        showBulletin({
            ...notificationData, // Spread existing data
            action: 'navigate',  // ✅ ADD: Navigate action
            targetUrl: `/profile.html?user=${activity.userId}` // ✅ ADD: User profile URL
        });
        recentlyShownBulletins.set(bulletinKey, now);
        toastShown = true;
        
        const minutesAgo = Math.floor((now - activity.timestamp) / 60000);
        console.log(`🔔 Toast shown: ${activity.username} (${isAlly ? 'ally' : 'rival'}) - ${minutesAgo}m ago`);
    }
}
            
            // ✅ Mark as processed
            lastSeenActivityIds.add(activity.activityId);
        }
        
        // ✅ Log summary
        if (savedCount > 0 || toastShown) {
            console.log(`📊 Activity check: ${savedCount} saved, ${toastShown ? '1' : '0'} shown as toast, ${skippedCount} already processed`);
        }
        
        // ✅ Cleanup old activity IDs (prevent memory leak)
        if (lastSeenActivityIds.size > 200) {
            const idsArray = Array.from(lastSeenActivityIds);
            lastSeenActivityIds = new Set(idsArray.slice(-100)); // Keep last 100
            console.log('🧹 Cleaned up activity ID cache');
        }
        
    } catch (error) {
        console.error('❌ Error checking recent votes:', error);
    }
}

// ========================================
// HELPER: BUILD SOCIAL NOTIFICATION DATA
// ========================================

// ========================================
// HELPER: BUILD SOCIAL NOTIFICATION DATA
// ========================================

function buildSocialNotification(activity, isAlly, currentUserId) {
    const avatarUrl = activity.avatarUrl || activity.avatar || null;
    const songThumbnailUrl = activity.songId 
        ? `https://img.youtube.com/vi/${activity.songId}/mqdefault.jpg`
        : null;

    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const userVoteData = userVotes[activity.matchId];
    const userSongTitle = userVoteData?.songTitle || 'your pick';

    let message, detail, cta, icon, ctaAction, ctaData;

    if (isAlly) {
      const championMessage = window.championLoader.getChampionMessage('ally', {
        username: activity.username,
        songTitle: activity.songTitle,
        matchTitle: activity.matchTitle
    });
    message = championMessage.message;
    detail = championMessage.detail;
    cta = championMessage.cta;
        icon = 'Handshake';
        ctaAction = 'send-emote';
        ctaData = {
            targetUsername: activity.username,
            targetUserId: activity.userId,
            emoteType: 'thanks',
            matchData: {
                matchId: activity.matchId,
                matchTitle: activity.matchTitle,
                songTitle: activity.songTitle
            }
        };
    } else {
     const championMessage = window.championLoader.getChampionMessage('rival', {
        username: activity.username,
        theirSong: activity.songTitle,
        yourSong: userSongTitle,
        matchTitle: activity.matchTitle
    });
    message = championMessage.message;
    detail = championMessage.detail;
    cta = championMessage.cta;
        icon = 'Crossed Swords';
        ctaAction = 'navigate';
        ctaData = {};
    }

    // SINGLE, CORRECT RETURN
    return {
        priority: 7,
        type: 'live-activity',
        matchId: activity.matchId,
        matchTitle: activity.matchTitle,
        username: activity.username,
        triggerUserId: activity.userId,
        triggerUsername: activity.username,
        song: activity.songTitle,
        userSong: userSongTitle,
        thumbnailUrl: avatarUrl,                    // Main: user's avatar
        secondaryThumbnail: songThumbnailUrl,       // Badge: song thumbnail
        message,
        detail,
        icon,
        cta,
        ctaText: cta,
        ctaAction,
        ctaData,
        targetUrl: `/vote.html?match=${activity.matchId}`,
        relationship: isAlly ? 'ally' : 'opponent',
        shownAsToast: false,
        secondaryCta: {
            text: `View ${activity.username}'s Profile`,
            action: 'navigate',
            url: `/profile?user=${activity.username}`
        }
    };
}

// ========================================
// STREAK DETECTION & TRACKING
// ========================================

function updateStreak(username, userId, matchId, isAlly) {
    if (!username || username === 'Anonymous') return null;
    
    try {
        // Load existing streaks
        const streaks = JSON.parse(localStorage.getItem('userStreaks') || '{}');
        const streakKey = `${isAlly ? 'ally' : 'rival'}-${username}`;
        const oppositeKey = `${isAlly ? 'rival' : 'ally'}-${username}`;
        
        // Check if they have an opposite streak that should break
        if (streaks[oppositeKey]) {
            const broken = streaks[oppositeKey];
            console.log(`💔 Streak broken: ${username} was ${isAlly ? 'rival' : 'ally'} for ${broken.streak} matches`);
            delete streaks[oppositeKey];
        }
        
        // Get or create current streak
        const current = streaks[streakKey] || {
            streak: 0,
            matches: [],
            lastUpdated: Date.now()
        };
        
        // Check if this is a new match (not duplicate)
        if (current.lastMatchId === matchId) {
            return null; // Already counted this match
        }
        
        // Increment streak
        current.streak += 1;
        current.lastMatchId = matchId;
        current.lastUpdated = Date.now();
        current.matches.push(matchId);
        
        // Keep only recent matches (last 20)
        if (current.matches.length > 20) {
            current.matches = current.matches.slice(-20);
        }
        
        streaks[streakKey] = current;
        
        // Save back to localStorage
        localStorage.setItem('userStreaks', JSON.stringify(streaks));
        
        // Check if this is a milestone streak
        const isMilestone = STREAK_CONFIG.MILESTONE_STREAKS.includes(current.streak);
        
        console.log(`${isAlly ? '🤝' : '⚔️'} Streak updated: ${username} = ${current.streak} ${isAlly ? 'agreements' : 'rivalries'}`);
        
        return {
            username,
            userId,
            streak: current.streak,
            isAlly,
            isMilestone,
            matchId
        };
        
    } catch (error) {
        console.error('Error updating streak:', error);
        return null;
    }
}

// ========================================
// SHOW STREAK NOTIFICATION
// ========================================

function showStreakNotification(streakData) {
    if (!streakData || streakData.streak < STREAK_CONFIG.MIN_STREAK) return;
    
    const { username, userId, streak, isAlly, isMilestone } = streakData;
    
    // Build message based on type and milestone
    let message, detail, icon, priority, cta;
    
    if (isAlly) {
        // ✅ ALLY STREAKS - Use champion messages for ALL cases
        let alertType = 'streak-ally-3'; // Default
        
        if (streak >= 20) {
            alertType = 'streak-ally-20';
        } else if (streak >= 10) {
            alertType = 'streak-ally-10';
        } else if (streak >= 5) {
            alertType = 'streak-ally-5';
        } else if (streak >= 3) {
            alertType = 'streak-ally-3';
        }
        
        const championMessage = window.championLoader?.getChampionMessage(alertType, {
            username: username,
            streakCount: streak
        });
        
        if (championMessage) {
            message = championMessage.message;
            detail = championMessage.detail;
            cta = championMessage.cta;
            icon = '🤝';
            
            // Set priority based on streak size
            if (streak >= 20) {
                priority = 2;
            } else if (streak >= 10) {
                priority = 3;
            } else if (streak >= 5) {
                priority = 4;
            } else {
                priority = 5;
            }
        } else {
            // ✅ Fallback if champion pack doesn't have this alert
            if (streak === 3) {
                message = `🔥 3-match streak with ${username}!`;
                detail = `You've both agreed on 3 matches in a row`;
                icon = '🤝';
                priority = 5;
            } else if (streak === 5) {
                message = `🔥🔥 5-match alliance with ${username}!`;
                detail = `Your taste in music is perfectly aligned!`;
                icon = '✨';
                priority = 4;
            } else if (streak === 10) {
                message = `🔥🔥🔥 EPIC 10-match streak with ${username}!`;
                detail = `You two are music soulmates!`;
                icon = '💫';
                priority = 3;
            } else if (streak >= 20) {
                message = `👑 LEGENDARY ${streak}-match streak with ${username}!`;
                detail = `This alliance is unbreakable!`;
                icon = '👑';
                priority = 2;
            } else if (isMilestone) {
                message = `🔥 ${streak}-match streak with ${username}!`;
                detail = `Your alliance grows stronger`;
                icon = '🤝';
                priority = 5;
            } else {
                return; // Don't show non-milestone streaks
            }
            
            cta = `View ${username}'s Profile`;
        }
    } else {
        // ✅ RIVAL STREAKS - Use champion messages for ALL cases
        let alertType = 'streak-rival-3'; // Default
        
        if (streak >= 20) {
            alertType = 'streak-rival-20';
        } else if (streak >= 10) {
            alertType = 'streak-rival-10';
        } else if (streak >= 5) {
            alertType = 'streak-rival-5';
        } else if (streak >= 3) {
            alertType = 'streak-rival-3';
        }
        
        const championMessage = window.championLoader?.getChampionMessage(alertType, {
            username: username,
            streakCount: streak
        });
        
        if (championMessage) {
            message = championMessage.message;
            detail = championMessage.detail;
            cta = championMessage.cta;
            icon = '⚔️';
            
            // Set priority based on streak size
            if (streak >= 20) {
                priority = 2;
            } else if (streak >= 10) {
                priority = 3;
            } else if (streak >= 5) {
                priority = 4;
            } else {
                priority = 5;
            }
        } else {
            // ✅ Fallback if champion pack doesn't have this alert
            if (streak === 3) {
                message = `⚔️ 3-match rivalry with ${username}!`;
                detail = `You've opposed each other 3 times`;
                icon = '⚔️';
                priority = 5;
            } else if (streak === 5) {
                message = `⚔️⚔️ 5-match rivalry with ${username}!`;
                detail = `This rivalry is heating up!`;
                icon = '🔥';
                priority = 4;
            } else if (streak === 10) {
                message = `⚔️⚔️⚔️ EPIC 10-match rivalry with ${username}!`;
                detail = `A legendary battle of taste!`;
                icon = '💀';
                priority = 3;
            } else if (streak >= 20) {
                message = `👹 LEGENDARY ${streak}-match rivalry with ${username}!`;
                detail = `The ultimate clash continues!`;
                icon = '👹';
                priority = 2;
            } else if (isMilestone) {
                message = `⚔️ ${streak}-match rivalry with ${username}!`;
                detail = `The battle intensifies`;
                icon = '⚔️';
                priority = 5;
            } else {
                return; // Don't show non-milestone streaks
            }
            
            cta = `View ${username}'s Profile`;
        }
    }
    
    // Show the notification
    showBulletin({
        priority: priority,
        type: 'streak',
        matchId: 'streak-notification',
        username: username,
        triggerUserId: userId,
        triggerUsername: username,
        message: message,
        detail: detail,
        icon: icon,
        cta: cta,
        ctaAction: 'navigate',
        targetUrl: `/profile?user=${username}`,
        relationship: isAlly ? 'ally-streak' : 'rival-streak',
        streakCount: streak
    });
    
    // Save to Firestore for notification center
    const currentUserId = localStorage.getItem('tournamentUserId');
    if (currentUserId && currentUserId !== 'anonymous') {
        saveNotification(currentUserId, {
            type: 'streak',
            priority: priority,
            message: message,
            detail: detail,
            icon: icon,
            triggerUsername: username,
            triggerUserId: userId,
            ctaText: cta,
            ctaAction: 'navigate',
            targetUrl: `/profile?user=${username}`,
            streakCount: streak,
            relationship: isAlly ? 'ally-streak' : 'rival-streak'
        });
    }
}

// ========================================
// PERSIST PROCESSED IDs ON PAGE UNLOAD
// ========================================

window.addEventListener('beforeunload', () => {
    try {
        // Save processed activity IDs to sessionStorage
        const idsArray = Array.from(lastSeenActivityIds);
        sessionStorage.setItem('processedActivityIds', JSON.stringify(idsArray.slice(-100)));
    } catch (e) {
        console.warn('Could not persist activity IDs:', e);
    }
});

// ========================================
// RESTORE PROCESSED IDs ON PAGE LOAD
// ========================================

try {
    const stored = sessionStorage.getItem('processedActivityIds');
    if (stored) {
        const idsArray = JSON.parse(stored);
        lastSeenActivityIds = new Set(idsArray);
        console.log(`✅ Restored ${lastSeenActivityIds.size} processed activity IDs`);
    }
} catch (e) {
    console.warn('Could not restore activity IDs:', e);
}


// ========================================
// SMART WELCOME TIMING
// ========================================

async function shouldShowWelcome(timeOnSite) {
    // Must be on site at least 5 seconds
    if (timeOnSite < 5000) return false;
    
    // ✅ NEW: Check if user has ANY votes in Firebase first
    const userId = localStorage.getItem('tournamentUserId');
    if (userId) {
        try {
            const votesRef = collection(db, 'votes');
            const q = query(votesRef, where('userId', '==', userId));
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                console.log('⏸️ User has votes - skipping welcome toast');
                return false;
            }
        } catch (error) {
            console.error('Error checking votes for welcome:', error);
        }
    }
    
    // Don't show twice in same session
    const welcomeShownThisSession = sessionStorage.getItem('welcomeToastShown');
    if (welcomeShownThisSession) return false;
    
    // Check last welcome (don't spam returning visitors)
    const lastWelcome = parseInt(localStorage.getItem('lastWelcomeToast') || '0');
    const hoursSinceWelcome = (Date.now() - lastWelcome) / (1000 * 60 * 60);
    
    // Show if first time OR been 12+ hours since last welcome
    return !lastWelcome || hoursSinceWelcome >= 12;
}
async function showWelcomeToast() {
    const today = new Date().toDateString();
    const lastVisitDate = localStorage.getItem('lastVisitDate');
    const lastVisitTime = localStorage.getItem('lastVisitTime');
    
    // Calculate days since last visit
    const daysSince = lastVisitTime 
        ? Math.floor((Date.now() - parseInt(lastVisitTime)) / (1000 * 60 * 60 * 24))
        : 0;
    
    // Save today's visit
    localStorage.setItem('lastVisitDate', today);
    localStorage.setItem('lastVisitTime', Date.now().toString());
    
    // Determine welcome type
    let welcomeType;
    if (daysSince === 0) {
        welcomeType = 'first-time';
    } else if (daysSince === 1) {
        welcomeType = 'streak';
    } else if (daysSince >= 3) {
        welcomeType = 'comeback';
        localStorage.setItem('daysSinceLastVisit', daysSince.toString());
    } else {
        welcomeType = 'back';
    }
    
    // ✅ Get champion-voiced welcome message
    const championLoader = window.championLoader;
    if (!championLoader) {
        console.warn('⚠️ Champion loader not available');
        return;
    }
    
    const welcomeData = championLoader.getCustomMessage(`welcome-${welcomeType}`);
    
    if (!welcomeData) {
        console.warn(`⚠️ No welcome message for type: ${welcomeType}`);
        return;
    }
    
    // Replace {days} placeholder for comeback messages
    if (welcomeType === 'comeback' && daysSince > 0) {
        welcomeData.message = welcomeData.message.replace('{days}', daysSince);
        welcomeData.detail = welcomeData.detail.replace('{days}', daysSince);
    }
    
    try {
        // Count live matches
        const response = await fetch('/api/matches');
        const allMatches = await response.json();
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        // Get random match thumbnail
        const randomMatch = liveMatches[Math.floor(Math.random() * liveMatches.length)];
        const thumbnailUrl = randomMatch 
            ? getThumbnailUrl(randomMatch.song1?.youtubeUrl) || getThumbnailUrl(randomMatch.song2?.youtubeUrl)
            : 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg';
        
        const isOnVotePage = window.location.pathname.includes('vote.html');
        
        showBulletin({
            priority: 1,
            type: 'welcome',
            matchId: 'welcome',
            thumbnailUrl: thumbnailUrl,
            message: welcomeData.message,
            detail: welcomeData.detail,
            cta: welcomeData.cta,
            action: isOnVotePage ? 'dismiss' : 'navigate',
            targetUrl: '/vote.html',
            duration: 5000
        });
        
        // Mark as shown
        sessionStorage.setItem('welcomeToastShown', 'true');
        localStorage.setItem('lastWelcomeToast', Date.now().toString());
        sessionStorage.setItem('pageLoadTime', Date.now().toString());
        
        // Award comeback achievement if eligible
        if (welcomeType === 'comeback' && daysSince >= 3) {
            setTimeout(async () => {
                await checkComebackAchievementGlobal();
            }, 6000); // After welcome toast finishes
        }
        
        console.log(`👋 Daily welcome shown: ${welcomeType}`);
        
    } catch (error) {
        console.error('Error showing welcome toast:', error);
    }
}

/**
 * Check and award comeback achievement (global version)
 */
async function checkComebackAchievementGlobal() {
    try {
        const { unlockAchievementInFirebase } = await import('./achievement-tracker.js');
        const { ACHIEVEMENTS } = await import('./achievements.js');
        
        const comebackAchievement = ACHIEVEMENTS['daily-comeback'];
        if (!comebackAchievement) return;
        
        // Check if already unlocked
        const unlockedAchievements = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
        if (unlockedAchievements.includes('daily-comeback')) {
            console.log('ℹ️ Comeback achievement already unlocked');
            return;
        }
        
        // Unlock it
        const wasUnlocked = await unlockAchievementInFirebase('daily-comeback', comebackAchievement.xp);
        
        if (wasUnlocked && window.showAchievementUnlock) {
            // Import and award XP
            const { addXP } = await import('./rank-system.js');
            addXP(comebackAchievement.xp);
            
            // Show achievement unlock
            setTimeout(() => {
                window.showAchievementUnlock(comebackAchievement);
            }, 1000);
        }
        
    } catch (error) {
        console.error('⚠️ Error checking comeback achievement:', error);
    }
}

// ========================================
// ENCOURAGEMENT TOASTS FOR NON-VOTERS
// ========================================

async function showEncouragementToast(type = 'gentle') {
    try {
        // ✅ Don't show if welcome was shown in last 5 minutes
        const lastWelcome = parseInt(localStorage.getItem('lastWelcomeToast') || '0');
        const minutesSinceWelcome = (Date.now() - lastWelcome) / (1000 * 60);
        
        if (minutesSinceWelcome < 5) {
            console.log(`⏸️ Skipping ${type} encouragement - welcome was shown ${Math.round(minutesSinceWelcome)}min ago`);
            return;
        }
        
        const response = await fetch('/api/matches');
        const allMatches = await response.json();
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        // Get random match for thumbnail
        const randomMatch = liveMatches[Math.floor(Math.random() * liveMatches.length)];
        const thumbnailUrl = randomMatch 
            ? getThumbnailUrl(randomMatch.song1?.youtubeUrl) || getThumbnailUrl(randomMatch.song2?.youtubeUrl)
            : 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg';
        
        const messages = {
            gentle: {
                icon: '👀',
                message: 'Still deciding?',
                detail: 'Pick your favorite songs and see the results in real-time!',
                cta: 'Vote Now'
            },
            urgent: {
                icon: '⏰',
                message: 'Matches closing soon!',
                detail: `Don't miss your chance to influence the winners!`,
                cta: 'Cast Your Votes'
            }
        };
        
        const config = messages[type] || messages.gentle;
        
        showBulletin({
            priority: 5,
            type: 'encouragement',
            matchId: 'encouragement',
            thumbnailUrl: thumbnailUrl,
            message: `${config.icon} ${config.message}`,
            detail: config.detail,
            cta: config.cta,
            action: 'navigate',
            targetUrl: '/matches.html'
        });
        
        // Track last encouragement
        localStorage.setItem('lastEncouragementToast', Date.now().toString());
        
        console.log(`📣 ${type} encouragement toast shown`);
        
    } catch (error) {
        console.error('Error showing encouragement toast:', error);
    }
}

// ========================================
// CHECK FOR CLOSING MATCHES (URGENCY)
// ========================================

async function checkForClosingMatches() {
    try {
        const response = await fetch('/api/matches');
        const allMatches = await response.json();
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        // Check if any match closes in next 6 hours
        const closingSoon = liveMatches.some(match => {
            const hoursLeft = getHoursUntilClose(match);
            return hoursLeft !== null && hoursLeft <= 6;
        });
        
        return closingSoon;
        
    } catch (error) {
        console.error('Error checking closing matches:', error);
        return false;
    }
}

function showBulletin(notification) {

    // ✅ Final safety net
    if (!notification.matchId) {
        const allowedWithoutMatch = ['welcome', 'encouragement', 'urgency', 'achievement', 'level-up'];
        if (!allowedWithoutMatch.includes(notification.type)) {
            console.warn('⚠️ Bulletin missing matchId:', notification.type);
            return;
        }
    }

    let banner = document.getElementById('bulletin-banner');
    
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'bulletin-banner';
        banner.className = 'bulletin-banner';
        document.body.appendChild(banner);
        
        // Inject styles only once
        if (!document.getElementById('bulletin-styles')) {
            const style = document.createElement('style');
            style.id = 'bulletin-styles';
            style.textContent = `
/* ========================================
   CSS VARIABLES FOR CHAMPION THEMES
======================================== */

:root {
    --bulletin-bg: rgba(0, 0, 0, 0.95);
    --bulletin-bg-size: cover;
    --bulletin-bg-position: center 30%;
    --bulletin-border: rgba(200, 170, 110, 0.3);
    --bulletin-glow: 0 0 20px rgba(200, 170, 110, 0.15);
    --bulletin-title: #C8AA6E;
    --bulletin-detail: rgba(255, 255, 255, 0.7);
    --bulletin-btn-bg: linear-gradient(135deg, #C8AA6E, #B89A5E);
    --bulletin-btn-hover: linear-gradient(135deg, #D4B876, #C8AA6E);
    --bulletin-btn-text: #0a0a0a;
    --bulletin-text-shadow: none;
}

/* ========================================
   TOAST-STYLE BULLETIN - BOTTOM RIGHT
======================================== */

.bulletin-banner {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999;
    width: 380px;
    max-width: calc(100vw - 48px);
    
    /* Full champion splash background */
    background: var(--bulletin-bg);
    background-size: var(--bulletin-bg-size);
    background-position: var(--bulletin-bg-position);
    backdrop-filter: blur(10px);
    border: 1px solid var(--bulletin-border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), var(--bulletin-glow);
    overflow: hidden;

    /* Slide in from bottom-right */
    transform: translateX(120%) translateY(20px);
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.bulletin-banner.show {
    transform: translateX(0) translateY(0);
    opacity: 1;
}

/* Dark overlay only on bottom portion */
/* Dark gradient overlay on bottom half for text readability */
.bulletin-banner::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 200px;  /* Only cover the text/button area */
    background: linear-gradient(to bottom, 
        transparent 0%, 
        rgba(0, 0, 0, 0.5) 20%,
        rgba(0, 0, 0, 0.8) 50%,
        rgba(0, 0, 0, 0.93) 80%,
        rgba(0, 0, 0, 0.98) 100%
    );
    z-index: 1;
    pointer-events: none;
}

/* ========================================
   TOAST CONTENT LAYOUT
======================================== */

.bulletin-toast-content {
    position: relative;
    z-index: 2;
    padding: 120px 1rem 1rem 1rem;  /* ✅ Add 120px space at top for clear banner */
    display: flex;
    align-items: flex-start;
    gap: 1rem;
}

/* ========================================
   CIRCULAR THUMBNAIL WITH OVERLAY ICON
======================================== */

.bulletin-thumbnail {
    position: relative;
    width: 64px;
    height: 64px;
    flex-shrink: 0;
}

.thumbnail-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(200, 170, 110, 0.3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.thumbnail-overlay {
    position: absolute;
    bottom: -4px;
    right: -4px;
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, #C8AA6E, #B89A5E);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    border: 2px solid rgba(0, 0, 0, 0.95);
    animation: pulse 2s ease-in-out infinite;
    box-shadow: 0 2px 8px rgba(200, 170, 110, 0.4);
}

@keyframes pulse {
    0%, 100% { 
        transform: scale(1);
    }
    50% { 
        transform: scale(1.1);
    }
}

/* ========================================
   TOAST TEXT
======================================== */

.bulletin-toast-text {
    flex: 1;
    min-width: 0;
    padding-right: 24px; /* Space for close button */
}

.bulletin-message {
    font-family: 'Cinzel', serif;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--bulletin-title);
    margin-bottom: 0.35rem;
    letter-spacing: 0.03em;
    line-height: 1.3;
    text-shadow: var(--bulletin-text-shadow);
}

.bulletin-detail {
    font-size: 0.8rem;
    color: var(--bulletin-detail);
    font-weight: 400;
    line-height: 1.4;
}

/* ========================================
   CLOSE BUTTON (TOP RIGHT)
======================================== */

.bulletin-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.9));
    border: 2px solid var(--bulletin-title);  /* Pink for Jinx, gold for default */
    color: var(--bulletin-title);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 1.4rem;
    font-weight: 900;
    line-height: 1;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    z-index: 3;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.bulletin-close:hover {
    background: var(--bulletin-title);  /* ✅ Fill with champion color on hover */
    color: #000;  /* ✅ Black X on colored background */
    transform: rotate(90deg) scale(1.15);
    box-shadow: 0 0 20px var(--bulletin-title);  /* ✅ Champion-colored glow */
    border-color: var(--bulletin-title);
}

/* ========================================
   CTA BUTTON (FULL WIDTH AT BOTTOM)
======================================== */

.bulletin-toast-cta {
    position: relative;
    z-index: 2;
    width: 100%;
    background: var(--bulletin-btn-bg);
    color: var(--bulletin-btn-text);
    border: none;
    border-top: 1px solid rgba(200, 170, 110, 0.2);
    padding: 0.875rem;
    border-radius: 0 0 12px 12px;
    font-family: 'Cinzel', serif;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.2);
}

.bulletin-toast-cta:hover {
    background: var(--bulletin-btn-hover);
    box-shadow: 0 -2px 12px rgba(200, 170, 110, 0.3);
}

.bulletin-toast-cta:active {
    transform: scale(0.98);
}

.bulletin-toast-cta-secondary {
    position: relative;
    z-index: 2;
    width: 100%;
    background: rgba(200, 170, 110, 0.15);
    color: #C8AA6E;
    border: 1px solid rgba(200, 170, 110, 0.3);
    padding: 0.75rem;
    border-radius: 0 0 12px 12px;
    font-family: 'Cinzel', serif;
    font-weight: 600;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: -1px;
}

.bulletin-toast-cta-secondary:hover {
    background: rgba(200, 170, 110, 0.25);
    border-color: #C8AA6E;
}

/* ========================================
   ACHIEVEMENT-SPECIFIC TOAST STYLING
======================================== */

.achievement-toast {
    background: linear-gradient(135deg, rgba(200, 170, 110, 0.2), rgba(180, 150, 90, 0.2)) !important;
}

.achievement-badge-large {
    width: 72px;
    height: 72px;
    background: linear-gradient(135deg, #C8AA6E, #B89A5E);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    box-shadow: 0 4px 20px rgba(200, 170, 110, 0.4),
                0 0 40px rgba(200, 170, 110, 0.2);
    border: 3px solid rgba(255, 215, 0, 0.3);
    flex-shrink: 0;
    animation: achievementPulse 2s ease-in-out infinite;
}

.achievement-label {
    font-size: 0.65rem;
    font-weight: 700;
    color: #C8AA6E;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 0.25rem;
}

.achievement-title {
    color: #FFD700 !important;
    font-size: 1rem !important;
    font-weight: 700;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.achievement-cta {
    background: linear-gradient(135deg, #FFD700, #C8AA6E) !important;
    color: #1a1a1a !important;
}

.bulletin-banner.achievement {
    border: 2px solid rgba(255, 215, 0, 0.5) !important;
    box-shadow: 0 8px 32px rgba(200, 170, 110, 0.4),
                0 0 40px rgba(255, 215, 0, 0.2) !important;
}

@keyframes achievementPop {
    0% {
        transform: scale(0) rotate(0deg);
    }
    50% {
        transform: scale(1.2) rotate(10deg);
    }
    100% {
        transform: scale(1) rotate(0deg);
    }
}

@keyframes achievementPulse {
    0%, 100% {
        box-shadow: 0 4px 20px rgba(200, 170, 110, 0.4),
                    0 0 40px rgba(200, 170, 110, 0.2);
    }
    50% {
        box-shadow: 0 4px 30px rgba(200, 170, 110, 0.6),
                    0 0 60px rgba(255, 215, 0, 0.4);
    }
}

/* ========================================
   LEVEL-UP TOAST STYLING
======================================== */

.level-up-toast {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.2)) !important;
}

.level-badge-large {
    width: 72px;
    height: 72px;
    background: linear-gradient(135deg, #3B82F6, #2563EB);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 900;
    color: white;
    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4),
                0 0 40px rgba(59, 130, 246, 0.2);
    border: 3px solid rgba(147, 197, 253, 0.3);
    flex-shrink: 0;
}

.level-label {
    font-size: 0.65rem;
    font-weight: 700;
    color: #60A5FA;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 0.25rem;
}

.level-title {
    color: #3B82F6 !important;
    font-size: 1rem !important;
    font-weight: 700;
}

.level-cta {
    background: linear-gradient(135deg, #3B82F6, #2563EB) !important;
    color: white !important;
}

.bulletin-banner.level-up {
    border: 2px solid rgba(59, 130, 246, 0.5) !important;
    box-shadow: 0 8px 32px rgba(59, 130, 246, 0.4),
                0 0 40px rgba(59, 130, 246, 0.2) !important;
}

@keyframes levelPop {
    0% {
        transform: scale(0) rotate(0deg);
    }
    50% {
        transform: scale(1.2) rotate(360deg);
    }
    100% {
        transform: scale(1) rotate(360deg);
    }
}

/* ========================================
   RESPONSIVE DESIGN
======================================== */

/* Tablet */
@media (max-width: 768px) {
    .bulletin-banner {
        bottom: 16px;
        right: 16px;
        width: 340px;
        max-width: calc(100vw - 32px);
    }
    
    .bulletin-thumbnail {
        width: 56px;
        height: 56px;
    }
    
    .thumbnail-overlay {
        width: 24px;
        height: 24px;
        font-size: 0.8rem;
    }
    
    .bulletin-message {
        font-size: 0.875rem;
    }
    
    .bulletin-detail {
        font-size: 0.75rem;
    }
    
    .bulletin-toast-cta {
        padding: 0.75rem;
        font-size: 0.8rem;
    }
}

/* Mobile */
@media (max-width: 640px) {
    .bulletin-banner {
        bottom: 12px;
        right: 12px;
        left: 12px;
        width: auto;
        max-width: none;
    }
    
    .bulletin-toast-content {
        padding: 0.875rem;
        gap: 0.75rem;
    }
    
    .bulletin-thumbnail {
        width: 52px;
        height: 52px;
    }
    
    .bulletin-message {
        font-size: 0.85rem;
    }
    
    .bulletin-detail {
        font-size: 0.7rem;
    }
    
    .bulletin-toast-cta {
        font-size: 0.75rem;
        padding: 0.7rem;
    }
}

@media (max-width: 480px) {
    .bulletin-banner {
        bottom: 8px;
        right: 8px;
        left: 8px;
    }
    
    .bulletin-toast-content {
        padding: 0.75rem;
    }
    
    .bulletin-thumbnail {
        width: 48px;
        height: 48px;
    }
    
    .thumbnail-overlay {
        width: 22px;
        height: 22px;
        font-size: 0.75rem;
    }
}
            `;
            document.head.appendChild(style);
            console.log('✅ Bulletin CSS injected');
        }
    }
    
    // Update content
    currentBulletin = notification;

    // ✅ ESC key handler
const escapeHandler = (e) => {
    if (e.key === 'Escape' && currentBulletin) {
        hideBulletin();
        document.removeEventListener('keydown', escapeHandler);
    }
};

document.addEventListener('keydown', escapeHandler);


// ✅ Apply champion pack theme
const championPack = window.championLoader?.getCurrentPack();
if (championPack && championPack.theme) {
    const theme = championPack.theme;
    const root = document.documentElement;
    
    root.style.setProperty('--bulletin-bg', theme.background || 'rgba(0, 0, 0, 0.95)');
    root.style.setProperty('--bulletin-bg-size', theme.backgroundSize || 'auto');
    root.style.setProperty('--bulletin-bg-position', theme.backgroundPosition || 'center');
    root.style.setProperty('--bulletin-champion-strip', theme.championStrip || 'none'); // ✅ NEW
    root.style.setProperty('--bulletin-border', theme.borderColor || 'rgba(200, 170, 110, 0.3)');
    root.style.setProperty('--bulletin-glow', theme.borderGlow || '0 0 20px rgba(200, 170, 110, 0.15)');
    root.style.setProperty('--bulletin-title', theme.titleColor || '#C8AA6E');
    root.style.setProperty('--bulletin-detail', theme.detailColor || 'rgba(255, 255, 255, 0.7)');
    root.style.setProperty('--bulletin-btn-bg', theme.buttonBackground || 'linear-gradient(135deg, #C8AA6E, #B89A5E)');
    root.style.setProperty('--bulletin-btn-hover', theme.buttonHover || 'linear-gradient(135deg, #D4B876, #C8AA6E)');
    root.style.setProperty('--bulletin-btn-text', theme.buttonText || '#0a0a0a');
    root.style.setProperty('--bulletin-text-shadow', theme.textShadow || 'none');
    
    } else if (notification.thumbnailUrl) {
    // ✅ DEFAULT PACK: Use song thumbnail as background
    const root = document.documentElement;
    
    root.style.setProperty('--bulletin-bg', `
        linear-gradient(to bottom, 
            rgba(10, 10, 10, 0.3) 0%, 
            rgba(10, 10, 10, 0.7) 50%,
            rgba(10, 10, 10, 0.95) 100%
        ),
        url('${notification.thumbnailUrl}')
    `);
    root.style.setProperty('--bulletin-bg-size', 'cover');
    root.style.setProperty('--bulletin-bg-position', 'center 30%');
    root.style.setProperty('--bulletin-border', 'rgba(200, 170, 110, 0.3)');
    root.style.setProperty('--bulletin-glow', '0 0 20px rgba(200, 170, 110, 0.15)');
    root.style.setProperty('--bulletin-title', '#C8AA6E');
    root.style.setProperty('--bulletin-detail', 'rgba(255, 255, 255, 0.7)');
    root.style.setProperty('--bulletin-btn-bg', 'linear-gradient(135deg, #C8AA6E, #B89A5E)');
    root.style.setProperty('--bulletin-btn-hover', 'linear-gradient(135deg, #D4B876, #C8AA6E)');
    root.style.setProperty('--bulletin-btn-text', '#0a0a0a');
    root.style.setProperty('--bulletin-text-shadow', '0 2px 6px rgba(0, 0, 0, 0.9)');
    
    console.log(`🎨 Applied default theme with song thumbnail background`);
}

    
    const icons = {
        danger: '🚨',
        novotes: '🆘',
        nailbiter: '🔥',
        winning: '🎯',
        comeback: '🎉',
        lowvotes: '⚠️',
        'close-match': '🔥',
        'new-match': '🆕',
        'low-turnout': '📊',
        welcome: '🎵',
        encouragement: '👀',
        'return-voter': '👋',
        achievement: '🏆',
        'level-up': '⬆️'
    };
    
    const icon = icons[notification.type] || '📢';
    
    // ✅ LEVEL-UP SPECIFIC STYLING
    if (notification.type === 'level-up') {
        const levelMatch = notification.message.match(/Level (\d+)/);
        const level = levelMatch ? levelMatch[1] : '?';
        
        banner.innerHTML = `
            <div class="bulletin-toast-content level-up-toast">
                <div class="level-badge-large">
                    ${level}
                </div>
                <div class="bulletin-toast-text">
                    <div class="level-label">LEVEL UP!</div>
                    <div class="bulletin-message level-title">${notification.message}</div>
                    <div class="bulletin-detail">${notification.detail}</div>
                </div>
                <button class="bulletin-close" onclick="window.dismissBulletin()">×</button>
            </div>
            <button class="bulletin-toast-cta level-cta" onclick="window.handleBulletinCTA()">
                ${notification.cta || 'View Progress'}
            </button>
            ${notification.secondaryCta ? `
                <button class="bulletin-toast-cta-secondary" 
                        onclick="window.location.href='${notification.secondaryCta.url}'">
                    ${notification.secondaryCta.text}
                </button>
            ` : ''}
        `;
        
        banner.className = 'bulletin-banner level-up show';
        
        // Add special animation for level badge
        setTimeout(() => {
            const badge = banner.querySelector('.level-badge-large');
            if (badge) {
                badge.style.animation = 'levelPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            }
        }, 100);
        
    } 
    // ✅ ACHIEVEMENT SPECIFIC STYLING
    else if (notification.type === 'achievement') {
 // ✅ NEW: Support League item icons (can be URL or emoji)
    const achievementIcon = notification.thumbnailUrl || notification.icon || '🏆';
    const isLeagueItem = typeof achievementIcon === 'string' && achievementIcon.startsWith('http');

       banner.innerHTML = `
        <div class="bulletin-toast-content achievement-toast">
            <div class="achievement-badge-large" style="${isLeagueItem ? 'background: linear-gradient(135deg, rgba(10,10,10,0.95), rgba(20,20,30,0.95)); padding: 8px; border: 2px solid rgba(200, 170, 110, 0.4);' : ''}">
                ${isLeagueItem ? 
                    `<img src="${achievementIcon}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(200, 170, 110, 0.7));">` 
                    : achievementIcon
                }
            </div>
            <div class="bulletin-toast-text">
                <div class="achievement-label">ACHIEVEMENT UNLOCKED</div>
                <div class="bulletin-message achievement-title">${notification.message.replace(/🏆 Achievement Unlocked: /, '')}</div>
                <div class="bulletin-detail">${notification.detail}</div>
            </div>
            <button class="bulletin-close" onclick="window.dismissBulletin()">×</button>
        </div>
        <button class="bulletin-toast-cta achievement-cta" onclick="window.handleBulletinCTA()">
            ${notification.cta || 'View Achievements'}
        </button>
    `;
    
    banner.className = 'bulletin-banner achievement show';
        
       // ✅ NEW: Add rarity border color
    if (notification.rarity) {
        banner.setAttribute('data-rarity', notification.rarity);
    }
    
    // Add special animation for achievement badge
    setTimeout(() => {
        const badge = banner.querySelector('.achievement-badge-large');
        if (badge) {
            badge.style.animation = 'achievementPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        }
    }, 100);
}
   // ✅ DEFAULT STYLING (for match alerts, welcome, etc.)
// ✅ DEFAULT STYLING (for match alerts, welcome, etc.)
else {
    // ========================================
    // BUILD THUMBNAIL/AVATAR IMAGE
    // ========================================
    let thumbnailHtml = '';
    
    // ✅ SOCIAL ALERTS: User Avatar + Song Badge
    if (notification.type === 'live-activity' && (notification.username || notification.triggerUsername)) {
        const username = notification.username || notification.triggerUsername;
        
        // ✅ CASE 1: User has avatar - show avatar with song badge
        if (notification.thumbnailUrl) {
            thumbnailHtml = `
                <div class="bulletin-thumbnail" style="position: relative; width: 64px; height: 64px;">
                    <!-- User avatar (large background) -->
                    <img src="${notification.thumbnailUrl}" 
                         alt="${username}"
                         class="thumbnail-img" 
                         style="width: 100%; height: 100%; border-radius: 12px; object-fit: cover; border: 2px solid rgba(200, 170, 110, 0.3); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);">
                    
                    <!-- Song thumbnail (small overlay bottom-right) -->
                    ${notification.secondaryThumbnail ? `
                        <img src="${notification.secondaryThumbnail}"
                             alt="${notification.song || 'Song'}"
                             style="
                                 position: absolute;
                                 bottom: -6px;
                                 right: -6px;
                                 width: 36px;
                                 height: 36px;
                                 border-radius: 8px;
                                 object-fit: cover;
                                 border: 3px solid #1a1a2e;
                                 box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
                             ">
                    ` : ''}
                </div>
            `;
        }
        // ✅ CASE 2: No avatar - show initial with song badge
        else {
            const initial = username.charAt(0).toUpperCase();
            const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
            const colorIndex = username.charCodeAt(0) % colors.length;
            const bgColor = colors[colorIndex];
            
            thumbnailHtml = `
                <div class="bulletin-thumbnail" style="position: relative; width: 64px; height: 64px;">
                    <!-- User initial (background) -->
                    <div style="
                        width: 100%;
                        height: 100%;
                        border-radius: 12px;
                        background: ${bgColor};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.8rem;
                        font-weight: 700;
                        color: white;
                        border: 2px solid rgba(200, 170, 110, 0.3);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                    ">
                        ${initial}
                    </div>
                    
                    <!-- Song thumbnail (small overlay bottom-right) -->
                    ${notification.secondaryThumbnail ? `
                        <img src="${notification.secondaryThumbnail}"
                             alt="${notification.song || 'Song'}"
                             style="
                                 position: absolute;
                                 bottom: -6px;
                                 right: -6px;
                                 width: 36px;
                                 height: 36px;
                                 border-radius: 8px;
                                 object-fit: cover;
                                 border: 3px solid #1a1a2e;
                                 box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
                             ">
                    ` : ''}
                </div>
            `;
        }
    }
    // MATCH ALERTS: Song + Icon badge
    else if (notification.thumbnailUrl) {
        thumbnailHtml = `
            <div class="bulletin-thumbnail">
                <img src="${notification.thumbnailUrl}" 
                     alt="${notification.song || 'Match'}" 
                     class="thumbnail-img">
                <div class="thumbnail-overlay">${icon}</div>
            </div>
        `;
    }
    // USER ONLY: Avatar + Icon badge
    else if (notification.username || notification.triggerUsername) {
        const username = notification.username || notification.triggerUsername;
        const initial = username.charAt(0).toUpperCase();
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
        const colorIndex = username.charCodeAt(0) % colors.length;
        const bgColor = colors[colorIndex];
        
        thumbnailHtml = `
            <div class="bulletin-thumbnail">
                <div class="thumbnail-img" style="background: ${bgColor}; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700; color: white;">
                    ${initial}
                </div>
                <div class="thumbnail-overlay">${icon}</div>
            </div>
        `;
    }
    // GENERIC: Just music icon
    else {
        thumbnailHtml = `
            <div class="bulletin-thumbnail">
                <div class="thumbnail-img" style="background: linear-gradient(135deg, #C8AA6E, #B89A5E); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">🎵</div>
                <div class="thumbnail-overlay">${icon}</div>
            </div>
        `;
    }
    
    banner.innerHTML = `
        <div class="bulletin-toast-content">
            ${thumbnailHtml}
            <div class="bulletin-toast-text">
                <div class="bulletin-message">${notification.message}</div>
                <div class="bulletin-detail">${notification.detail}</div>
            </div>
            <button class="bulletin-close" onclick="window.dismissBulletin()">×</button>
        </div>
        <button class="bulletin-toast-cta" onclick="window.handleBulletinCTA()">${notification.cta}</button>
    `;
    
    banner.className = `bulletin-banner ${notification.type}`;
}

setTimeout(() => banner.classList.add('show'), 10);

console.log(`📢 Bulletin shown: ${notification.type}`);
}


// ========================================
// BULLETIN ACTIONS
// ========================================

function hideBulletin() {
    const banner = document.getElementById('bulletin-banner');
    if (banner) {
        banner.classList.remove('show');
    }
}

window.dismissBulletin = function() {
    if (!currentBulletin) return;
    
    const matchId = currentBulletin.matchId;
    const type = currentBulletin.type;
    const severityTier = currentBulletin.severityTier; // ✅ Get severity tier
    
    // ✅ Build dismissal keys with severity tier
    const dismissalKeys = [];
    
    if (type === 'danger' || type === 'danger-repeat') {
        // ✅ Dismiss both danger types for this match AND severity tier
        if (severityTier) {
            dismissalKeys.push(`danger-${matchId}-${severityTier}`);
            dismissalKeys.push(`danger-repeat-${matchId}-${severityTier}`);
        } else {
            // Fallback if no severity tier (shouldn't happen for new alerts)
            dismissalKeys.push(`danger-${matchId}`);
            dismissalKeys.push(`danger-repeat-${matchId}`);
        }
    } 
    else if (type === 'comeback' || type === 'nailbiter' || type === 'winning') {
        // ✅ Include severity tier for other match alerts too
        if (severityTier) {
            dismissalKeys.push(`${type}-${matchId}-${severityTier}`);
        } else {
            dismissalKeys.push(`${type}-${matchId}`);
        }
    }
    else {
        // Normal dismissal for non-match alerts
        dismissalKeys.push(`${type}-${matchId}`);
    }
    
    // ✅ Add all variations to dismissedBulletins
    dismissalKeys.forEach(key => {
        dismissedBulletins.add(key);
    });
    
    // ✅ Save to localStorage with timestamps
    const now = Date.now();
    const dismissed = Array.from(dismissedBulletins).map(key => ({
        key: key,
        timestamp: now
    }));
    
    localStorage.setItem('dismissedBulletins', JSON.stringify(dismissed));
    
    console.log(`🚫 Dismissed: ${dismissalKeys.join(', ')} (expires in 24h)`);
    
    hideBulletin();
    currentBulletin = null;
};

window.handleBulletinCTA = function() {
    if (!currentBulletin) return;
    
    console.log(`📤 Bulletin CTA clicked: ${currentBulletin.type}`);
    
    // ✅ PRIORITY 1: Check for ctaAction function (level-up, achievement, etc.)
    if (currentBulletin.ctaAction && typeof currentBulletin.ctaAction === 'function') {
        currentBulletin.ctaAction();
        hideBulletin();
        return;
    }
    
    // ✅ PRIORITY 2: Handle emote sending (NEW!)
    if (currentBulletin.action === 'send-emote' && currentBulletin.emoteData) {
        window.handleEmoteClick(
            currentBulletin.emoteData.targetUsername,
            currentBulletin.emoteData.targetUserId,
            currentBulletin.emoteData.emoteType,
            currentBulletin.emoteData.matchData
        );
        hideBulletin();
        return;
    }
    
    // Handle all match-specific alerts
    if (['danger', 'nailbiter', 'comeback', 'winning', 'live-activity', 'novotes', 'lowvotes'].includes(currentBulletin.type)) {
        if (currentBulletin.matchId && currentBulletin.matchId !== 'test-match') {
            window.location.href = `/vote.html?match=${currentBulletin.matchId}`;
            return; // ✅ Don't hide - page is navigating away
        } else {
            showNotificationToast('Match not available', 'error');
            hideBulletin(); // ✅ Hide only on error
            return;
        }
    }
    // Handle general navigation (welcome, encouragement, etc.)
    else if (currentBulletin.action === 'navigate' && currentBulletin.targetUrl) {
        window.location.href = currentBulletin.targetUrl;
        return; // ✅ Don't hide - page is navigating away
    }
    
    // ✅ Only hide if no navigation happened
    hideBulletin();
};

// ========================================
// TOAST NOTIFICATION HELPER
// ========================================

function showNotificationToast(message, type = 'info') {
    // Simple toast notification (you can enhance this)
    console.log(`📬 ${type.toUpperCase()}: ${message}`);
    
    // If you have a toast system, use it here
    // Otherwise, just log to console
}

// ========================================
// INITIALIZATION
// ========================================

function initBulletinSystem() {
    console.log('🎯 Initializing bulletin system...');

    // ✅ WHITELIST: Only enable on specific pages
    const allowedPages = [
        'vote.html',
        'my-votes.html',      // ✅ ADDED (you probably want alerts here)
        'matches.html',
        'feed.html',
        'activity.html',
        'brackets.html',
        'profile.html',
            'profile',        // ✅ Add this for /profile URLs without .html

        // ❌ REMOVED 'index.html' - this is your landing page that was showing unwanted alerts
    ];

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isAllowedPage = allowedPages.some(page => currentPage.includes(page));
    
    if (!isAllowedPage) {
        console.log(`📴 Bulletins disabled on ${currentPage} (only enabled on: ${allowedPages.join(', ')})`);
        
        // Still check for social activity (ally/rival)
        checkRecentVotes();
        setInterval(checkRecentVotes, ACTIVITY_CHECK_INTERVAL);
        
        return;
    }
    
    console.log(`✅ Bulletins enabled on ${currentPage}`);

    // ✅ NEW: Restore recent bulletins from sessionStorage
    try {
        const persisted = JSON.parse(sessionStorage.getItem('recentBulletins') || '{}');
        Object.entries(persisted).forEach(([key, timestamp]) => {
            recentlyShownBulletins.set(key, timestamp);
        });
        if (Object.keys(persisted).length > 0) {
            console.log(`✅ Restored ${recentlyShownBulletins.size} recent bulletin timestamps`);
        }
    } catch (e) {
        console.warn('Could not restore bulletin cooldowns:', e);
    }
    
    // ✅ NEW: Load dismissed bulletins and check for expired ones
    try {
        const dismissed = JSON.parse(localStorage.getItem('dismissedBulletins') || '[]');
        const now = Date.now();
        const validDismissals = [];
        
        dismissed.forEach(item => {
            // Handle old format (string) or new format (object)
            const key = typeof item === 'string' ? item : item.key;
            const timestamp = typeof item === 'string' ? now : item.timestamp;
            
            // Check if expired (24 hours = 86400000 ms)
            const ageMs = now - timestamp;
            const ageHours = ageMs / (1000 * 60 * 60);
            
            if (ageHours < 24) {
                // Still valid
                dismissedBulletins.add(key);
                validDismissals.push({ key: key, timestamp: timestamp });
            } else {
                console.log(`🔄 Dismissal expired: ${key} (${Math.round(ageHours)}h old)`);
            }
        });
        
        // Save cleaned list back to localStorage
        localStorage.setItem('dismissedBulletins', JSON.stringify(validDismissals));
        
        console.log(`✅ Loaded ${dismissedBulletins.size} active dismissals`);
        
    } catch (e) {
        console.error('Error loading dismissed bulletins:', e);
    }
    
    // Start user's own match checking
    checkAndShowBulletin();
    adjustPollingRate();
    
    // ✅ START SOCIAL ACTIVITY CHECKING (ally/rival notifications)
    checkRecentVotes(); // Run once immediately
    setInterval(checkRecentVotes, ACTIVITY_CHECK_INTERVAL); // Then every 30 seconds
    
    console.log('✅ Bulletin system initialized with live activity');
}

// ========================================
// INITIALIZATION WITH NOTIFICATION CENTER
// ========================================

async function initializeNotificationSystem() {
    console.log('🎯 Initializing complete notification system...');

      // Wait for navigation to be ready
    await new Promise((resolve) => {
        const checkNav = setInterval(() => {
            const bell = document.getElementById('notificationBell');
            const panel = document.getElementById('notificationPanel');
            
            if (bell && panel) {
                clearInterval(checkNav);
                console.log('✅ Navigation detected');
                resolve();
            }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkNav);
            console.warn('⚠️ Navigation took too long, proceeding anyway');
            resolve();
        }, 5000);
    });

    
    // ✅ NEW: Initialize champion pack first
    try {
        await window.championLoader.initializeChampionPack();
        const pack = window.championLoader.getCurrentPack();
        console.log(`✅ Champion pack loaded: ${pack.name}`);
    } catch (error) {
        console.error('⚠️ Could not load champion pack:', error);
    }
    
    // Initialize notification center with tabs
    try {
       // ✅ CORRECT
const { initNotificationCenter } = await import('./notification-center.js');
await initNotificationCenter();
        console.log('✅ Notification center with tabs ready');
    } catch (error) {
        console.warn('⚠️ Could not load notification center:', error);
    }
    
    // Initialize bulletin system (toasts)
    initBulletinSystem();
    
    console.log('✅ Complete notification system ready');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNotificationSystem);
} else {
    initializeNotificationSystem();
}


// ========================================
// EXPOSE NOTIFICATION CENTER FUNCTIONS
// ========================================

// Make notification panel accessible globally
window.openNotificationPanel = function() {
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    
    if (panel && overlay) {
        panel.style.display = 'block';
        overlay.style.display = 'block';
        
        // Load notifications
        if (window.loadNotificationPanel) {
            window.loadNotificationPanel();
        }
    }
};

window.closeNotificationPanel = function() {
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    
    if (panel && overlay) {
        panel.style.display = 'none';
        overlay.style.display = 'none';
    }
};

// ========================================
// PERIODIC CLEANUP OF EXPIRED DISMISSALS
// ========================================

function cleanExpiredDismissals() {
    try {
        const dismissed = JSON.parse(localStorage.getItem('dismissedBulletins') || '[]');
        const now = Date.now();
        const validDismissals = [];
        let expiredCount = 0;
        
        dismissed.forEach(item => {
            const key = typeof item === 'string' ? item : item.key;
            const timestamp = typeof item === 'string' ? now : item.timestamp;
            const ageHours = (now - timestamp) / (1000 * 60 * 60);
            
            if (ageHours < 24) {
                validDismissals.push({ key: key, timestamp: timestamp });
            } else {
                dismissedBulletins.delete(key);
                expiredCount++;
            }
        });
        
        if (expiredCount > 0) {
            localStorage.setItem('dismissedBulletins', JSON.stringify(validDismissals));
            console.log(`🧹 Cleaned ${expiredCount} expired dismissals`);
        }
        
    } catch (e) {
        console.error('Error cleaning dismissals:', e);
    }
}

// Run cleanup every 30 minutes
setInterval(cleanExpiredDismissals, 1800000);

// ========================================
// PERIODIC CLEANUP OF EXPIRED COOLDOWNS
// ========================================

function cleanExpiredCooldowns() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, timestamp] of recentlyShownBulletins.entries()) {
        // Extract type from key (format: "type-matchId")
        const type = key.split('-')[0];
        const cooldownMs = (COOLDOWN_MINUTES[type] || 10) * 60000;
        
        // Remove if cooldown expired
        if (now - timestamp > cooldownMs) {
            recentlyShownBulletins.delete(key);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} expired cooldowns`);
        
        // Update sessionStorage
        try {
            const persistedData = Object.fromEntries(recentlyShownBulletins);
            sessionStorage.setItem('recentBulletins', JSON.stringify(persistedData));
        } catch (e) {
            console.warn('Could not persist after cleanup:', e);
        }
    }
}

// Run cleanup every 5 minutes
setInterval(cleanExpiredCooldowns, 300000);

// ========================================
// EXPOSE FOR TESTING & BULLETIN SYSTEM
// ========================================
window.showBulletin = showBulletin;
window.hideBulletin = hideBulletin;
window.checkAndShowBulletin = checkAndShowBulletin;

console.log('✅ Bulletin functions exposed to window');

// ========================================
// DEBUG FUNCTION - Check Match Vote Status
// ========================================

// ========================================
// DEBUG FUNCTION - Check Match Vote Status
// ========================================

// ========================================
// DEBUG FUNCTION - Check Match Vote Status
// ========================================

window.debugMatchVotes = async function() {
    console.log('🔍 Checking all live matches for vote counts...\n');
    
    try {
        const response = await fetch('/api/matches');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const allMatches = await response.json();
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        console.log(`📊 Found ${liveMatches.length} live matches:\n`);
        
        // ✅ Sample first match to debug structure
        if (liveMatches.length > 0) {
            const sample = liveMatches[0];
            console.log('🔍 Sample match structure:');
            console.log('  Match ID:', sample.matchId || sample.id);
            console.log('  endDate:', sample.endDate);
            console.log('  endTime:', sample.endTime);
            console.log('  Type:', typeof sample.endDate);
            console.log('');
        }
        
        const now = new Date();
        let zeroVoteMatches = 0;
        let lowVoteMatches = 0;
        let shouldAlertZero = 0;
        let shouldAlertLow = 0;
        
        liveMatches.forEach(match => {
            const matchId = match.matchId || match.id;
            const song1Votes = match.song1?.votes || 0;
            const song2Votes = match.song2?.votes || 0;
            const totalVotes = song1Votes + song2Votes;
            
            // ✅ USE THE ACTUAL getHoursUntilClose FUNCTION
            const hoursLeft = getHoursUntilClose(match);
            
            // Track counts
            if (totalVotes === 0) zeroVoteMatches++;
            if (totalVotes > 0 && totalVotes < 10) lowVoteMatches++;
            
            // Check if should alert (using realistic thresholds)
            const shouldAlertNoVotes = (totalVotes === 0 && hoursLeft !== null && hoursLeft <= 72);
            const shouldAlertLowVotes = (totalVotes > 0 && totalVotes < 5 && hoursLeft !== null && hoursLeft <= 48);
            
            if (shouldAlertNoVotes) shouldAlertZero++;
            if (shouldAlertLowVotes) shouldAlertLow++;
            
            // Visual indicator
            let indicator = '✅';
            if (shouldAlertNoVotes) indicator = '🆘';
            else if (shouldAlertLowVotes) indicator = '⚠️';
            else if (totalVotes < 10) indicator = '📊';
            
            console.log(`${indicator} ${matchId}:`, {
                votes: totalVotes,
                hoursLeft: hoursLeft !== null ? hoursLeft + 'h' : '❌ NO END DATE',
                endDate: match.endDate ? new Date(match.endDate).toLocaleString() : '❌ MISSING',
                song1: match.song1?.shortTitle || '???',
                song2: match.song2?.shortTitle || '???',
                shouldAlertNoVotes,
                shouldAlertLowVotes
            });
        });
        
        console.log(`\n📊 Summary:`);
        console.log(`   • ${liveMatches.length} total live matches`);
        console.log(`   • ${zeroVoteMatches} matches with ZERO votes`);
        console.log(`   • ${shouldAlertZero} zero-vote matches SHOULD ALERT (≤72h)`);
        console.log(`   • ${lowVoteMatches} matches with LOW votes (1-9)`);
        console.log(`   • ${shouldAlertLow} low-vote matches SHOULD ALERT (≤48h)`);
        console.log(`\n🎯 Alert Criteria:`);
        console.log(`   🆘 No votes: 0 votes + ≤72h left`);
        console.log(`   ⚠️ Low votes: 1-4 votes + ≤48h left`);
        
        // ✅ Show dismissal status
        console.log(`\n🚫 Dismissed Alerts:`);
        const dismissed = JSON.parse(localStorage.getItem('dismissedBulletins') || '[]');
        if (dismissed.length === 0) {
            console.log('   None');
        } else {
            dismissed.forEach(d => {
                const key = typeof d === 'string' ? d : d.key;
                console.log(`   • ${key}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
};

// ========================================
// DEBUG: Force show bulletin (for testing)
// ========================================
window.testBulletin = function(type = 'winning') {
    console.log('🧪 Force showing bulletin:', type);
    
    // ✅ Get messages from champion pack
    const dangerMsg = window.championLoader?.getChampionMessage('danger', {
        songTitle: 'GODS',
        voteDiff: 15,
        userPct: 35,
        opponentPct: 65
    });
    
    const comebackMsg = window.championLoader?.getChampionMessage('comeback', {
        songTitle: 'GODS',
        userPct: 55,
        opponentPct: 45
    });
    
    const nailbiterMsg = window.championLoader?.getChampionMessage('nailbiter', {
        songTitle: 'GODS',
        voteDiff: 2,
        voteDiffPlural: 's',
        userPct: 49,
        opponentPct: 51
    });
    
    const winningMsg = window.championLoader?.getChampionMessage('winning', {
        songTitle: 'GODS',
        userPct: 72,
        opponentPct: 28,
        voteDiff: 44
    });
    
    const allyMsg = window.championLoader?.getChampionMessage('ally', {
        username: 'TestAlly',
        songTitle: 'GODS'
    });
    
    const rivalMsg = window.championLoader?.getChampionMessage('rival', {
        username: 'TestRival',
        theirSong: 'RISE',
        yourSong: 'GODS'
    });
    
    const testNotifications = {
        danger: {
            priority: 1,
            type: 'danger',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
    thumbnailUrl: 'https://img.youtube.com/vi/C3GouGa0noM/mqdefault.jpg',  // ✅ GODS thumbnail
            userPct: 35,
            opponentPct: 65,
            voteDiff: 15,
            message: dangerMsg?.message || '🚨 Your pick "GODS" is in danger!',
            detail: dangerMsg?.detail || 'Behind by 15 votes (35% vs 65%)',
            cta: dangerMsg?.cta || 'View Match Now!'
        },
        nailbiter: {
            priority: 2,
            type: 'nailbiter',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
    thumbnailUrl: 'https://img.youtube.com/vi/C3GouGa0noM/mqdefault.jpg',  // ✅ GODS thumbnail
            voteDiff: 2,
            userPct: 49,
            opponentPct: 51,
            message: nailbiterMsg?.message || '🔥 Your pick "GODS" is TOO CLOSE!',
            detail: nailbiterMsg?.detail || 'Separated by just 2 votes!',
            cta: nailbiterMsg?.cta || 'View Match!'
        },
        winning: {
            priority: 4,
            type: 'winning',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
    thumbnailUrl: 'https://img.youtube.com/vi/C3GouGa0noM/mqdefault.jpg',  // ✅ GODS thumbnail
            userPct: 72,
            opponentPct: 28,
            message: winningMsg?.message || '🎯 Your pick "GODS" is dominating!',
            detail: winningMsg?.detail || 'Leading 72% to 28%',
            cta: winningMsg?.cta || 'View Match!'
        },
        comeback: {
            priority: 3,
            type: 'comeback',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
    thumbnailUrl: 'https://img.youtube.com/vi/C3GouGa0noM/mqdefault.jpg',  // ✅ GODS thumbnail
            userPct: 55,
            opponentPct: 45,
            message: comebackMsg?.message || '🎉 Your pick "GODS" completed comeback!',
            detail: comebackMsg?.detail || 'Was losing, now leading 55% to 45%!',
            cta: comebackMsg?.cta || 'View Match!'
        },

        'rival': {
            priority: 7,
            type: 'live-activity',
            matchId: 'round-1-match-1',
            matchTitle: 'GODS vs RISE',
            username: 'TestRival',
            triggerUserId: 'test-rival-123',
            triggerUsername: 'TestRival',
            song: 'RISE',
            userSong: 'GODS',
    thumbnailUrl: 'https://img.youtube.com/vi/C3GouGa0noM/mqdefault.jpg',  // ✅ GODS thumbnail
            message: rivalMsg?.message || '⚔️ TestRival picked "RISE" vs your "GODS"',
            detail: rivalMsg?.detail || 'The battle continues in GODS vs RISE',
            icon: '⚔️',
            cta: rivalMsg?.cta || 'View Battle 👀',
            ctaAction: 'navigate',
            targetUrl: '/vote.html?match=round-1-match-1',
            relationship: 'opponent'
        },
        
        'ally': {
            priority: 7,
            type: 'live-activity',
            matchId: 'round-1-match-1',
            matchTitle: 'GODS vs RISE',
            username: 'TestAlly',
            triggerUserId: 'test-ally-123',
            triggerUsername: 'TestAlly',
            song: 'GODS',
            userSong: 'GODS',
    thumbnailUrl: 'https://img.youtube.com/vi/C3GouGa0noM/mqdefault.jpg',  // ✅ GODS thumbnail
            message: allyMsg?.message || '🤝 TestAlly also voted for "GODS"!',
            detail: allyMsg?.detail || 'Standing with you in GODS vs RISE',
            icon: '🤝',
            cta: allyMsg?.cta || 'Send Thanks! 🤝',
            ctaAction: 'send-emote',
            ctaData: {
                targetUsername: 'TestAlly',
                targetUserId: 'test-ally-123',
                emoteType: 'thanks',
                matchData: {
                    matchId: 'round-1-match-1',
                    matchTitle: 'GODS vs RISE',
                    songTitle: 'GODS'
                }
            },
            targetUrl: '/vote.html?match=round-1-match-1',
            relationship: 'ally'
        },
        
        welcome: {
            priority: 5,
            type: 'welcome',
            thumbnailUrl: 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg',
            message: '🎵 Welcome to the League Music Tournament!',
            detail: '15 matches live - cast your first vote!',
            cta: 'Start Voting',
            action: 'navigate',
            targetUrl: '/matches.html'
        },
        // Add to testNotifications object in window.testBulletin function:
'live-activity': {
    priority: 7,
    type: 'live-activity',
    matchId: 'round-1-match-4',
    username: 'SummonerElite',
    song: 'RISE',
    matchTitle: 'RISE vs GODS',
    thumbnailUrl: 'https://img.youtube.com/vi/fB8TyLTD7EE/mqdefault.jpg',
    message: 'Reinforcements! SummonerElite just backed "RISE"!',
    detail: 'Standing with you in RISE vs GODS',
    cta: 'Send Thanks! 🤝',
    icon: '🤝',
    action: 'navigate',
    targetUrl: '/vote.html?match=round-1-match-4'
},

         // ✅ ADD THESE NEW TEST CASES:
        novotes: {
            priority: 1,
            type: 'novotes',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
            thumbnailUrl: 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg',
            hoursLeft: 4,
            message: '🚨 URGENT: Match has ZERO votes!',
            detail: 'GODS vs RISE • Closes in 4h',
            cta: 'Cast First Vote!',
            action: 'navigate',
            targetUrl: '/vote.html?match=test-match'
        },
        lowvotes: {
            priority: 1,
            type: 'lowvotes',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
            thumbnailUrl: 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg',
            totalVotes: 3,
            hoursLeft: 6,
            message: '⚠️ Match needs more votes!',
            detail: 'GODS vs RISE • Only 3 votes • 6h left',
            cta: 'Help This Match!',
            action: 'navigate',
            targetUrl: '/vote.html?match=test-match'
        },
        encouragement: {
            priority: 5,
            type: 'encouragement',
            thumbnailUrl: 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg',
            message: '👀 Still deciding? Pick your favorites!',
            detail: '12 matches closing soon - make your voice heard',
            cta: 'Browse Matches',
            action: 'navigate',
            targetUrl: '/matches.html'
        },
      trending: {
            priority: 3,
            type: 'trending',
            matchId: 'round-1-match-4',
            song: 'Welcome to Noxus',
            opponent: 'Unstoppable',
            thumbnailUrl: 'https://img.youtube.com/vi/C3GouGa0noM/mqdefault.jpg',
            viewCount: 25,
            message: '🔥 Hottest match right now!',
            detail: 'Welcome to Noxus vs Unstoppable is trending - join the action',
            cta: 'Vote Now',
            action: 'navigate',
            targetUrl: '/vote.html?match=round-1-match-4'
        },
        
        mostviewed: {
            priority: 4,
            type: 'mostviewed',
            matchId: 'round-1-match-2',
            song: 'MORE',
            opponent: 'Worlds Collide',
            thumbnailUrl: 'https://img.youtube.com/vi/C3GouGa0noM/mqdefault.jpg',
            viewCount: 45,
            message: '👀 Most popular match today!',
            detail: 'Everyone\'s watching MORE vs Worlds Collide - add your vote!',
            cta: 'Cast Your Vote',
            action: 'navigate',
            targetUrl: '/vote.html?match=round-1-match-2'
        },
    };
    
    const notification = testNotifications[type] || testNotifications.winning;
    showBulletin(notification);
};

console.log('✅ global-notifications.js fully loaded with toast-style bulletins');


// Handle emote button clicks from notifications
window.handleEmoteClick = async function(targetUsername, targetUserId, emoteType, matchData) {
    console.log(`🎭 Sending ${emoteType} to ${targetUsername}`);
    
    // Find the button that was clicked (from bulletin)
    const ctaButton = document.querySelector('.bulletin-toast-cta');
    
    let originalText = 'Send';  // ✅ DEFAULT FALLBACK
    
    if (ctaButton) {
        // ✅ SAVE THE ORIGINAL TEXT
        originalText = ctaButton.textContent;
        
        // Show loading state
        ctaButton.textContent = 'Sending...';
        ctaButton.disabled = true;
        ctaButton.style.opacity = '0.6';
    }
    
    // ✅ Import sendEmoteReaction from your emote-system.js
    const { sendEmoteReaction } = await import('./emote-system.js');
    
    const success = await sendEmoteReaction(targetUsername, targetUserId, emoteType, matchData);
    
    if (success) {
        // Success feedback
        if (ctaButton) {
            ctaButton.textContent = '✓ Sent!';
            ctaButton.style.background = 'linear-gradient(135deg, #27ae60, #229954)';
            ctaButton.disabled = false;
            ctaButton.style.opacity = '1';
        }
        
        showQuickToast(`✅ Sent ${emoteType} to ${targetUsername}!`, 2000);
        
        // Hide bulletin after 1 second
        setTimeout(() => {
            hideBulletin();
        }, 1000);
        
    } else {
        // Error feedback
        if (ctaButton) {
            ctaButton.textContent = '✗ Failed';
            ctaButton.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
            ctaButton.disabled = false;
            ctaButton.style.opacity = '1';
        }
        
        showQuickToast(`⚠️ Could not send reaction`, 2000);
        
        // Reset button after 2 seconds
        setTimeout(() => {
            if (ctaButton) {
                ctaButton.textContent = originalText;
                ctaButton.style.background = '';
                ctaButton.disabled = false;
            }
        }, 2000);
    }
};

// Quick toast for confirmations
function showQuickToast(message, duration = 2000) {
    const toast = document.createElement('div');
    toast.className = 'quick-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        z-index: 10001;
        animation: slideUp 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Check for incoming reactions on page load
async function checkIncomingReactions() {
    const reactions = await checkNewReactions();
    
    if (reactions.length === 0) return;
    
    // Show notification for each new reaction
    reactions.forEach(reaction => {
        const emoteIcons = {
            'thanks': '🤝',
            'props': '👊',
            'rivalry': '⚔️',
            'hype': '🔥'
        };
        
        notifications.push({
            priority: 8, // High priority - someone messaged you!
            type: 'emote-received',
            reactionId: reaction.id,
            fromUsername: reaction.fromUsername,
            emoteType: reaction.type,
            icon: emoteIcons[reaction.type] || '✨',
            message: `${emoteIcons[reaction.type]} ${reaction.fromUsername} sent you ${reaction.type}!`,
            detail: `"${reaction.message}" in ${reaction.matchTitle}`,
            cta: 'View Match',
            action: 'navigate',
            targetUrl: `/vote.html?match=${reaction.matchId}`,
            onShow: () => markReactionSeen(reaction.id) // Mark as seen when shown
        });
    });
    
    console.log(`📬 Loaded ${reactions.length} new reactions`);

    
}

// ========================================
// CHECK FOR MISSED NOTIFICATIONS ON PAGE LOAD
// ========================================

async function checkMissedNotifications() {
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId || userId === 'anonymous') return;
    
    console.log('🔍 Checking for missed notifications...');
    
    // ✅ Match the 72-hour window from checkRecentVotes
    const hoursToCheck = 72; // Same as SAVE_WINDOW_HOURS
    const missedNotifications = await getRecentUnshownNotifications(userId, hoursToCheck * 60);
    
    if (missedNotifications.length === 0) {
        console.log('✅ No missed notifications');
        return;
    }
    
    console.log(`📬 Found ${missedNotifications.length} missed notifications from last ${hoursToCheck}h`);
    
    // ✅ Prioritize notifications (show most important first)
    const prioritized = missedNotifications.sort((a, b) => {
        // Sort by priority first (lower number = higher priority)
        if (a.priority !== b.priority) return a.priority - b.priority;
        // Then by recency (newer first)
        return b.timestamp - a.timestamp;
    });
    
    // ✅ Only show the top 3 most important as toasts
    const toShow = prioritized.slice(0, 3);
    const remaining = missedNotifications.length - toShow.length;
    
    // Show each as a toast with slight delay between them
    toShow.forEach((notification, index) => {
        setTimeout(() => {
            const hoursAgo = Math.floor((Date.now() - notification.timestamp) / (1000 * 60 * 60));
           const timeAgo = hoursAgo < 1 
    ? 'Less than 1 hour ago'  // ← Better than "just before you left"
    : hoursAgo < 24 
        ? `${hoursAgo}h ago` 
        : `${Math.floor(hoursAgo / 24)}d ago`;
            
            showBulletin({
                priority: notification.priority,
                type: notification.type,
                matchId: notification.matchId,
                matchTitle: notification.matchTitle,
                            severityTier: notification.severityTier, // ✅ ADD THIS!

                username: notification.triggerUsername,
                triggerUserId: notification.triggerUserId,
                thumbnailUrl: notification.thumbnailUrl,
                message: notification.message, // ✅ Don't prefix "While you were away"
    detail: `${notification.detail} • ${timeAgo}`,  // ← Time at end
                icon: notification.icon,
                cta: notification.ctaText,
                ctaText: notification.ctaText,
                ctaAction: notification.ctaAction,
                ctaData: notification.ctaData,
                targetUrl: notification.targetUrl,
                relationship: notification.relationship,
                secondaryCta: notification.secondaryCta
            });
            
            // Mark as shown
            markNotificationShown(notification.id);
            
        }, index * 3000); // 3-second delay between toasts
    });
    
    // ✅ Show summary if there are more notifications
    if (remaining > 0) {
        setTimeout(() => {
            showBulletin({
                priority: 10,
                type: 'notification-summary',
                matchId: 'summary',
                message: `📬 ${remaining} more notification${remaining === 1 ? '' : 's'}`,
                detail: 'Check your notification center to see everything',
                icon: '🔔',
                cta: 'Open Notifications',
                ctaAction: 'open-panel',
                targetUrl: '#'
            });
        }, toShow.length * 3000 + 1000);
    }
}

// ✅ Run on page load with longer delay (let page settle first)
setTimeout(() => {
    checkMissedNotifications();
}, 3000); // 3 seconds instead of 2

// ✅ Also check when user returns to tab (was idle)
let wasHidden = false;
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && wasHidden) {
        // User just came back to tab
        console.log('👀 User returned to tab - checking for new notifications');
        setTimeout(() => {
            checkMissedNotifications();
        }, 1000);
    }
    wasHidden = document.hidden;
});

// ========================================
// REAL-TIME EMOTE LISTENER (ZERO POLLING)
// ========================================

let emoteListener = null;

async function setupRealtimeEmoteListener() {
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId || userId === 'anonymous') {
        console.log('⏸️ Emote listener disabled - anonymous user');
        return;
    }
    
    // Check if user has any votes (can't receive emotes without voting)
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    if (Object.keys(userVotes).length === 0) {
        console.log('⏸️ Emote listener disabled - no votes yet (vote to enable)');
        return;
    }
    
    // Clean up existing listener
    if (emoteListener) {
        emoteListener();
    }
    
    console.log('👂 Setting up real-time emote listener...');
    
    try {
        // ✅ Listen for NEW unseen reactions in real-time
        const q = query(
            collection(db, 'user-reactions'), // ✅ Matches your emote-system.js
            where('toUserId', '==', userId),
            where('seen', '==', false),
            orderBy('timestamp', 'desc'),
            limit(10)
        );
        
        emoteListener = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const reaction = { id: change.doc.id, ...change.doc.data() };
                    
                    // ✅ Show toast notification
                    const emoteIcons = {
                        'thanks': '🤝',
                        'props': '👊',
                        'rivalry': '⚔️',
                        'hype': '🔥'
                    };
                    
                    const icon = emoteIcons[reaction.type] || '✨';
                    
                    showBulletin({
                        priority: 8,
                        type: 'emote-received',
                        reactionId: reaction.id,
                        matchId: reaction.matchId,
                        matchTitle: reaction.matchTitle,
                        fromUsername: reaction.fromUsername,
                        triggerUserId: reaction.fromUserId,
                        triggerUsername: reaction.fromUsername,
                        emoteType: reaction.type,
                        icon: icon,
                        message: `${icon} ${reaction.fromUsername} sent you ${reaction.type}!`,
                        detail: `"${reaction.message}" • ${reaction.matchTitle}`,
                        cta: 'View Match',
                        ctaAction: 'navigate',
                        targetUrl: `/vote.html?match=${reaction.matchId}`,
                        secondaryCta: {
                            text: `View ${reaction.fromUsername}'s Profile`,
                            action: 'navigate',
                            url: `/profile?user=${reaction.fromUsername}`
                        }
                    });
                    
                    // ✅ Mark as seen
                    markReactionSeen(reaction.id);
                    
                    console.log(`✨ NEW EMOTE RECEIVED: ${reaction.type} from ${reaction.fromUsername}`);
                }
            });
        }, (error) => {
            console.error('❌ Emote listener error:', error);
        });
        
        console.log('✅ Real-time emote listener active (instant notifications)');
        
    } catch (error) {
        console.error('❌ Failed to setup emote listener:', error);
    }
}

// ✅ Start listener on page load
setTimeout(() => {
    setupRealtimeEmoteListener();
}, 3000);

// ✅ Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (emoteListener) {
        emoteListener();
        console.log('🔌 Emote listener disconnected');
    }
});

// ✅ Expose function to restart listener after vote
window.restartEmoteListener = function() {
    console.log('🔄 Restarting emote listener (user voted)');
    setupRealtimeEmoteListener();
};

// ========================================
// DEBUG: Test Streak System
// ========================================

window.testStreak = function(type = 'ally', count = 3) {
    console.log(`🧪 Testing ${count}-match ${type} streak`);
    
    const streakData = {
        username: type === 'ally' ? 'TestAlly' : 'TestRival',
        userId: `test-${type}-123`,
        streak: count,
        isAlly: type === 'ally',
        isMilestone: true,
        matchId: 'test-match'
    };
    
    showStreakNotification(streakData);
};