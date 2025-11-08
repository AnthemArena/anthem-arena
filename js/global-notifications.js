console.log('🔔 global-notifications.js loaded');

// ========================================
// GLOBAL NOTIFICATION + BULLETIN SYSTEM
// With Smart Polling + Edge Caching
// ========================================

import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

// Smart polling intervals
const CHECK_INTERVALS = {
    ACTIVE: 30000,      // 30 seconds (user just interacted)
    RECENT: 60000,      // 1 minute (user active in last 5 min)
    IDLE: 120000        // 2 minutes (user idle)
};

let currentInterval = CHECK_INTERVALS.IDLE;
let lastUserActivity = Date.now();
let notificationInterval = null;
let currentBulletin = null;

// ========================================
// SMART POLLING: TRACK USER ACTIVITY
// ========================================

function trackActivity() {
    lastUserActivity = Date.now();
    adjustPollingFrequency();
}

// Track various user activities
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) trackActivity();
});

document.addEventListener('mousemove', trackActivity);
document.addEventListener('keydown', trackActivity);
document.addEventListener('scroll', trackActivity);
document.addEventListener('click', trackActivity);

// ========================================
// ADJUST POLLING BASED ON ACTIVITY
// ========================================

function adjustPollingFrequency() {
    const timeSinceActivity = Date.now() - lastUserActivity;
    let newInterval;
    
    if (timeSinceActivity < 60000) {
        newInterval = CHECK_INTERVALS.ACTIVE;
    } else if (timeSinceActivity < 300000) {
        newInterval = CHECK_INTERVALS.RECENT;
    } else {
        newInterval = CHECK_INTERVALS.IDLE;
    }
    
    if (newInterval !== currentInterval) {
        currentInterval = newInterval;
        console.log(`⏱️ Polling interval adjusted to ${currentInterval / 1000}s`);
        
        // Restart service with new interval
        if (notificationInterval) {
            startNotificationService();
        }
    }
}

// ========================================
// CHECK NOTIFICATION STATUS ON PAGE LOAD
// ========================================

function checkGlobalNotificationStatus() {
    const isEnabled = localStorage.getItem('globalNotificationsEnabled') === 'true';
    
    if (isEnabled && Notification.permission === "granted") {
        updateGlobalNotificationButton('enabled');
        startNotificationService();
    } else if (isEnabled && Notification.permission !== "granted") {
        localStorage.removeItem('globalNotificationsEnabled');
        updateGlobalNotificationButton('disabled');
    } else {
        updateGlobalNotificationButton('disabled');
    }
    
    // Always check bulletins (even without push notifications)
    checkAndShowBulletin();
}

// ========================================
// NOTIFICATION SERVICE (SMART POLLING)
// ========================================

function startNotificationService() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
    }
    
    console.log(`🔔 Starting notification service (${currentInterval / 1000}s interval)`);
    
    // Check immediately
    checkForLiveMatches();
    checkAndShowBulletin();
    
    // Then check at current interval
    notificationInterval = setInterval(() => {
        checkForLiveMatches();
        checkAndShowBulletin();
        adjustPollingFrequency(); // Re-evaluate interval
    }, currentInterval);
}

function stopNotificationService() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
        console.log('🔕 Stopped notification service');
    }
}

// ========================================
// CHECK USER'S PICKS + GENERAL BULLETINS
// ========================================

