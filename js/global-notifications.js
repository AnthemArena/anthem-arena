console.log('🔔 global-notifications.js loaded');
window.testNotifications = function() {
    alert('Notifications script is working!');
};

// ========================================
// GLOBAL NOTIFICATION SYSTEM
// Notifies users when ANY match goes live
// ========================================

import { db } from './firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';
const CHECK_INTERVAL = 60000; // Check every 1 minute

// ========================================
// ENABLE GLOBAL NOTIFICATIONS
// ========================================

// ========================================
// ENABLE/DISABLE GLOBAL NOTIFICATIONS
// ========================================

async function enableGlobalNotifications() {
    const button = document.getElementById('enable-notifications');
    const statusText = button?.querySelector('.notification-status');
    
    if (!button || !statusText) return;
    
    // Check if browser supports notifications
    if (!("Notification" in window)) {
        showNotificationToast('Your browser doesn\'t support notifications', 'error');
        return;
    }
    
    // Check if already enabled - TOGGLE OFF
    const isEnabled = localStorage.getItem('globalNotificationsEnabled') === 'true';
    
    if (isEnabled) {
        // DISABLE notifications
        localStorage.removeItem('globalNotificationsEnabled');
        stopNotificationService();
        
        updateGlobalNotificationButton('disabled');
        showNotificationToast('Notifications disabled', 'info');
        
        console.log('🔕 Global notifications disabled');
        return;
    }
    
    // Check current permission
    if (Notification.permission === "denied") {
        showNotificationToast('Notifications are blocked. Please enable them in browser settings.', 'error');
        return;
    }
    
    // Request permission if needed
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
            console.error('Error requesting notification permission:', error);
            showNotificationToast('Error enabling notifications', 'error');
            button.disabled = false;
            statusText.textContent = 'Enable Notifications';
            return;
        }
    }
    
    // ENABLE notifications
    localStorage.setItem('globalNotificationsEnabled', 'true');
    localStorage.setItem('lastNotificationCheck', Date.now().toString());
    
    // Show test notification
    new Notification("🎉 Notifications Enabled!", {
        body: "You'll be notified when any match goes live. Click here to disable anytime.",
        icon: "/favicon/favicon-32x32.png",
        badge: "/favicon/favicon-32x32.png",
        tag: 'global-notifications-enabled'
    });
    
    showNotificationToast('Notifications enabled! Click button again to disable.', 'success');
    updateGlobalNotificationButton('enabled');
    
    // Start checking for live matches
    startNotificationService();
    
    console.log('✅ Global notifications enabled');
}

// ========================================
// UPDATE BUTTON STATE
// ========================================

// ========================================
// UPDATE BUTTON STATE
// ========================================

function updateGlobalNotificationButton(state) {
    const button = document.getElementById('enable-notifications');
    const statusText = button?.querySelector('.notification-status');
    
    if (!button || !statusText) return;
    
    if (state === 'enabled') {
        button.classList.add('notifications-enabled');
        button.classList.remove('notifications-disabled');
        button.disabled = false;
        statusText.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Notifications On
        `;
        button.title = 'Click to disable notifications';
    } else if (state === 'disabled') {
        button.classList.remove('notifications-enabled');
        button.classList.add('notifications-disabled');
        button.disabled = false;
        statusText.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
            Enable Notifications
        `;
        button.title = 'Click to enable notifications';
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
        // Was enabled but permission was revoked
        localStorage.removeItem('globalNotificationsEnabled');
        updateGlobalNotificationButton('disabled');
    } else {
        updateGlobalNotificationButton('disabled');
    }
}

// ========================================
// NOTIFICATION SERVICE
// ========================================

let notificationInterval = null;

function startNotificationService() {
    // Don't start if already running
    if (notificationInterval) return;
    
    console.log('🔔 Starting global notification service...');
    
    // Check immediately
    checkForLiveMatches();
    
    // Then check every minute
    notificationInterval = setInterval(checkForLiveMatches, CHECK_INTERVAL);
}

function stopNotificationService() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
        console.log('🔕 Stopped global notification service');
    }
}

// ========================================
// CHECK FOR LIVE MATCHES
// ========================================

async function checkForLiveMatches() {
    // Only check if notifications are enabled
    if (localStorage.getItem('globalNotificationsEnabled') !== 'true') {
        stopNotificationService();
        return;
    }
    
    if (Notification.permission !== "granted") {
        stopNotificationService();
        return;
    }
    
    try {
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const liveQuery = query(matchesRef, where('status', '==', 'live'));
        const snapshot = await getDocs(liveQuery);
        
        snapshot.forEach(doc => {
            const match = doc.data();
            const matchId = match.matchId;
            const notifiedKey = `notified_${matchId}`;
            
            // Check if we've already notified for this match
            if (!localStorage.getItem(notifiedKey)) {
                sendMatchNotification(match);
                localStorage.setItem(notifiedKey, 'true');
            }
        });
        
        // Update last check time
        localStorage.setItem('lastNotificationCheck', Date.now().toString());
        
    } catch (error) {
        console.error('❌ Error checking for live matches:', error);
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
    
    // Handle click - redirect to vote page
    notification.onclick = function() {
        window.focus();
        window.location.href = `/vote.html?match=${match.matchId}`;
        notification.close();
    };
    
    console.log(`🔔 Notification sent for match: ${song1} vs ${song2}`);
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
// EXPORT FUNCTIONS
// ========================================

window.enableGlobalNotifications = enableGlobalNotifications;
window.checkGlobalNotificationStatus = checkGlobalNotificationStatus;

export { enableGlobalNotifications, checkGlobalNotificationStatus };