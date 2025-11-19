console.log('🔔 global-notifications.js loaded');

import { getActivityFeed } from './api-client.js';
import { sendEmoteReaction, checkNewReactions, markReactionSeen } from './emote-system.js';
import { 
    saveNotification, 
    getRecentUnshownNotifications, 
    markNotificationShown,
    getUnreadCount
} from './notification-storage.js';


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
        'live-activity': 5  // ✅ NEW: Show live votes every 5 minutes max

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

function extractYouTubeId(url) {
    if (!url) return '';
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&\n?#]+)/);
    return match ? match[1] : '';
}

function getThumbnailUrl(youtubeUrl) {
    const videoId = extractYouTubeId(youtubeUrl);
    return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';
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

async function checkAndShowBulletin() {
    try {
        // ✅ Get user ID properly
const userId = localStorage.getItem('tournamentUserId');  // ✅ Match navigation.js
        
        if (!userId) {
            console.warn('⚠️ No user ID found - skipping vote checks');
            // Still check for zero-vote/low-vote alerts below
        }
        
        // ✅ Fetch user votes from Firebase
        let userVotes = {};
        let hasVoted = false;
        
       // ✅ NEW: Read from localStorage (FREE, instant)
if (userId) {
    try {
        // Get votes from localStorage (already set by vote.js)
        const storedVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        
        // Convert to the format this function expects
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
    
    // Store page load time if not set
    if (!sessionStorage.getItem('pageLoadTime')) {
        sessionStorage.setItem('pageLoadTime', Date.now().toString());
    }
    
    // 🎵 WELCOME: Smart timing (5s delay + 12hr cooldown)
    const shouldWelcome = await shouldShowWelcome(timeOnSite);
    if (shouldWelcome) {
        await showWelcomeToast();
        return;
    }
    
    // 👀 GENTLE REMINDER: After 2 minutes of browsing
    const welcomeShown = sessionStorage.getItem('welcomeToastShown') || localStorage.getItem('lastWelcomeToast');
    if (welcomeShown && timeOnSite > 120000 && timeSinceLastPrompt > 120000) {
        await showEncouragementToast('gentle');
        return;
    }
    
    // ⏰ URGENCY: After 5 minutes + matches closing soon
    if (timeOnSite > 300000 && timeSinceLastPrompt > 180000) {
        const hasUrgentMatches = await checkForClosingMatches();
        if (hasUrgentMatches) {
            await showEncouragementToast('urgent');
            return;
        }
    }
    
    // Don't check voted-match alerts for non-voters
    return;
}
        
        const notifications = [];
        
       // PRIORITY 1: Check user's picks for danger/nailbiter/comeback/winning
for (const [matchId, vote] of Object.entries(userVotes)) {
    const match = await getMatchData(matchId);
    
    if (!match || match.status !== 'live') continue;

    if (!match.id && !match.matchId) {
        console.warn('⚠️ Match missing ID:', match);
        continue;
    }
    
    // ✅ ADD DEBUG LOGGING:
    console.log(`\n🔍 Checking ${matchId}:`);
    console.log('  Vote data:', vote);
    console.log('  vote.choice:', vote.choice);
    
    const userChoice = vote.choice;
    const userSong = userChoice === 'song1' ? match.song1 : match.song2;
    const opponent = userChoice === 'song1' ? match.song2 : match.song1;
    
    console.log('  User picked:', userChoice);
    console.log('  User song:', userSong?.shortTitle, '→', userSong?.votes || 0, 'votes');
    console.log('  Opponent:', opponent?.shortTitle, '→', opponent?.votes || 0, 'votes');
            
            if (!userSong || !opponent) continue;

                // ✅ ADD THIS HERE (before the "if (!userSong || !opponent)" check):
    if (!userSong || !opponent) {
        console.log('  ❌ Missing song data, skipping...');
        continue;
    }
            
            const totalVotes = match.totalVotes || 0;
            const userSongVotes = userSong.votes || 0;
            const opponentVotes = opponent.votes || 0;
            const voteDiff = Math.abs(userSongVotes - opponentVotes);
            
            const userPct = totalVotes > 0 ? Math.round((userSongVotes / totalVotes) * 100) : 50;
            const opponentPct = totalVotes > 0 ? 100 - userPct : 50;

             // ✅ ADD DEBUG FOR DANGER CHECK:
    console.log('  User %:', userPct + '%');
    console.log('  Danger threshold: < 40% AND losing');
    console.log('  Danger check:', userPct < 40 && userSongVotes < opponentVotes ? '🚨 YES' : '✅ NO');
            
            // Track state for comeback detection
            const previousState = matchStates[matchId];
            const isCurrentlyLosing = userSongVotes < opponentVotes;
            const wasLosing = previousState?.wasLosing || false;
            
            matchStates[matchId] = {
                wasLosing: isCurrentlyLosing,
                lastCheck: Date.now()
            };
            
// DANGER: User's pick is losing badly
if (userPct < BULLETIN_THRESHOLDS.DANGER && userSongVotes < opponentVotes) {
    // ✅ Check if we've alerted about this match before
    const dangerAlertKey = `danger-alert-count-${match.id}`;
    const alertCount = parseInt(localStorage.getItem(dangerAlertKey) || '0');
    
    // ✅ Use escalating cooldown: first time = 5min, subsequent = 15min
    const notificationType = alertCount === 0 ? 'danger' : 'danger-repeat';
    
    notifications.push({
        priority: 1,
        type: notificationType,
        matchId: match.id,
        song: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
        opponent: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
        thumbnailUrl: getThumbnailUrl(userSong?.youtubeUrl),
        userPct,
        opponentPct,
        voteDiff,
        message: alertCount === 0 
            ? `🚨 Your pick "${userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song'}" is in danger!`
            : `🚨 Still losing: "${userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song'}"`,
        detail: `Behind by ${voteDiff} votes (${userPct}% vs ${opponentPct}%)`,
        cta: 'View Match Now!'
    });
    
    // ✅ Increment alert count for this match
    localStorage.setItem(dangerAlertKey, (alertCount + 1).toString());
}
            // COMEBACK: Was losing, now winning
         // COMEBACK: Was losing, now winning
else if (wasLosing && !isCurrentlyLosing && voteDiff >= BULLETIN_THRESHOLDS.COMEBACK_MIN) {
    notifications.push({
        priority: 2,
        type: 'comeback',
        matchId: match.id,
        song: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
        opponent: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
        thumbnailUrl: getThumbnailUrl(userSong?.youtubeUrl),
        userPct,
        opponentPct,
        message: `🎉 Your pick "${userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song'}" completed comeback!`,
        detail: `Was losing, now leading ${userPct}% to ${opponentPct}%!`,
        cta: 'View Match!'
    });
}
            // NAILBITER: Very close match
else if (voteDiff <= BULLETIN_THRESHOLDS.NAILBITER && totalVotes > 10) {
    notifications.push({
        priority: 3,
        type: 'nailbiter',
        matchId: match.id,
        song: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
        opponent: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
        thumbnailUrl: getThumbnailUrl(userSong?.youtubeUrl),
        voteDiff,
        userPct,
        opponentPct,
        message: `🔥 Your pick "${userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song'}" is TOO CLOSE!`,
        detail: `Separated by just ${voteDiff} vote${voteDiff === 1 ? '' : 's'}!`,
        cta: 'View Match!'
    });
}
            // WINNING: User's pick is dominating
           // WINNING: User's pick is dominating
else if (userPct >= BULLETIN_THRESHOLDS.WINNING && totalVotes > 20) {
    notifications.push({
        priority: 4,
        type: 'winning',
        matchId: match.id,
        song: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
        opponent: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
        thumbnailUrl: getThumbnailUrl(userSong?.youtubeUrl),
        userPct,
        opponentPct,
        message: `🎯 Your pick "${userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song'}" is dominating!`,
        detail: `Leading ${userPct}% to ${opponentPct}%`,
        cta: 'View Match!'
    });
}
        }
        
      // PRIORITY 2: CHECK ALL LIVE MATCHES FOR VOTE ISSUES
        // ========================================
        
        let zeroVoteCount = 0;
        let lowVoteCount = 0;
        
        // Fetch all live matches once
        const allLiveResponse = await fetch('/api/matches');
        const allMatches = await allLiveResponse.json();
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        for (const match of liveMatches) {
            const matchId = match.matchId || match.id;
            const totalVotes = (match.song1?.votes || 0) + (match.song2?.votes || 0);
            const hoursLeft = getHoursUntilClose(match);
            
            // Skip if no end time or already closed
            if (!hoursLeft || hoursLeft <= 0) continue;
            
            // 🚨 CRITICAL: Zero votes
            if (totalVotes === 0 && hoursLeft <= 6) {
                zeroVoteCount++;
                
                // ✅ NEW: Check if user already dismissed this match
                const dismissKey = `novotes-${matchId}`;
                if (dismissedBulletins.has(dismissKey)) {
                    continue; // Skip - user doesn't want to see this again
                }
                
                // Check cooldown (only alert every 2 hours)
                const alertKey = `lastAlert-novotes-${matchId}`;
                const lastAlerted = localStorage.getItem(alertKey);
                const hoursSinceAlert = lastAlerted ? (Date.now() - parseInt(lastAlerted)) / (1000 * 60 * 60) : 999;
                
                // Only show if:
                // 1. Haven't shown this match alert in 2+ hours
                // 2. No other zero-vote alert is pending
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
                    
                    // Mark this match as alerted (timestamp)
                    localStorage.setItem(alertKey, Date.now().toString());
                    
                    // ✅ BREAK after adding ONE notification
                    break;
                }
            }
            // ⚠️ WARNING: Low votes
            else if (totalVotes > 0 && totalVotes < 5 && hoursLeft <= 3) {
                lowVoteCount++;
                
                // ✅ NEW: Check if user dismissed this match
                const dismissKey = `lowvotes-${matchId}`;
                if (dismissedBulletins.has(dismissKey)) {
                    continue; // Skip - user doesn't want to see this
                }
                
                // Check cooldown
                const alertKey = `lastAlert-lowvotes-${matchId}`;
                const lastAlerted = localStorage.getItem(alertKey);
                const hoursSinceAlert = lastAlerted ? (Date.now() - parseInt(lastAlerted)) / (1000 * 60 * 60) : 999;
                
                // Only show if no zero-vote alerts AND haven't shown recently
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
        
        // Log summary
        if (zeroVoteCount > 0) {
            console.log(`⚠️ ${zeroVoteCount} matches have zero votes (${notifications.filter(n => n.type === 'novotes').length} will be shown)`);
        }
        if (lowVoteCount > 0) {
            console.log(`⚠️ ${lowVoteCount} matches have low votes (${notifications.filter(n => n.type === 'lowvotes').length} will be shown)`);
        }

        // ========================================
        // PRIORITY 3: CHECK FOR TRENDING/ENGAGING MATCHES
        // ========================================
        
        if (hasVoted && Object.keys(userVotes).length >= 2) {
            // Only show engagement toasts to users who have voted in 2+ matches
            
            for (const match of liveMatches) {
                const matchId = match.matchId || match.id;
                
                // Skip if user already voted in this match
                if (userVotes[matchId]) continue;
                
                try {
                    // Fetch view stats for this match
                    const viewResponse = await fetch(`/api/view-stats?matchId=${matchId}`);
                    
                    if (!viewResponse.ok) continue;
                    
                    const viewStats = await viewResponse.json();
                    const totalViews = viewStats.totalViews || 0;
                    const recentViews = viewStats.recentViews || 0;
                    
                    const totalVotes = match.totalVotes || 0;
                    
                 // 🔥 TRENDING: High recent views
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
                    
                    // 👀 MOST VIEWED: Popular but few votes
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
                
// Show highest priority notification that hasn't been dismissed
        notifications.sort((a, b) => a.priority - b.priority);
        
        for (const notification of notifications) {
            const bulletinKey = `${notification.type}-${notification.matchId}`;
            
            // ✅ Check if dismissed (24h block)
            if (dismissedBulletins.has(bulletinKey)) continue;
            
            // ✅ NEW: Check if recently shown (type-specific cooldown)
            const lastShown = recentlyShownBulletins.get(bulletinKey);
            if (lastShown) {
                const cooldownMs = (COOLDOWN_MINUTES[notification.type] || 10) * 60000;
                const timeSinceShown = Date.now() - lastShown;
                
                if (timeSinceShown < cooldownMs) {
                    const minutesRemaining = Math.ceil((cooldownMs - timeSinceShown) / 60000);
                    console.log(`⏳ Toast "${notification.type}" on cooldown (${minutesRemaining}m remaining)`);
                    continue;
                }
            }
            
            // ✅ Show the toast and track it
            showBulletin(notification);
            recentlyShownBulletins.set(bulletinKey, Date.now());

            // ✅ NEW: Persist to sessionStorage (survives page refresh, expires on tab close)
try {
    const persistedData = Object.fromEntries(recentlyShownBulletins);
    sessionStorage.setItem('recentBulletins', JSON.stringify(persistedData));
} catch (e) {
    console.warn('Could not persist bulletin cooldowns:', e);
}


            console.log(`📢 Toast shown and tracked: ${bulletinKey} (cooldown: ${COOLDOWN_MINUTES[notification.type] || 10}m)`);
            break;
        }
        
    } catch (error) {
        console.error('Error checking bulletin:', error);
    }
}

// ========================================
// REAL-TIME VOTE NOTIFICATIONS
// ========================================

let lastActivityCheck = 0;
let lastSeenActivityId = null;
const ACTIVITY_CHECK_INTERVAL = 30000; // Check every 30 seconds

async function checkRecentVotes() {
    try {
        // Throttle checks
        const now = Date.now();
        if (now - lastActivityCheck < ACTIVITY_CHECK_INTERVAL) return;
        lastActivityCheck = now;
        
        // Get recent activity (limit to 10 most recent)
        const activities = await getActivityFeed(10);
        
        if (!activities || activities.length === 0) return;
        
        // Get the most recent activity
        const latestActivity = activities[0];
        
        // Skip if we've already shown this one
        if (lastSeenActivityId === latestActivity.activityId) return;
        
        // Filter out own votes
        const userId = localStorage.getItem('tournamentUserId');
        if (latestActivity.userId === userId) return;
        
        // Skip anonymous votes
        if (latestActivity.username === 'Anonymous') return;
        
        // Check if vote is recent (last 2 minutes)
        const twoMinutesAgo = now - 120000;
        if (latestActivity.timestamp < twoMinutesAgo) return;
        
        // Check if we've already shown this specific vote
        const voteKey = `vote-toast-${latestActivity.activityId}`;
        if (recentlyShownBulletins.has(voteKey)) return;
        
        // Get thumbnail URL from songId
        const thumbnailUrl = latestActivity.songId 
            ? `https://img.youtube.com/vi/${latestActivity.songId}/mqdefault.jpg`
            : null;
        
        // ========================================
        // CHECK USER'S VOTE STATUS IN THIS MATCH
        // ========================================
        
        // Check if current user has voted in this match
        const userVoteKey = `vote-${latestActivity.matchId}`;
        const userVotedSongId = localStorage.getItem(userVoteKey);
        const hasVoted = !!userVotedSongId;
        
        let message, detail, cta, icon;
        
        if (!hasVoted) {
            // ========================================
            // USER HASN'T VOTED YET - INVITE THEM IN
            // ========================================
            message = `${latestActivity.username} just voted!`;
            detail = `New vote in ${latestActivity.matchTitle}`;
            cta = 'Cast Your Vote!';
            icon = '🗳️';
            
        } else {
            // User HAS voted - check if they're allies or opponents
            const isAlly = userVotedSongId === latestActivity.songId;
            
            if (isAlly) {
                // ========================================
                // ALLY - They voted for YOUR song!
                // ========================================
                const allyMessages = [
                    `Reinforcements! ${latestActivity.username} just backed "${latestActivity.songTitle}"!`,
                    `${latestActivity.username} joined your side! Voted for "${latestActivity.songTitle}"`,
                    `Your choice is gaining momentum! ${latestActivity.username} voted "${latestActivity.songTitle}"`,
                    `Alliance formed! ${latestActivity.username} also picked "${latestActivity.songTitle}"`
                ];
                
                const allyDetails = [
                    `${latestActivity.matchTitle}`,
                    `Standing with you in ${latestActivity.matchTitle}`,
                    `Fighting for the same side!`
                ];
                
                const allyButtons = [
                    'Send Thanks! 🤝',
                    'Give Props 👊',
                    'Show Support ✨',
                    'High Five! 🙌'
                ];
                
                message = allyMessages[Math.floor(Math.random() * allyMessages.length)];
                detail = allyDetails[Math.floor(Math.random() * allyDetails.length)];
                cta = allyButtons[Math.floor(Math.random() * allyButtons.length)];
                icon = '🤝';
                
            } else {
              // ========================================
    // OPPONENT - They voted AGAINST your song!
    // ========================================
    
    // Keep it simple and social - focus on the PERSON'S ACTION
    const opponentMessages = [
        `${latestActivity.username} just voted against you!`,
        `${latestActivity.username} challenged your pick with "${latestActivity.songTitle}"`,
        `Rival spotted! ${latestActivity.username} backed "${latestActivity.songTitle}"`,
        `${latestActivity.username} picked the other side in "${latestActivity.songTitle}"`
    ];
    
    const opponentDetails = [
        `In ${latestActivity.matchTitle}`,
        `The battle continues in ${latestActivity.matchTitle}`,
        `${latestActivity.matchTitle} - rivalry grows`
    ];
    
     const opponentButtons = [
        'View Match 👀',
        'Check the Battle ⚡',
        'See the Score 📊',
        'Go to Match 🎯'
    ];
    
    message = opponentMessages[Math.floor(Math.random() * opponentMessages.length)];
    detail = opponentDetails[Math.floor(Math.random() * opponentDetails.length)];
    cta = opponentButtons[Math.floor(Math.random() * opponentButtons.length)];
    icon = '⚔️';
}
        }
        
// Build notification data
const isAlly = hasVoted && userVotedSongId === latestActivity.songId;
const notificationData = {
    priority: 7,
    type: 'live-activity',
    matchId: latestActivity.matchId,
    matchTitle: latestActivity.matchTitle,
    username: latestActivity.username,
    triggerUserId: latestActivity.userId,
    triggerUsername: latestActivity.username,
    song: latestActivity.songTitle,
    thumbnailUrl: thumbnailUrl,
    message: message,
    detail: detail,
    icon: icon,
    ctaText: cta,
    ctaAction: hasVoted ? (isAlly ? 'send-emote' : 'navigate') : 'navigate',
    ctaData: hasVoted && isAlly ? {
        targetUsername: latestActivity.username,
        targetUserId: latestActivity.userId,
        emoteType: 'thanks',
        matchData: {
            matchId: latestActivity.matchId,
            matchTitle: latestActivity.matchTitle,
            songTitle: latestActivity.songTitle
        }
    } : {},
    targetUrl: `/vote.html?match=${latestActivity.matchId}`,
    relationship: hasVoted ? (isAlly ? 'ally' : 'opponent') : null,
    shownAsToast: true
};

// Save to Firestore for notification center
if (userId && userId !== 'anonymous') {
    await saveNotification(userId, notificationData);
}

// Show as toast immediately
notifications.push(notificationData);
        
        // Track to avoid duplicates
        recentlyShownBulletins.set(voteKey, now);
        lastSeenActivityId = latestActivity.activityId;
        
        console.log(`🎯 Live vote activity: ${latestActivity.username} → ${latestActivity.songTitle} (${hasVoted ? (userVotedSongId === latestActivity.songId ? 'ALLY' : 'OPPONENT') : 'NOT VOTED'})`);
        
    } catch (error) {
        console.error('Error checking recent votes:', error);
    }
}

// Add to polling - check every 30 seconds
setInterval(checkRecentVotes, ACTIVITY_CHECK_INTERVAL);

// Also check on page visibility change (when user returns to tab)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        checkRecentVotes();
    }
});


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
// ========================================
// WELCOME TOAST FOR FIRST-TIME VISITORS
// ========================================

async function showWelcomeToast() {
    try {
        // Count live matches
        const response = await fetch('/api/matches');
        const allMatches = await response.json();
        const liveMatches = allMatches.filter(m => m.status === 'live');
        const liveCount = liveMatches.length;
        
        // Get a random live match for thumbnail
        const randomMatch = liveMatches[Math.floor(Math.random() * liveMatches.length)];
        const thumbnailUrl = randomMatch 
            ? getThumbnailUrl(randomMatch.song1?.youtubeUrl) || getThumbnailUrl(randomMatch.song2?.youtubeUrl)
            : 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg';
        
        showBulletin({
            priority: 5,
            type: 'welcome',
            matchId: 'welcome',
            thumbnailUrl: thumbnailUrl,
            message: '🎵 Welcome to the League Music Tournament!',
            detail: `${liveCount} live matches • Cast your first vote and join the action!`,
            cta: 'Start Voting',
            action: 'navigate',
            targetUrl: '/matches.html'
        });
        
   // Mark as shown
sessionStorage.setItem('welcomeToastShown', 'true'); // This session
localStorage.setItem('lastWelcomeToast', Date.now().toString()); // Timestamp for 12hr cooldown
sessionStorage.setItem('pageLoadTime', Date.now().toString());
        
        console.log('👋 Welcome toast shown');
        
    } catch (error) {
        console.error('Error showing welcome toast:', error);
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
   TOAST-STYLE BULLETIN - BOTTOM RIGHT
   Matches Nav Theme + TikTok/Instagram Style
======================================== */

.bulletin-banner {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999;
    width: 380px;
    max-width: calc(100vw - 48px);
    
    /* Match nav styling */
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(200, 170, 110, 0.3);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 
                0 0 20px rgba(200, 170, 110, 0.15);
    
    /* Slide in from bottom-right */
    transform: translateX(120%) translateY(20px);
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.bulletin-banner.show {
    transform: translateX(0) translateY(0);
    opacity: 1;
}

/* ========================================
   TOAST CONTENT LAYOUT
======================================== */

.bulletin-toast-content {
    padding: 1rem;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    position: relative;
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
    color: #C8AA6E;
    margin-bottom: 0.35rem;
    letter-spacing: 0.03em;
    line-height: 1.3;
}

.bulletin-detail {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.7);
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
    background: transparent;
    border: none;
    color: rgba(200, 170, 110, 0.6);
    width: 24px;
    height: 24px;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}

.bulletin-close:hover {
    color: #C8AA6E;
    transform: rotate(90deg);
}

/* ========================================
   CTA BUTTON (FULL WIDTH AT BOTTOM)
======================================== */

.bulletin-toast-cta {
    width: 100%;
    background: linear-gradient(135deg, #C8AA6E, #B89A5E);
    color: #0a0a0a;
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
    background: linear-gradient(135deg, #D4B876, #C8AA6E);
    box-shadow: 0 -2px 12px rgba(200, 170, 110, 0.3);
}

.bulletin-toast-cta:active {
    transform: scale(0.98);
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
        const achievementIcon = notification.message.match(/[🏆✨⚔️🔥💀👑⭐💙🎯]/)?.[0] || '🏆';
        
        banner.innerHTML = `
            <div class="bulletin-toast-content achievement-toast">
                <div class="achievement-badge-large">
                    ${achievementIcon}
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
        
        // Add special animation for achievement badge
        setTimeout(() => {
            const badge = banner.querySelector('.achievement-badge-large');
            if (badge) {
                badge.style.animation = 'achievementPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            }
        }, 100);
        
    }
    // ✅ DEFAULT STYLING (for match alerts, welcome, etc.)
    else {
        banner.innerHTML = `
            <div class="bulletin-toast-content">
                <div class="bulletin-thumbnail">
                    ${notification.thumbnailUrl ? 
                        `<img src="${notification.thumbnailUrl}" alt="${notification.song || 'Match'}" class="thumbnail-img">` :
                        `<div class="thumbnail-img" style="background: linear-gradient(135deg, #C8AA6E, #B89A5E); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">🎵</div>`
                    }
                    <div class="thumbnail-overlay">${icon}</div>
                </div>
                <div class="bulletin-toast-text">
                    <div class="bulletin-message">${notification.message}</div>
                    <div class="bulletin-detail">${notification.detail}</div>
                </div>
                <button class="bulletin-close" onclick="window.dismissBulletin()">×</button>
            </div>
            <button class="bulletin-toast-cta" onclick="window.handleBulletinCTA()">${notification.cta}</button>
        `;
        
        banner.className = `bulletin-banner ${notification.type}`;
        
        setTimeout(() => banner.classList.add('show'), 10);
    }
    
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
    if (currentBulletin) {
        const bulletinKey = `${currentBulletin.type}-${currentBulletin.matchId}`;
        
        // ✅ NEW: Store with timestamp for expiry tracking
        const dismissalData = {
            key: bulletinKey,
            timestamp: Date.now()
        };
        
        dismissedBulletins.add(bulletinKey);
        
        // Store in localStorage with timestamps
        const dismissed = Array.from(dismissedBulletins).map(key => {
            // Check if this is the newly dismissed one
            if (key === bulletinKey) {
                return dismissalData;
            }
            // Try to find existing data
            const existing = JSON.parse(localStorage.getItem('dismissedBulletins') || '[]');
            const found = existing.find(d => d.key === key);
            return found || { key: key, timestamp: Date.now() };
        });
        
        localStorage.setItem('dismissedBulletins', JSON.stringify(dismissed));
        
        console.log(`🚫 Bulletin dismissed: ${bulletinKey} (expires in 24h)`);
    }
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
    

    
    console.log('✅ Bulletin system initialized with live activity');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBulletinSystem);
} else {
    initBulletinSystem();
}

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
    
    const testNotifications = {
        danger: {
            priority: 1,
            type: 'danger',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
            thumbnailUrl: 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg',
            userPct: 35,
            opponentPct: 65,
            voteDiff: 15,
            message: '🚨 Your pick "GODS" is in danger!',
            detail: 'Behind by 15 votes (35% vs 65%)',
            cta: 'View Match Now!'
        },
        nailbiter: {
            priority: 2,
            type: 'nailbiter',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
            thumbnailUrl: 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg',
            voteDiff: 2,
            userPct: 49,
            opponentPct: 51,
            message: '🔥 Your pick "GODS" is TOO CLOSE!',
            detail: 'Separated by just 2 votes!',
            cta: 'View Match!'
        },
        winning: {
            priority: 4,
            type: 'winning',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
            thumbnailUrl: 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg',
            userPct: 72,
            opponentPct: 28,
            message: '🎯 Your pick "GODS" is dominating!',
            detail: 'Leading 72% to 28%',
            cta: 'View Match!'
        },
        comeback: {
            priority: 3,
            type: 'comeback',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
            thumbnailUrl: 'https://img.youtube.com/vi/aR-KAldshAE/mqdefault.jpg',
            userPct: 55,
            opponentPct: 45,
            message: '🎉 Your pick "GODS" completed comeback!',
            detail: 'Was losing, now leading 55% to 45%!',
            cta: 'View Match!'
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
    
    const success = await sendEmoteReaction(targetUsername, targetUserId, emoteType, matchData);
    
    if (success) {
        // Show confirmation toast
        showQuickToast(`✅ Sent to ${targetUsername}!`, 2000);
    } else {
        showQuickToast(`⚠️ Could not send reaction`, 2000);
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

/// ========================================
// CHECK FOR MISSED NOTIFICATIONS ON PAGE LOAD
// ========================================

async function checkMissedNotifications() {
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId || userId === 'anonymous') return;
    
    console.log('🔍 Checking for missed notifications...');
    
    const missedNotifications = await getRecentUnshownNotifications(userId, 60);
    
    if (missedNotifications.length === 0) {
        console.log('✅ No missed notifications');
        return;
    }
    
    console.log(`📬 Found ${missedNotifications.length} missed notifications`);
    
    // Show each missed notification as a toast
    missedNotifications.forEach(notification => {
        showBulletin({
            priority: notification.priority,
            type: notification.type,
            matchId: notification.matchId,
            matchTitle: notification.matchTitle,
            username: notification.triggerUsername,
            userId: notification.triggerUserId,
            message: `While you were away: ${notification.message}`,
            detail: notification.detail,
            icon: notification.icon,
            cta: notification.ctaText,
            action: notification.ctaAction,
            targetUrl: notification.targetUrl,
            emoteData: notification.ctaAction === 'send-emote' ? notification.ctaData : null,
            onShow: () => markNotificationShown(notification.id)
        });
    });
}

// Run on page load
setTimeout(() => {
    checkMissedNotifications();
}, 2000);

// Check on page load and every 2 minutes
checkIncomingReactions();
setInterval(checkIncomingReactions, 120000);