async function checkAndShowBulletin() {
    console.log('🔍 ========== BULLETIN CHECK START ==========');
    
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    console.log('🔍 User votes:', userVotes);
    console.log('🔍 Number of votes:', Object.keys(userVotes).length);
    
    const notifications = [];
    
    try {
        // ========================================
        // PRIORITY 1: Check user's picks FIRST
        // ========================================
        if (Object.keys(userVotes).length > 0) {
            console.log('🔍 Checking user picks...');
            
            for (const [matchId, vote] of Object.entries(userVotes)) {
                console.log(`🔍 --- Checking match ${matchId} ---`);
                console.log(`🔍 Vote data:`, vote);
                
                const match = await getMatchData(matchId);
                console.log(`🔍 Match data:`, match);
                
                if (!match) {
                    console.log(`🔍 ❌ Match ${matchId} not found`);
                    continue;
                }
                
                if (match.status !== 'live') {
                    console.log(`🔍 ❌ Match ${matchId} status is "${match.status}", not "live"`);
                    continue;
                }
                
                if (isDismissedRecently(matchId)) {
                    console.log(`🔍 ❌ Match ${matchId} dismissed recently`);
                    continue;
                }
                
                console.log(`🔍 ✅ Match ${matchId} is live and not dismissed`);
                
                const userSong = vote.songId === 'song1' ? match.song1 : match.song2;
                const opponent = vote.songId === 'song1' ? match.song2 : match.song1;
                
                console.log(`🔍 User voted for:`, userSong);
                console.log(`🔍 Opponent:`, opponent);
                
                const totalVotes = match.totalVotes || 0;
                const userSongVotes = userSong?.votes || 0;
                const opponentVotes = opponent?.votes || 0;
                const voteDiff = Math.abs(userSongVotes - opponentVotes);
                
                const userPct = totalVotes > 0 ? Math.round((userSongVotes / totalVotes) * 100) : 50;
                const opponentPct = totalVotes > 0 ? 100 - userPct : 50;
                
                console.log(`🔍 Vote stats:`);
                console.log(`   Total votes: ${totalVotes}`);
                console.log(`   User song votes: ${userSongVotes} (${userPct}%)`);
                console.log(`   Opponent votes: ${opponentVotes} (${opponentPct}%)`);
                console.log(`   Difference: ${voteDiff} votes`);
                
            if (totalVotes < 3) { // CHANGED: Lower for new site
                    console.log(`🔍 ❌ Not enough total votes yet (${totalVotes} < 3)`);
                    continue;
                }
                
                console.log(`🔍 ✅ Enough votes (${totalVotes}), checking triggers...`);
                
                // TRIGGER 1: DANGER
                if (userPct < 40 && voteDiff >= 3) { // CHANGED: 40% and 3 votes
                    console.log(`🔍 🚨 DANGER TRIGGER: ${userPct}% < 40% AND ${voteDiff} >= 3`);
                    if (shouldShowNotification(matchId, 'danger')) {
                        console.log(`🔍 ✅ Danger cooldown passed, adding notification`);
                        notifications.push({
                            priority: 1,
                            type: 'danger',
                            matchId: matchId,
                            song: userSong.shortTitle || userSong.title,
                            opponent: opponent.shortTitle || opponent.title,
                            userPct, opponentPct, voteDiff,
                            message: `🚨 "${userSong.shortTitle || userSong.title}" is in danger!`,
                            detail: `Behind by ${voteDiff} votes (${userPct}% vs ${opponentPct}%)`,
                            cta: 'Rally Support Now!'
                        });
                    } else {
                        console.log(`🔍 ❌ Danger cooldown not passed yet`);
                    }
                } else {
                    console.log(`🔍 No danger: userPct=${userPct} (need <40), voteDiff=${voteDiff} (need >=3)`);
                }
                
                // TRIGGER 2: NAIL-BITER
                if (voteDiff <= 3) { // CHANGED: 3 votes
                    console.log(`🔍 🔥 NAIL-BITER TRIGGER: ${voteDiff} <= 3`);
                    if (shouldShowNotification(matchId, 'nailbiter')) {
                        console.log(`🔍 ✅ Nailbiter cooldown passed, adding notification`);
                        notifications.push({
                            priority: 2,
                            type: 'nailbiter',
                            matchId, 
                            song: userSong.shortTitle || userSong.title,
                            opponent: opponent.shortTitle || opponent.title,
                            voteDiff, userPct, opponentPct,
                            message: `🔥 "${userSong.shortTitle || userSong.title}" is TOO CLOSE!`,
                            detail: `Separated by just ${voteDiff} vote${voteDiff === 1 ? '' : 's'}!`,
                            cta: 'Share This Match!'
                        });
                    } else {
                        console.log(`🔍 ❌ Nailbiter cooldown not passed yet`);
                    }
                } else {
                    console.log(`🔍 No nail-biter: voteDiff=${voteDiff} (need <=3)`);
                }
                
                // TRIGGER 3: COMEBACK
                const previousState = getPreviousMatchState(matchId);
                if (previousState) {
                    console.log(`🔍 Previous state found:`, previousState);
                    const wasLosing = previousState.userPct < previousState.opponentPct;
                    const nowWinning = userPct > opponentPct;
                    console.log(`🔍 Was losing: ${wasLosing}, Now winning: ${nowWinning}`);
                    
                    if (wasLosing && nowWinning && shouldShowNotification(matchId, 'comeback')) {
                        console.log(`🔍 🎉 COMEBACK TRIGGER!`);
                        notifications.push({
                            priority: 3,
                            type: 'comeback',
                            matchId, 
                            song: userSong.shortTitle || userSong.title,
                            opponent: opponent.shortTitle || opponent.title,
                            userPct, opponentPct,
                            message: `🎉 "${userSong.shortTitle || userSong.title}" completed comeback!`,
                            detail: `Was losing, now leading ${userPct}% to ${opponentPct}%!`,
                            cta: 'Celebrate & Share!'
                        });
                    }
                } else {
                    console.log(`🔍 No previous state found for ${matchId}`);
                }
                
                // TRIGGER 4: DOMINATING
                if (userPct >= 65) { // CHANGED: 65%
                    console.log(`🔍 🎯 DOMINATING TRIGGER: ${userPct}% >= 65%`);
                    if (shouldShowNotification(matchId, 'winning')) {
                        console.log(`🔍 ✅ Winning cooldown passed, adding notification`);
                        notifications.push({
                            priority: 4,
                            type: 'winning',
                            matchId, 
                            song: userSong.shortTitle || userSong.title,
                            opponent: opponent.shortTitle || opponent.title,
                            userPct, opponentPct,
                            message: `🎯 "${userSong.shortTitle || userSong.title}" is dominating!`,
                            detail: `Leading ${userPct}% to ${opponentPct}%`,
                            cta: 'Share the Victory!'
                        });
                    } else {
                        console.log(`🔍 ❌ Winning cooldown not passed yet`);
                    }
                } else {
                    console.log(`🔍 Not dominating: userPct=${userPct} (need >=65)`);
                }
                
                saveMatchState(matchId, userPct, opponentPct);
                console.log(`🔍 Match state saved`);
            }
            
            // If found user bulletin, show it and STOP
            if (notifications.length > 0) {
                console.log(`🔍 ✅ Found ${notifications.length} user bulletin(s):`, notifications);
                notifications.sort((a, b) => a.priority - b.priority);
                const topNotification = notifications[0];
                console.log(`🔍 📢 Showing top priority bulletin:`, topNotification);
                showBulletin(topNotification);
                markNotificationShown(topNotification.matchId, topNotification.type);
                console.log('🔍 ========== BULLETIN CHECK END (USER BULLETIN SHOWN) ==========');
                return;
            } else {
                console.log(`🔍 ❌ No user bulletins triggered`);
            }
        } else {
            console.log('🔍 No user votes found, checking general bulletins...');
        }
        
        // ========================================
        // PRIORITY 2: General voting encouragement
        // ========================================
        console.log('🔍 Checking general bulletins...');
        
        const lastGeneralCheck = localStorage.getItem('lastGeneralBulletinCheck');
        const timeSinceGeneral = lastGeneralCheck 
            ? Date.now() - parseInt(lastGeneralCheck)
            : 1800001;
        
        console.log(`🔍 Time since last general check: ${Math.round(timeSinceGeneral / 60000)} minutes`);
        
        if (timeSinceGeneral < 1800000) {
            console.log(`🔍 ❌ General bulletin cooldown active (< 30 minutes)`);
            hideBulletin();
            console.log('🔍 ========== BULLETIN CHECK END (COOLDOWN) ==========');
            return;
        }
        
        console.log(`🔍 ✅ General bulletin cooldown passed`);
        
        // Fetch all live matches from edge
        const liveMatches = await getAllLiveMatches();
        console.log(`🔍 Found ${liveMatches.length} live matches`);
        
        if (liveMatches.length === 0) {
            console.log(`🔍 ❌ No live matches`);
            hideBulletin();
            console.log('🔍 ========== BULLETIN CHECK END (NO MATCHES) ==========');
            return;
        }
        
        console.log(`🔍 Checking ${liveMatches.length} matches for general bulletins...`);
        
        for (const match of liveMatches) {
            const matchId = match.id || match.matchId;
            const totalVotes = match.totalVotes || 0;
            const song1Votes = match.song1?.votes || 0;
            const song2Votes = match.song2?.votes || 0;
            const voteDiff = Math.abs(song1Votes - song2Votes);
            
            console.log(`🔍 Match ${matchId}: ${totalVotes} votes, diff: ${voteDiff}`);
            
            if (userVotes[matchId]) {
                console.log(`🔍 Skip ${matchId} - user already voted`);
                continue;
            }
            if (wasShownRecently(matchId, 'general')) {
                console.log(`🔍 Skip ${matchId} - shown recently`);
                continue;
            }
            
            // CLOSE MATCH
if (totalVotes >= 3 && voteDiff <= 3) {
                console.log(`🔍 🔥 Close match found: ${matchId}`);
                notifications.push({
                    priority: 2,
                    type: 'close-match',
                    matchId,
                    song1: match.song1.shortTitle || match.song1.title,
                    song2: match.song2.shortTitle || match.song2.title,
                    voteDiff, totalVotes,
                    message: `🔥 NAIL-BITER: "${match.song1.shortTitle}" vs "${match.song2.shortTitle}"`,
                    detail: `Separated by just ${voteDiff} vote${voteDiff === 1 ? '' : 's'}!`,
                    cta: 'Cast Deciding Vote',
                    action: 'navigate',
                    targetUrl: `/vote.html?match=${matchId}`
                });
            }
        }
        
        // WELCOME (first-time visitor)
        if (Object.keys(userVotes).length === 0 && !wasShownRecently('welcome', 'general')) {
            console.log(`🔍 🎵 Welcome bulletin triggered`);
            notifications.push({
                priority: 5,
                type: 'welcome',
                message: '🎵 Welcome to the League Music Tournament!',
                detail: `${liveMatches.length} match${liveMatches.length === 1 ? '' : 'es'} live - cast your first vote!`,
                cta: 'Start Voting',
                action: 'navigate',
                targetUrl: '/matches.html'
            });
        }
        
        // Show highest priority
        if (notifications.length > 0) {
            console.log(`🔍 ✅ Found ${notifications.length} general bulletin(s):`, notifications);
            notifications.sort((a, b) => a.priority - b.priority);
            const topNotification = notifications[0];
            console.log(`🔍 📢 Showing general bulletin:`, topNotification);
            showBulletin(topNotification);
            markGeneralNotificationShown(topNotification.matchId || topNotification.type);
        } else {
            console.log(`🔍 ❌ No general bulletins triggered`);
            hideBulletin();
        }
        
        localStorage.setItem('lastGeneralBulletinCheck', Date.now().toString());
        console.log('🔍 ========== BULLETIN CHECK END ==========');
        
    } catch (error) {
        console.error('❌ Error checking bulletin:', error);
        console.error('Stack:', error.stack);
        console.log('🔍 ========== BULLETIN CHECK END (ERROR) ==========');
    }
}

