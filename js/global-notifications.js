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
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const notifications = [];
    
    try {
        // ========================================
        // PRIORITY 1: Check user's picks FIRST
        // ========================================
        if (Object.keys(userVotes).length > 0) {
            for (const [matchId, vote] of Object.entries(userVotes)) {
                const match = await getMatchData(matchId);
                
                if (!match || match.status !== 'live') continue;
                if (isDismissedRecently(matchId)) continue;
                
                const userSong = vote.songId === 'song1' ? match.song1 : match.song2;
                const opponent = vote.songId === 'song1' ? match.song2 : match.song1;
                
                const totalVotes = match.totalVotes || 0;
                const userVotes = userSong.votes || 0;
                const opponentVotes = opponent.votes || 0;
                const voteDiff = Math.abs(userVotes - opponentVotes);
                
                const userPct = totalVotes > 0 ? Math.round((userVotes / totalVotes) * 100) : 50;
                const opponentPct = totalVotes > 0 ? 100 - userPct : 50;
                
                if (totalVotes < 50) continue;
                
                // TRIGGER 1: DANGER
                if (userPct < 45 && voteDiff >= 10 && shouldShowNotification(matchId, 'danger')) {
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
                }
                
                // TRIGGER 2: NAIL-BITER
                else if (voteDiff <= 5 && shouldShowNotification(matchId, 'nailbiter')) {
                    notifications.push({
                        priority: 2,
                        type: 'nailbiter',
                        matchId, song: userSong.shortTitle || userSong.title,
                        opponent: opponent.shortTitle || opponent.title,
                        voteDiff, userPct, opponentPct,
                        message: `🔥 "${userSong.shortTitle || userSong.title}" is TOO CLOSE!`,
                        detail: `Separated by just ${voteDiff} vote${voteDiff === 1 ? '' : 's'}!`,
                        cta: 'Share This Match!'
                    });
                }
                
                // TRIGGER 3: COMEBACK
                const previousState = getPreviousMatchState(matchId);
                if (previousState) {
                    const wasLosing = previousState.userPct < previousState.opponentPct;
                    const nowWinning = userPct > opponentPct;
                    
                    if (wasLosing && nowWinning && shouldShowNotification(matchId, 'comeback')) {
                        notifications.push({
                            priority: 3,
                            type: 'comeback',
                            matchId, song: userSong.shortTitle || userSong.title,
                            opponent: opponent.shortTitle || opponent.title,
                            userPct, opponentPct,
                            message: `🎉 "${userSong.shortTitle || userSong.title}" completed comeback!`,
                            detail: `Was losing, now leading ${userPct}% to ${opponentPct}%!`,
                            cta: 'Celebrate & Share!'
                        });
                    }
                }
                
                // TRIGGER 4: DOMINATING
                else if (userPct >= 60 && shouldShowNotification(matchId, 'winning')) {
                    notifications.push({
                        priority: 4,
                        type: 'winning',
                        matchId, song: userSong.shortTitle || userSong.title,
                        opponent: opponent.shortTitle || opponent.title,
                        userPct, opponentPct,
                        message: `🎯 "${userSong.shortTitle || userSong.title}" is dominating!`,
                        detail: `Leading ${userPct}% to ${opponentPct}%`,
                        cta: 'Share the Victory!'
                    });
                }
                
                saveMatchState(matchId, userPct, opponentPct);
            }
            
            // If found user bulletin, show it and STOP (saves Firebase reads!)
            if (notifications.length > 0) {
                notifications.sort((a, b) => a.priority - b.priority);
                const topNotification = notifications[0];
                showBulletin(topNotification);
                markNotificationShown(topNotification.matchId, topNotification.type);
                return;
            }
        }
        
        // ========================================
        // PRIORITY 2: General voting encouragement
        // Only check every 30 minutes
        // ========================================
        const lastGeneralCheck = localStorage.getItem('lastGeneralBulletinCheck');
        const timeSinceGeneral = lastGeneralCheck 
            ? Date.now() - parseInt(lastGeneralCheck)
            : 1800001;
        
        if (timeSinceGeneral < 1800000) { // 30 minutes
            hideBulletin();
            return;
        }
        
        // Fetch all live matches from edge
        const liveMatches = await getAllLiveMatches();
        
        if (liveMatches.length === 0) {
            hideBulletin();
            return;
        }
        
        for (const match of liveMatches) {
            const matchId = match.matchId;
            const totalVotes = match.totalVotes || 0;
            const song1Votes = match.song1.votes || 0;
            const song2Votes = match.song2.votes || 0;
            const voteDiff = Math.abs(song1Votes - song2Votes);
            
            if (userVotes[matchId]) continue;
            if (wasShownRecently(matchId, 'general')) continue;
            
            // CLOSE MATCH
            if (totalVotes >= 50 && voteDiff <= 5) {
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
            
            // NEW MATCH
            else if (isMatchNew(match)) {
                notifications.push({
                    priority: 3,
                    type: 'new-match',
                    matchId,
                    song1: match.song1.shortTitle || match.song1.title,
                    song2: match.song2.shortTitle || match.song2.title,
                    totalVotes,
                    message: `🆕 Fresh matchup: "${match.song1.shortTitle}" vs "${match.song2.shortTitle}"`,
                    detail: `Just started - be among the first voters!`,
                    cta: 'Vote First',
                    action: 'navigate',
                    targetUrl: `/vote.html?match=${matchId}`
                });
            }
            
            // LOW TURNOUT
            else if (isLowTurnout(match)) {
                notifications.push({
                    priority: 4,
                    type: 'low-turnout',
                    matchId,
                    song1: match.song1.shortTitle || match.song1.title,
                    song2: match.song2.shortTitle || match.song2.title,
                    totalVotes,
                    message: `📊 "${match.song1.shortTitle}" vs "${match.song2.shortTitle}" needs votes`,
                    detail: `Only ${totalVotes} votes so far!`,
                    cta: 'Help Decide',
                    action: 'navigate',
                    targetUrl: `/vote.html?match=${matchId}`
                });
            }
        }
        
        // WELCOME (first-time visitor)
        if (Object.keys(userVotes).length === 0 && !wasShownRecently('welcome', 'general')) {
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
        
        // RETURN VOTER (hasn't voted in 24h)
        else if (isReturnVoter(userVotes) && !wasShownRecently('return', 'general')) {
            const votedCount = Object.keys(userVotes).length;
            const newMatchCount = liveMatches.filter(m => !userVotes[m.matchId]).length;
            
            if (newMatchCount > 0) {
                notifications.push({
                    priority: 4,
                    type: 'return-voter',
                    message: '👋 Welcome back!',
                    detail: `You've voted in ${votedCount} matches - ${newMatchCount} new available!`,
                    cta: 'Continue Voting',
                    action: 'navigate',
                    targetUrl: '/matches.html'
                });
            }
        }
        
        // Show highest priority
        if (notifications.length > 0) {
            notifications.sort((a, b) => a.priority - b.priority);
            const topNotification = notifications[0];
            showBulletin(topNotification);
            markGeneralNotificationShown(topNotification.matchId || topNotification.type);
        } else {
            hideBulletin();
        }
        
        localStorage.setItem('lastGeneralBulletinCheck', Date.now().toString());
        
    } catch (error) {
        console.error('❌ Error checking bulletin:', error);
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
    
    return hoursSinceStart >= 2 && totalVotes < 30;
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
        banner.innerHTML = `
            <div class="bulletin-content">
                <button class="bulletin-close" onclick="window.dismissBulletin()">×</button>
                <div class="bulletin-icon" id="bulletin-icon"></div>
                <div class="bulletin-text">
                    <div class="bulletin-message" id="bulletin-message"></div>
                    <div class="bulletin-detail" id="bulletin-detail"></div>
                </div>
                <button class="bulletin-cta" id="bulletin-cta" onclick="window.handleBulletinCTA()"></button>
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
                    padding: 1rem;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    transform: translateY(-100%);
                    transition: transform 0.3s ease;
                }
                
                .bulletin-banner.show { transform: translateY(0); }
                
                .bulletin-banner.danger { background: linear-gradient(135deg, #ff4444, #cc0000); }
                .bulletin-banner.nailbiter { background: linear-gradient(135deg, #ff8800, #cc6600); }
                .bulletin-banner.winning { background: linear-gradient(135deg, #00cc88, #009966); }
.bulletin-banner.comeback { background: linear-gradient(135deg, #8844ff, #6622cc); }
                .bulletin-banner.close-match { background: linear-gradient(135deg, #ff8800, #cc6600); }
                .bulletin-banner.new-match { background: linear-gradient(135deg, #00aaff, #0088cc); }
                .bulletin-banner.low-turnout { background: linear-gradient(135deg, #6666ff, #4444cc); }
                .bulletin-banner.welcome { background: linear-gradient(135deg, #C8AA6E, #A0885E); }
                .bulletin-banner.return-voter { background: linear-gradient(135deg, #9966ff, #7744cc); }
                
                .bulletin-content {
                    max-width: 1200px;
                    margin: 0 auto;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    color: white;
                }
                
                .bulletin-icon {
                    font-size: 2rem;
                    animation: pulse 1.5s ease infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
                
                .bulletin-text { flex: 1; }
                
                .bulletin-message {
                    font-size: 1.1rem;
                    font-weight: 600;
                    margin-bottom: 0.25rem;
                }
                
                .bulletin-detail {
                    font-size: 0.9rem;
                    opacity: 0.9;
                }
                
                .bulletin-cta {
                    background: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    white-space: nowrap;
                }
                
                .bulletin-banner.danger .bulletin-cta { color: #ff4444; }
                .bulletin-banner.nailbiter .bulletin-cta { color: #ff8800; }
                .bulletin-banner.winning .bulletin-cta { color: #00cc88; }
                .bulletin-banner.comeback .bulletin-cta { color: #8844ff; }
                .bulletin-banner.close-match .bulletin-cta { color: #ff8800; }
                .bulletin-banner.new-match .bulletin-cta { color: #00aaff; }
                .bulletin-banner.low-turnout .bulletin-cta { color: #6666ff; }
                .bulletin-banner.welcome .bulletin-cta { color: #C8AA6E; }
                .bulletin-banner.return-voter .bulletin-cta { color: #9966ff; }
                
                .bulletin-cta:hover {
                    transform: scale(1.05);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                }
                
                .bulletin-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 1.5rem;
                    cursor: pointer;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }
                
                .bulletin-close:hover { opacity: 1; }
                
                @media (max-width: 768px) {
                    .bulletin-banner { top: 60px; }
                    
                    .bulletin-content {
                        flex-wrap: wrap;
                        gap: 0.5rem;
                    }
                    
                    .bulletin-icon { font-size: 1.5rem; }
                    
                    .bulletin-message { font-size: 1rem; }
                    
                    .bulletin-detail { font-size: 0.85rem; }
                    
                    .bulletin-cta {
                        width: 100%;
                        margin-top: 0.5rem;
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
        banner.classList.remove('show');
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

export { enableGlobalNotifications, checkGlobalNotificationStatus, checkAndShowBulletin };