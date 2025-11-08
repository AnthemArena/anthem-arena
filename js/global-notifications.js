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
    console.log(`📊 Polling rate: ${interval / 1000}s (${isActive ? 'active' : 'inactive'})`);
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
// FIRESTORE DATA FETCHING
// ========================================

async function getMatchData(matchId) {
    try {
        const matchRef = doc(db, 'matches', matchId);
        const matchSnap = await getDoc(matchRef);
        
        if (matchSnap.exists()) {
            return { id: matchId, ...matchSnap.data() };
        }
        return null;
    } catch (error) {
        console.error(`Error fetching match ${matchId}:`, error);
        return null;
    }
}

async function getAllLiveMatches() {
    try {
        // This would need to be implemented based on your Firestore structure
        // For now, returning empty array
        return [];
    } catch (error) {
        console.error('Error fetching live matches:', error);
        return [];
    }
}

// ========================================
// BULLETIN DETECTION LOGIC
// ========================================

async function checkAndShowBulletin() {
    try {
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        
        if (Object.keys(userVotes).length === 0) {
            console.log('📭 No user votes to check');
            return;
        }
        
        const notifications = [];
        
        // PRIORITY 1: Check user's picks for danger/nailbiter/comeback/winning
        for (const [matchId, vote] of Object.entries(userVotes)) {
            const match = await getMatchData(matchId);
            
            if (!match || match.status !== 'live') continue;
            
            const userSongId = vote.songId;
            const userSong = match.song1?.id === userSongId ? match.song1 : match.song2;
            const opponent = match.song1?.id === userSongId ? match.song2 : match.song1;
            
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
                    song: userSong.shortTitle || userSong.title,
                    opponent: opponent.shortTitle || opponent.title,
                    thumbnailUrl: getThumbnailUrl(userSong.youtubeUrl),
                    userPct,
                    opponentPct,
                    voteDiff,
                    message: `🚨 Your pick "${userSong.shortTitle || userSong.title}" is in danger!`,
                    detail: `Behind by ${voteDiff} votes (${userPct}% vs ${opponentPct}%)`,
                    cta: 'View Match Now!'
                });
            }
            // COMEBACK: Was losing, now winning
            else if (wasLosing && !isCurrentlyLosing && voteDiff >= BULLETIN_THRESHOLDS.COMEBACK_MIN) {
                notifications.push({
                    priority: 2,
                    type: 'comeback',
                    matchId: match.id,
                    song: userSong.shortTitle || userSong.title,
                    opponent: opponent.shortTitle || opponent.title,
                    thumbnailUrl: getThumbnailUrl(userSong.youtubeUrl),
                    userPct,
                    opponentPct,
                    message: `🎉 Your pick "${userSong.shortTitle || userSong.title}" completed comeback!`,
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
                    song: userSong.shortTitle || userSong.title,
                    opponent: opponent.shortTitle || opponent.title,
                    thumbnailUrl: getThumbnailUrl(userSong.youtubeUrl),
                    voteDiff,
                    userPct,
                    opponentPct,
                    message: `🔥 Your pick "${userSong.shortTitle || userSong.title}" is TOO CLOSE!`,
                    detail: `Separated by just ${voteDiff} vote${voteDiff === 1 ? '' : 's'}!`,
                    cta: 'View Match!'
                });
            }
            // WINNING: User's pick is dominating
            else if (userPct >= BULLETIN_THRESHOLDS.WINNING && totalVotes > 20) {
                notifications.push({
                    priority: 4,
                    type: 'winning',
                    matchId: match.id,
                    song: userSong.shortTitle || userSong.title,
                    opponent: opponent.shortTitle || opponent.title,
                    thumbnailUrl: getThumbnailUrl(userSong.youtubeUrl),
                    userPct,
                    opponentPct,
                    message: `🎯 Your pick "${userSong.shortTitle || userSong.title}" is dominating!`,
                    detail: `Leading ${userPct}% to ${opponentPct}%`,
                    cta: 'View Match!'
                });
            }
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
        nailbiter: '🔥',
        winning: '🎯',
        comeback: '🎉',
        'close-match': '🔥',
        'new-match': '🆕',
        'low-turnout': '📊',
        welcome: '🎵',
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
        dismissedBulletins.add(bulletinKey);
        
        // Store dismissed bulletins in localStorage
        const dismissed = Array.from(dismissedBulletins);
        localStorage.setItem('dismissedBulletins', JSON.stringify(dismissed));
        
        console.log(`🚫 Bulletin dismissed: ${bulletinKey}`);
    }
    hideBulletin();
    currentBulletin = null;
};

window.handleBulletinCTA = function() {
    if (!currentBulletin) return;
    
    // Handle user's pick bulletins - go directly to match
    if (['danger', 'nailbiter', 'comeback', 'winning'].includes(currentBulletin.type)) {
        if (currentBulletin.matchId && currentBulletin.matchId !== 'test-match') {
            window.location.href = `/vote.html?match=${currentBulletin.matchId}`;
        } else {
            showNotificationToast('Match not available', 'error');
        }
    }
    // Handle general voting encouragement
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
    
    // Load dismissed bulletins from storage
    try {
        const dismissed = JSON.parse(localStorage.getItem('dismissedBulletins') || '[]');
        dismissedBulletins = new Set(dismissed);
    } catch (e) {
        console.error('Error loading dismissed bulletins:', e);
    }
    
    // Clear old dismissed bulletins (older than 24 hours)
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Start polling
    checkAndShowBulletin();
    adjustPollingRate();
    
    console.log('✅ Bulletin system initialized');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBulletinSystem);
} else {
    initBulletinSystem();
}

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
        }
    };
    
    const notification = testNotifications[type] || testNotifications.winning;
    showBulletin(notification);
};

console.log('✅ global-notifications.js fully loaded with toast-style bulletins');