// ========================================
// GET ALL LIVE MATCHES (FROM EDGE)
// ========================================

async function getAllLiveMatches() {
    try {
        console.log('🌐 Fetching live matches from Edge...');
        
        const response = await fetch('/api/live-matches');
        
        if (!response.ok) {
            throw new Error(`Edge function returned ${response.status}`);
        }
        
        const data = await response.json();
        const cacheStatus = response.headers.get('X-Cache');
        
        console.log(`✅ Got ${data.matches.length} live matches (${cacheStatus})`);
        
        return data.matches;
    } catch (error) {
        console.error('❌ Error fetching from edge:', error);
        return [];
    }
}

// ========================================
// GET MATCH DATA (USER'S SPECIFIC MATCH)
// ========================================

async function getMatchData(matchId) {
    try {
        // Try existing edge cache first
        const response = await fetch(`/api/matches?matchId=${matchId}`);
        
        if (response.ok) {
            const match = await response.json();
            console.log(`✅ Got match ${matchId} from edge`);
            return match;
        }
    } catch (error) {
        console.warn(`Edge fetch failed for ${matchId}, trying Firebase...`);
    }
    
    // Fallback to Firebase
    try {
        const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchId);
        const matchDoc = await getDoc(matchRef);
        
        if (!matchDoc.exists()) return null;
        
        console.log(`✅ Got match ${matchId} from Firebase (fallback)`);
        return matchDoc.data();
    } catch (error) {
        console.error(`❌ Error fetching match ${matchId}:`, error);
        return null;
    }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function shouldShowNotification(matchId, type) {
    const cooldownKey = `bulletin_cooldown_${matchId}_${type}`;
    const lastShown = localStorage.getItem(cooldownKey);
    
    if (!lastShown) return true;
    
    const hoursSinceShown = (Date.now() - parseInt(lastShown)) / 3600000;
    
    if (type === 'danger') return hoursSinceShown >= 1;
    if (type === 'nailbiter') return hoursSinceShown >= 2;
    if (type === 'winning') return hoursSinceShown >= 4;
    if (type === 'comeback') return true;
    
    return false;
}

