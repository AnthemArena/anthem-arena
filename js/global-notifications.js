console.log('🔔 global-notifications.js loaded');

// ========================================
// GLOBAL NOTIFICATION + BULLETIN SYSTEM
// With Smart Polling + Edge Caching
// Toast-Style Bottom-Right Notifications
// ========================================

import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ========================================
// CONFIGURATION
// ========================================

const POLL_CONFIG = {
    BASE_INTERVAL: 120000,      // 2 minutes base
    ACTIVE_INTERVAL: 30000,     // 30 seconds when active
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
    const interval = isActive ? POLL_CONFIG.ACTIVE_INTERVAL : POLL_CONFIG.BASE_INTERVAL;
    
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
function getHoursUntilClose(match) {
    if (!match.endTime) return null;
    
    const now = Date.now();
    const endTime = match.endTime.toMillis ? match.endTime.toMillis() : match.endTime;
    const msLeft = endTime - now;
    
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



// Add after line 109 (after getAllLiveMatches function)

// ========================================
// LIVE ACTIVITY FROM EDGE FUNCTION
// ========================================

let activityPolling = null;
let lastActivityCheck = 0;

async function fetchLiveActivity() {
    try {
        const response = await fetch('/api/live-activity', {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const activity = await response.json();
        const cacheStatus = response.headers.get('X-Cache-Status');
        const cacheAge = response.headers.get('X-Cache-Age');
        
        console.log(`📊 Activity fetched from edge (${cacheStatus}${cacheAge ? `, age: ${cacheAge}s` : ''})`);
        
        return activity;
        
    } catch (error) {
        console.error('❌ Error fetching live activity:', error);
        return null;
    }
}

function startActivityPolling() {
    // Poll every 30 seconds
    activityPolling = setInterval(async () => {
        const timeSinceLastCheck = Date.now() - lastActivityCheck;
        
        // Skip if checked recently
        if (timeSinceLastCheck < 25000) {
            return;
        }
        
        const activity = await fetchLiveActivity();
        
        if (activity?.hotMatches?.length > 0) {
            showLiveActivityToast(activity);
        }
        
        lastActivityCheck = Date.now();
        
    }, 30000);
    
    // Initial fetch (wait 5s after page load)
    setTimeout(async () => {
        const activity = await fetchLiveActivity();
        if (activity?.hotMatches?.length > 0) {
            showLiveActivityToast(activity);
        }
        lastActivityCheck = Date.now();
    }, 5000);
}

function showLiveActivityToast(activity) {
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    
    // Find a hot match the user hasn't voted on yet
    const unvotedMatch = activity.hotMatches.find(match => !userVotes[match.matchId]);
    
    if (!unvotedMatch) {
        console.log('📭 No unvoted hot matches');
        return;
    }
    
    // Don't show if recently dismissed
    const dismissKey = `activity-${unvotedMatch.matchId}`;
    if (dismissedBulletins.has(dismissKey)) {
        return;
    }
    
    // Throttle - max 1 activity toast per 2 minutes
    const lastActivityToast = parseInt(localStorage.getItem('lastActivityToast') || '0');
    if (Date.now() - lastActivityToast < 120000) {
        return;
    }
    
    // Generate message variations
    const messages = [
        `🔥 ${unvotedMatch.recentVotes} people just voted in this match!`,
        `⚡ This match is heating up - ${unvotedMatch.recentVotes} recent votes!`,
        `👀 ${unvotedMatch.recentVotes} votes in the last 2 minutes!`,
        `🎵 Hot match: "${unvotedMatch.song1}" vs "${unvotedMatch.song2}"!`
    ];
    
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    showBulletin({
        type: 'live-activity',
        matchId: unvotedMatch.matchId,
        song: unvotedMatch.song1,
        opponent: unvotedMatch.song2,
        thumbnailUrl: unvotedMatch.thumbnailUrl,
        message: message,
        detail: `"${unvotedMatch.song1}" vs "${unvotedMatch.song2}"`,
        cta: 'Vote Now!',
        priority: 6
    });
    
    localStorage.setItem('lastActivityToast', Date.now().toString());
}

// ========================================
// BULLETIN DETECTION LOGIC
// ========================================

async function checkAndShowBulletin() {
    try {
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        const hasVoted = Object.keys(userVotes).length > 0;

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
            
            const userSongId = vote.songId;
           // ✅ CORRECT:
const userSong = userSongId === 'song1' ? match.song1 : match.song2;
const opponent = userSongId === 'song1' ? match.song2 : match.song1;
            
            if (!userSong || !opponent) continue;
            
            const totalVotes = match.totalVotes || 0;
            const userSongVotes = userSong.votes || 0;
            const opponentVotes = opponent.votes || 0;
            const voteDiff = Math.abs(userSongVotes - opponentVotes);
            
            const userPct = totalVotes > 0 ? Math.round((userSongVotes / totalVotes) * 100) : 50;
            const opponentPct = totalVotes > 0 ? 100 - userPct : 50;
            
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
    notifications.push({
        priority: 1,
        type: 'danger',
        matchId: match.id,
        song: userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song',
        opponent: opponent?.shortTitle || opponent?.title || vote.opponentTitle || 'Opponent',
        thumbnailUrl: getThumbnailUrl(userSong?.youtubeUrl),
        userPct,
        opponentPct,
        voteDiff,
        message: `🚨 Your pick "${userSong?.shortTitle || userSong?.title || vote.songTitle || 'Unknown Song'}" is in danger!`,
        detail: `Behind by ${voteDiff} votes (${userPct}% vs ${opponentPct}%)`,
        cta: 'View Match Now!'
    });
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
                
        // Show highest priority notification that hasn't been dismissed
        notifications.sort((a, b) => a.priority - b.priority);
        
        for (const notification of notifications) {
            const bulletinKey = `${notification.type}-${notification.matchId}`;
            if (!dismissedBulletins.has(bulletinKey)) {
                showBulletin(notification);
                break;
            }
        }
        
    } catch (error) {
        console.error('Error checking bulletin:', error);
    }
}

// ========================================
// SMART WELCOME TIMING
// ========================================

async function shouldShowWelcome(timeOnSite) {
    // Must be on site at least 5 seconds
    if (timeOnSite < 5000) return false;
    
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

// ========================================
// BULLETIN DISPLAY (TOAST STYLE)
// ========================================

function showBulletin(notification) {
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
    welcome: '🎵',              // ← Already exists
    encouragement: '👀',        // ← ADD THIS
    'return-voter': '👋'
};
    
    const icon = icons[notification.type] || '📢';
    
    banner.innerHTML = `
        <div class="bulletin-toast-content">
            <div class="bulletin-thumbnail">
                ${notification.thumbnailUrl ? 
                    `<img src="${notification.thumbnailUrl}" alt="${notification.song}" class="thumbnail-img">` :
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
    
    // Handle all match-specific alerts
    if (['danger', 'nailbiter', 'comeback', 'winning', 'live-activity', 'novotes', 'lowvotes'].includes(currentBulletin.type)) {
        if (currentBulletin.matchId && currentBulletin.matchId !== 'test-match') {
            window.location.href = `/vote.html?match=${currentBulletin.matchId}`;
        } else {
            showNotificationToast('Match not available', 'error');
        }
    }
    // Handle general navigation (welcome, encouragement, etc.)
    else if (currentBulletin.action === 'navigate' && currentBulletin.targetUrl) {
        window.location.href = currentBulletin.targetUrl;
    }
    
    console.log(`📤 Bulletin CTA clicked: ${currentBulletin.type}`);
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
    
    // 🆕 Start live activity monitoring
    startActivityPolling();
    
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
// EXPOSE FOR TESTING & BULLETIN SYSTEM
// ========================================
window.showBulletin = showBulletin;
window.hideBulletin = hideBulletin;
window.checkAndShowBulletin = checkAndShowBulletin;

console.log('✅ Bulletin functions exposed to window');

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
    };
    
    const notification = testNotifications[type] || testNotifications.winning;
    showBulletin(notification);
};

console.log('✅ global-notifications.js fully loaded with toast-style bulletins');