function markNotificationShown(matchId, type) {
    const cooldownKey = `bulletin_cooldown_${matchId}_${type}`;
    localStorage.setItem(cooldownKey, Date.now().toString());
}

function isDismissedRecently(matchId) {
    const dismissKey = `bulletin_dismissed_${matchId}`;
    const dismissedAt = localStorage.getItem(dismissKey);
    
    if (!dismissedAt) return false;
    
    const hoursSinceDismissed = (Date.now() - parseInt(dismissedAt)) / 3600000;
    return hoursSinceDismissed < 2;
}

function saveMatchState(matchId, userPct, opponentPct) {
    const stateKey = `match_state_${matchId}`;
    localStorage.setItem(stateKey, JSON.stringify({
        userPct, opponentPct,
        timestamp: Date.now()
    }));
}

function getPreviousMatchState(matchId) {
    const stateKey = `match_state_${matchId}`;
    const state = localStorage.getItem(stateKey);
    
    if (!state) return null;
    
    try {
        return JSON.parse(state);
    } catch {
        return null;
    }
}

function wasShownRecently(identifier, category) {
    const key = `bulletin_shown_${category}_${identifier}`;
    const lastShown = localStorage.getItem(key);
    
    if (!lastShown) return false;
    
    const hoursSinceShown = (Date.now() - parseInt(lastShown)) / 3600000;
    
    if (category === 'general') return hoursSinceShown < 4;
    
    return false;
}

function markGeneralNotificationShown(identifier) {
    const key = `bulletin_shown_general_${identifier}`;
    localStorage.setItem(key, Date.now().toString());
}

function isMatchNew(match) {
    if (!match.startTime) return false;
    
    const startTime = typeof match.startTime === 'number' 
        ? match.startTime 
        : match.startTime.toMillis 
            ? match.startTime.toMillis() 
            : match.startTime;
    
    const minutesSinceStart = (Date.now() - startTime) / 60000;
    return minutesSinceStart < 30;
}

function isLowTurnout(match) {
    if (!match.startTime) return false;
    
    const startTime = typeof match.startTime === 'number' 
        ? match.startTime 
        : match.startTime.toMillis 
            ? match.startTime.toMillis() 
            : match.startTime;
    
    const hoursSinceStart = (Date.now() - startTime) / 3600000;
    const totalVotes = match.totalVotes || 0;
    
return hoursSinceStart >= 2 && totalVotes < 10;
}

function isReturnVoter(userVotes) {
    if (Object.keys(userVotes).length === 0) return false;
    
    let mostRecentVote = 0;
    for (const vote of Object.values(userVotes)) {
        if (vote.timestamp > mostRecentVote) {
            mostRecentVote = vote.timestamp;
        }
    }
    
    const hoursSinceLastVote = (Date.now() - mostRecentVote) / 3600000;
    return hoursSinceLastVote >= 24;
}

// ========================================
// BULLETIN UI
// ========================================

function showBulletin(notification) {
    let banner = document.getElementById('bulletin-banner');
    
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'bulletin-banner';
        banner.className = 'bulletin-banner';
  // In showBulletin() function, around line 630, change the HTML order:
banner.innerHTML = `
    <div class="bulletin-content">
        <div class="bulletin-icon" id="bulletin-icon"></div>
        <div class="bulletin-text">
            <div class="bulletin-message" id="bulletin-message"></div>
            <div class="bulletin-detail" id="bulletin-detail"></div>
        </div>
        <button class="bulletin-cta" id="bulletin-cta" onclick="window.handleBulletinCTA()"></button>
        <button class="bulletin-close" onclick="window.dismissBulletin()">×</button>
    </div>
`;
        document.body.appendChild(banner);
        
        if (!document.getElementById('bulletin-styles')) {
            const style = document.createElement('style');
            style.id = 'bulletin-styles';
            style.textContent = `
    .bulletin-banner {
        position: fixed;
        top: 80px;
        left: 0;
        right: 0;
        z-index: 999;
        padding: 0;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
        transform: translateY(-100%);
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(10px);
    }
    
    .bulletin-banner.show { 
        transform: translateY(0); 
    }
    
  /* Replace all the themed backgrounds (around line 683-730) with this unified theme: */

/* Unified dark + gold theme for ALL bulletin types */
.bulletin-banner.danger,
.bulletin-banner.nailbiter,
.bulletin-banner.winning,
.bulletin-banner.comeback,
.bulletin-banner.close-match,
.bulletin-banner.new-match,
.bulletin-banner.low-turnout,
.bulletin-banner.welcome,
.bulletin-banner.return-voter {
    background: linear-gradient(135deg, rgba(20, 25, 35, 0.97), rgba(15, 20, 30, 0.97));
    border-bottom: 3px solid #C8AA6E;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6), 0 0 40px rgba(200, 170, 110, 0.15);
}

/* Unified CTA button - gold theme */
.bulletin-cta {
    background: linear-gradient(135deg, #C8AA6E, #B89A5E);
    color: #0a0a0a;
    border: none;
    padding: 0.85rem 1.75rem;
    border-radius: 8px;
    font-family: 'Cinzel', serif;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    box-shadow: 0 4px 12px rgba(200, 170, 110, 0.3);
}

.bulletin-cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(200, 170, 110, 0.5);
    background: linear-gradient(135deg, #D4B876, #C8AA6E);
}

.bulletin-cta:active {
    transform: translateY(0);
}
    
    .bulletin-content {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        gap: 1.25rem;
        padding: 1.25rem 2rem;
        color: white;
    }
    
    .bulletin-icon {
        font-size: 2.5rem;
        animation: pulse 2s ease-in-out infinite;
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
    }
    
   /* Update the @keyframes pulse around line 707 */
@keyframes pulse {
    0%, 100% { 
        transform: scale(1) rotate(0deg);
        opacity: 1;
    }
    50% { 
        transform: scale(1.2) rotate(5deg);
        opacity: 0.9;
    }
}
    
    .bulletin-text { 
        flex: 1;
        min-width: 0;
    }
    
    .bulletin-message {
        font-family: 'Cinzel', serif;
        font-size: 1.15rem;
        font-weight: 700;
        margin-bottom: 0.35rem;
        letter-spacing: 0.02em;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    .bulletin-detail {
        font-family: 'Lora', serif;
        font-size: 0.95rem;
        opacity: 0.95;
        font-weight: 400;
    }
    
    .bulletin-cta {
        background: white;
        border: none;
        padding: 0.85rem 1.75rem;
        border-radius: 8px;
        font-family: 'Cinzel', serif;
        font-weight: 700;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    
    .bulletin-banner.danger .bulletin-cta { 
        color: #dc2626;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
    }
    .bulletin-banner.nailbiter .bulletin-cta { 
        color: #d97706;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
    }
    .bulletin-banner.winning .bulletin-cta { 
        color: #059669;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
    }
    .bulletin-banner.comeback .bulletin-cta { 
        color: #7c3aed;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
    }
    .bulletin-banner.close-match .bulletin-cta { 
        color: #d97706;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
    }
    .bulletin-banner.new-match .bulletin-cta { 
        color: #2563eb;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
    }
    .bulletin-banner.low-turnout .bulletin-cta { 
        color: #4f46e5;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
    }
    .bulletin-banner.welcome .bulletin-cta { 
        color: #C8AA6E;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
    }
    .bulletin-banner.return-voter .bulletin-cta { 
        color: #7e22ce;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
    }
    
    .bulletin-cta:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }
    
    .bulletin-cta:active {
        transform: translateY(0);
    }
    
    .bulletin-close {
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.25);
        color: white;
        font-size: 1.5rem;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        cursor: pointer;
        opacity: 0.8;
        transition: all 0.2s;
        line-height: 1;
        padding: 0;
        font-weight: 300;
    }
    
    .bulletin-close:hover { 
        opacity: 1;
        background: rgba(255, 255, 255, 0.25);
        transform: scale(1.05);
    }
    
    /* Mobile responsive */
    @media (max-width: 768px) {
        .bulletin-banner { 
            top: 60px;
        }
        
        .bulletin-content {
            flex-wrap: wrap;
            gap: 0.75rem;
            padding: 1rem 1.25rem;
        }
        
        .bulletin-icon { 
            font-size: 1.75rem;
        }
        
        .bulletin-message { 
            font-size: 1rem;
        }
        
        .bulletin-detail { 
            font-size: 0.875rem;
        }
        
        .bulletin-cta {
            width: 100%;
            margin-top: 0.5rem;
            padding: 0.75rem 1.5rem;
            font-size: 0.85rem;
        }
        
        .bulletin-close {
            position: absolute;
            top: 0.75rem;
            right: 0.75rem;
            width: 32px;
            height: 32px;
            font-size: 1.25rem;
        }
    }
    
    /* Extra small screens */
    @media (max-width: 480px) {
        .bulletin-content {
            padding: 0.875rem 1rem;
        }
        
        .bulletin-icon {
            font-size: 1.5rem;
        }
        
        .bulletin-message {
            font-size: 0.95rem;
        }
        
        .bulletin-detail {
            font-size: 0.825rem;
        }
    }
`;
            document.head.appendChild(style);
        }
    }
    
    // Update content
    currentBulletin = notification;
    
    const icon = document.getElementById('bulletin-icon');
    const message = document.getElementById('bulletin-message');
    const detail = document.getElementById('bulletin-detail');
    const cta = document.getElementById('bulletin-cta');
    
    const icons = {
        danger: '🚨',
        nailbiter: '🔥',
        winning: '🎯',
        comeback: '🎉',
        'close-match': '🔥',
        'new-match': '🆕',
        'low-turnout': '📊',
        welcome: '🎵',
        'return-voter': '👋'
    };
    
    icon.textContent = icons[notification.type] || '📢';
    message.textContent = notification.message;
    detail.textContent = notification.detail;
    cta.textContent = notification.cta;
    
    banner.className = `bulletin-banner ${notification.type}`;
    
    setTimeout(() => banner.classList.add('show'), 10);
    
    console.log(`📢 Bulletin shown: ${notification.type}`);
}

function hideBulletin() {
    const banner = document.getElementById('bulletin-banner');
    if (banner) {
        // Slide up animation
        banner.classList.remove('show');
        
        // Remove from DOM after animation completes
        setTimeout(() => {
            banner.remove();
        }, 300);
        
        console.log('🔕 Bulletin hidden and removed');
    }
    currentBulletin = null;
}

// ========================================
// BULLETIN ACTIONS
// ========================================

window.dismissBulletin = function() {
    if (currentBulletin && currentBulletin.matchId) {
        const dismissKey = `bulletin_dismissed_${currentBulletin.matchId}`;
        localStorage.setItem(dismissKey, Date.now().toString());
        console.log(`🔕 Bulletin dismissed for ${currentBulletin.matchId}`);
    }
    
    hideBulletin();
};

window.handleBulletinCTA = function() {
    if (!currentBulletin) return;
    
    // Handle user's pick bulletins (with rally message)
    if (['danger', 'nailbiter', 'comeback', 'winning'].includes(currentBulletin.type)) {
        const rallyMessage = generateRallyMessage(currentBulletin);
        
        navigator.clipboard.writeText(rallyMessage).then(() => {
            showNotificationToast('Rally message copied! Share it to rally support! 🔥', 'success');
            
            setTimeout(() => {
                window.location.href = `/vote.html?match=${currentBulletin.matchId}`;
            }, 1500);
        }).catch(() => {
            showNotificationToast('Opening match...', 'info');
            setTimeout(() => {
                window.location.href = `/vote.html?match=${currentBulletin.matchId}`;
            }, 1000);
        });
    }
    // Handle general voting encouragement
    else if (currentBulletin.action === 'navigate' && currentBulletin.targetUrl) {
        window.location.href = currentBulletin.targetUrl;
    }
    
    console.log(`📤 Bulletin CTA clicked: ${currentBulletin.type}`);
};

// ========================================
// GENERATE RALLY MESSAGE
// ========================================

function generateRallyMessage(notification) {
    const matchUrl = `${window.location.origin}/vote.html?match=${notification.matchId}`;
    
    let message = '';
    
    if (notification.type === 'danger') {
        message = `🚨 EMERGENCY: "${notification.song}" is being ELIMINATED!\n\n` +
                  `It's losing ${notification.userPct}% to ${notification.opponentPct}% and needs YOUR vote!\n\n` +
                  `Vote now: ${matchUrl}\n\n` +
                  `#LeagueMusicTournament`;
    }
    else if (notification.type === 'nailbiter') {
        message = `🔥 TOO CLOSE TO CALL!\n\n` +
                  `"${notification.song}" vs "${notification.opponent}" - separated by ${notification.voteDiff} vote${notification.voteDiff === 1 ? '' : 's'}!\n\n` +
                  `Your vote DECIDES: ${matchUrl}\n\n` +
                  `#LeagueMusicTournament`;
    }
    else if (notification.type === 'comeback') {
        message = `🎉 COMEBACK COMPLETE!\n\n` +
                  `"${notification.song}" was losing but took the lead ${notification.userPct}%-${notification.opponentPct}%!\n\n` +
                  `Help maintain momentum: ${matchUrl}\n\n` +
                  `#LeagueMusicTournament`;
    }
    else if (notification.type === 'winning') {
        message = `🎯 "${notification.song}" is DOMINATING at ${notification.userPct}%!\n\n` +
                  `Join the winning side: ${matchUrl}\n\n` +
                  `#LeagueMusicTournament`;
    }
    
    return message;
}

// ========================================
// ENABLE/DISABLE PUSH NOTIFICATIONS
// ========================================

async function enableGlobalNotifications() {
    const button = document.getElementById('enable-notifications');
    const statusText = button?.querySelector('.notification-status');
    
    if (!button || !statusText) return;
    
    if (!("Notification" in window)) {
        showNotificationToast('Your browser doesn\'t support notifications', 'error');
        return;
    }
    
    const isEnabled = localStorage.getItem('globalNotificationsEnabled') === 'true';
    
    if (isEnabled) {
        localStorage.removeItem('globalNotificationsEnabled');
        stopNotificationService();
        updateGlobalNotificationButton('disabled');
        showNotificationToast('Notifications disabled', 'info');
        console.log('🔕 Global notifications disabled');
        return;
    }
    
    if (Notification.permission === "denied") {
        showNotificationToast('Notifications blocked. Enable in browser settings.', 'error');
        return;
    }
    
    if (Notification.permission === "default") {
        button.disabled = true;
        statusText.textContent = 'Requesting permission...';
        
        try {
            const permission = await Notification.requestPermission();
            
            if (permission !== "granted") {
                showNotificationToast('Notification permission denied', 'error');
                button.disabled = false;
                statusText.textContent = 'Enable Notifications';
                return;
            }
        } catch (error) {
            console.error('Error requesting permission:', error);
            showNotificationToast('Error enabling notifications', 'error');
            button.disabled = false;
            statusText.textContent = 'Enable Notifications';
            return;
        }
    }
    
    localStorage.setItem('globalNotificationsEnabled', 'true');
    localStorage.setItem('lastNotificationCheck', Date.now().toString());
    
    new Notification("🎉 Notifications Enabled!", {
        body: "You'll be notified when matches go live. Click to disable anytime.",
        icon: "/favicon/favicon-32x32.png",
        badge: "/favicon/favicon-32x32.png",
        tag: 'global-notifications-enabled'
    });
    
    showNotificationToast('Notifications enabled!', 'success');
    updateGlobalNotificationButton('enabled');
    startNotificationService();
    
    console.log('✅ Global notifications enabled');
}

// ========================================
// UPDATE BUTTON STATE
// ========================================

function updateGlobalNotificationButton(state) {
    const button = document.getElementById('enable-notifications');
    const statusText = button?.querySelector('.notification-status');
    const hintText = document.querySelector('.notification-hint');
    
    if (!button || !statusText) return;
    
    if (state === 'enabled') {
        button.classList.add('notifications-enabled');
        button.classList.remove('notifications-disabled');
        button.disabled = false;
        button.style.cursor = 'pointer';
        statusText.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Notifications Enabled
        `;
        button.title = 'Click to disable notifications';
        
        if (hintText) {
            hintText.textContent = 'Click button to turn off notifications';
        }
        
    } else if (state === 'disabled') {
        button.classList.remove('notifications-enabled');
        button.classList.add('notifications-disabled');
        button.disabled = false;
        button.style.cursor = 'pointer';
        statusText.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Enable Notifications
        `;
        button.title = 'Click to enable notifications';
        
        if (hintText) {
            hintText.textContent = 'Receive alerts for upcoming matches';
        }
    }
}

// ========================================
// CHECK FOR LIVE MATCHES (PUSH NOTIFICATIONS)
// ========================================

async function checkForLiveMatches() {
    if (localStorage.getItem('globalNotificationsEnabled') !== 'true') {
        stopNotificationService();
        return;
    }
    
    if (Notification.permission !== "granted") {
        stopNotificationService();
        return;
    }
    
    try {
        const liveMatches = await getAllLiveMatches();
        
        liveMatches.forEach(match => {
            const matchId = match.matchId;
            const notifiedKey = `notified_${matchId}`;
            
            if (!localStorage.getItem(notifiedKey)) {
                sendMatchNotification(match);
                localStorage.setItem(notifiedKey, 'true');
            }
        });
        
        localStorage.setItem('lastNotificationCheck', Date.now().toString());
        
    } catch (error) {
        console.error('❌ Error checking live matches:', error);
    }
}

// ========================================
// SEND MATCH NOTIFICATION
// ========================================

function sendMatchNotification(match) {
    const song1 = match.song1.shortTitle || match.song1.title;
    const song2 = match.song2.shortTitle || match.song2.title;
    
    const notification = new Notification("🔴 Match is LIVE!", {
        body: `${song1} vs ${song2} - Vote now!`,
        icon: "/favicon/favicon-32x32.png",
        badge: "/favicon/favicon-32x32.png",
        tag: `match-${match.matchId}`,
        requireInteraction: false,
        vibrate: [200, 100, 200]
    });
    
    notification.onclick = function() {
        window.focus();
        window.location.href = `/vote.html?match=${match.matchId}`;
        notification.close();
    };
    
    console.log(`🔔 Push notification sent: ${song1} vs ${song2}`);
}

// ========================================
// NOTIFICATION TOAST
// ========================================

function showNotificationToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    toast.textContent = message;
    
    const colors = {
        success: 'linear-gradient(135deg, rgba(76, 175, 80, 0.95), rgba(56, 142, 60, 0.95))',
        error: 'linear-gradient(135deg, rgba(244, 67, 54, 0.95), rgba(211, 47, 47, 0.95))',
        info: 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))'
    };
    
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 1.5rem;
        background: ${colors[type] || colors.info};
        color: white;
        border-radius: 8px;
        font-family: 'Lora', serif;
        font-size: 0.95rem;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================================
// INIT ON PAGE LOAD
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    checkGlobalNotificationStatus();
    trackActivity(); // Initialize activity tracking
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        checkAndShowBulletin();
    }
});

// ========================================
// EXPORT FUNCTIONS
// ========================================

window.enableGlobalNotifications = enableGlobalNotifications;
window.checkGlobalNotificationStatus = checkGlobalNotificationStatus;

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
            userPct: 35,
            opponentPct: 65,
            voteDiff: 15,
            message: '🚨 "GODS" is in danger!',
            detail: 'Behind by 15 votes (35% vs 65%)',
            cta: 'Rally Support Now!'
        },
        nailbiter: {
            priority: 2,
            type: 'nailbiter',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
            voteDiff: 2,
            userPct: 49,
            opponentPct: 51,
            message: '🔥 "GODS" is TOO CLOSE!',
            detail: 'Separated by just 2 votes!',
            cta: 'Share This Match!'
        },
        winning: {
            priority: 4,
            type: 'winning',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
            userPct: 72,
            opponentPct: 28,
            message: '🎯 "GODS" is dominating!',
            detail: 'Leading 72% to 28%',
            cta: 'Share the Victory!'
        },
        comeback: {
            priority: 3,
            type: 'comeback',
            matchId: 'test-match',
            song: 'GODS',
            opponent: 'RISE',
            userPct: 55,
            opponentPct: 45,
            message: '🎉 "GODS" completed comeback!',
            detail: 'Was losing, now leading 55% to 45%!',
            cta: 'Celebrate & Share!'
        },
        welcome: {
            priority: 5,
            type: 'welcome',
            message: '🎵 Welcome to the League Music Tournament!',
            detail: '15 matches live - cast your first vote!',
            cta: 'Start Voting',
            action: 'navigate',
            targetUrl: '/matches.html'
        }
    };
    
    const notification = testNotifications[type] || testNotifications.winning;
    showBulletin(notification);
};

export { enableGlobalNotifications, checkGlobalNotificationStatus, checkAndShowBulletin };

