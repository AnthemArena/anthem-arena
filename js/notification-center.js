console.log('🔔 notification-center.js loaded');

import { 
    getUnreadNotifications, 
    getUnreadCount, 
    markNotificationRead, 
    dismissNotification 
} from './notification-storage.js';

export async function initNotificationCenter() {
    const bell = document.getElementById('notificationBell');
    const badge = document.getElementById('notificationBadge');
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    const closeBtn = document.getElementById('closeNotificationPanel');
    
    if (!bell || !panel) {
        console.log('⚠️ Notification center elements not found');
        return;
    }
    
    await updateBadgeCount();
    
    bell.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isOpen = panel.style.display === 'block';
        
        if (isOpen) {
            closePanel();
        } else {
            await openPanel();
        }
    });
    
    closeBtn?.addEventListener('click', closePanel);
    overlay?.addEventListener('click', closePanel);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.style.display === 'block') {
            closePanel();
        }
    });
    
    setInterval(updateBadgeCount, 120000);
    
    console.log('✅ Notification center initialized');
}

async function updateBadgeCount() {
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId || userId === 'anonymous') return;
    
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    
    const count = await getUnreadCount(userId);
    
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

async function openPanel() {
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    
    panel.style.display = 'block';
    overlay.style.display = 'block';
    
    await loadNotifications();
}

function closePanel() {
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    
    panel.style.display = 'none';
    overlay.style.display = 'none';
}

async function loadNotifications() {
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId || userId === 'anonymous') return;
    
    const content = document.getElementById('notificationPanelContent');
    if (!content) return;
    
    content.innerHTML = '<div class="notification-empty"><p>Loading...</p></div>';
    
    const notifications = await getUnreadNotifications(userId);
    
    if (notifications.length === 0) {
        content.innerHTML = `
            <div class="notification-empty">
                <span style="font-size: 48px; opacity: 0.3;">🔔</span>
                <p>No new notifications</p>
            </div>
        `;
        return;
    }
    
    content.innerHTML = notifications.map(notification => {
        return renderNotificationItem(notification);
    }).join('');
    
    attachNotificationListeners();
}

function renderNotificationItem(notification) {
    const timeAgo = getTimeAgo(notification.timestamp);
    const unreadClass = !notification.read && !notification.dismissed ? 'unread' : '';
    
    // ✅ Determine what image to show
    let imageHtml = '';
    
    if (notification.thumbnailUrl) {
        // Song thumbnail with icon overlay
        imageHtml = `
            <div style="position: relative; width: 40px; height: 40px; flex-shrink: 0; margin-right: 8px;">
                <img src="${notification.thumbnailUrl}" 
                     style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid rgba(200, 155, 60, 0.3);">
                <div style="position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; background: linear-gradient(135deg, #C8AA6E, #B89A5E); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; border: 2px solid #1a1a2e;">
                    ${notification.icon}
                </div>
            </div>
        `;
    } else if (notification.triggerUsername) {
        // User avatar with first letter
        const initial = notification.triggerUsername.charAt(0).toUpperCase();
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
        const colorIndex = notification.triggerUsername.charCodeAt(0) % colors.length;
        const bgColor = colors[colorIndex];
        
        imageHtml = `
            <div style="position: relative; width: 40px; height: 40px; flex-shrink: 0; margin-right: 8px;">
                <div style="width: 100%; height: 100%; border-radius: 50%; background: ${bgColor}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 700; color: white; border: 2px solid rgba(200, 155, 60, 0.3);">
                    ${initial}
                </div>
                <div style="position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; background: linear-gradient(135deg, #C8AA6E, #B89A5E); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; border: 2px solid #1a1a2e;">
                    ${notification.icon}
                </div>
            </div>
        `;
    } else {
        // Fallback to just icon
        imageHtml = `<span class="notification-item-icon" style="font-size: 20px; margin-right: 8px;">${notification.icon}</span>`;
    }
    
    return `
        <div class="notification-item ${unreadClass}" data-id="${notification.id}">
            <div class="notification-item-header" style="display: flex; align-items: center;">
                ${imageHtml}
                <div style="flex: 1; min-width: 0;">
                    <div class="notification-item-message">${notification.message}</div>
                </div>
                <button class="notification-item-dismiss" data-id="${notification.id}">✕</button>
            </div>
            ${notification.detail ? `<div class="notification-item-detail">${notification.detail}</div>` : ''}
            <div class="notification-item-footer">
                <span class="notification-item-time">${timeAgo}</span>
                <button class="notification-item-cta" 
                        data-id="${notification.id}"
                        data-action="${notification.ctaAction}"
                        data-url="${notification.targetUrl || ''}">
                    ${notification.ctaText}
                </button>
            </div>
        </div>
    `;
}

function attachNotificationListeners() {
    document.querySelectorAll('.notification-item-cta').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const action = btn.dataset.action;
            const url = btn.dataset.url;
            
            // ✅ HANDLE EMOTE ACTIONS
            if (action === 'send-emote') {
                const userId = localStorage.getItem('tournamentUserId');
                const notifications = await getUnreadNotifications(userId);
                const notification = notifications.find(n => n.id === id);
                
                if (notification && notification.ctaData) {
                    // Show loading state
                    const originalText = btn.textContent;
                    btn.textContent = 'Sending...';
                    btn.disabled = true;
                    btn.style.opacity = '0.6';
                    
                    // Send the emote
                    const { sendEmoteReaction } = await import('./emote-system.js');
                    const success = await sendEmoteReaction(
                        notification.ctaData.targetUsername,
                        notification.ctaData.targetUserId,
                        notification.ctaData.emoteType,
                        notification.ctaData.matchData || {
                            matchId: notification.matchId,
                            matchTitle: notification.matchTitle,
                            songTitle: notification.detail
                        }
                    );
                    
                    if (success) {
                        // Success - mark as read and dismiss
                        btn.textContent = '✓ Sent!';
                        btn.style.background = '#27ae60';
                        btn.style.opacity = '1';
                        
                        await markNotificationRead(id);
                        await dismissNotification(id);
                        
                        // Remove from UI
                        setTimeout(() => {
                            const item = btn.closest('.notification-item');
                            if (item) {
                                item.style.opacity = '0';
                                item.style.transform = 'translateX(20px)';
                                item.style.transition = 'all 0.3s ease';
                                setTimeout(() => {
                                    item.remove();
                                    checkIfEmpty();
                                }, 300);
                            }
                        }, 800);
                        
                        await updateBadgeCount();
                    } else {
                        // Failed
                        btn.textContent = '✗ Failed';
                        btn.style.background = '#e74c3c';
                        btn.style.opacity = '1';
                        
                        setTimeout(() => {
                            btn.textContent = originalText;
                            btn.disabled = false;
                            btn.style.background = '';
                        }, 2000);
                    }
                    
                    return; // Don't continue to navigate
                }
            }
            
            // ✅ HANDLE NAVIGATION
            await markNotificationRead(id);
            await updateBadgeCount();
            
            if (action === 'navigate' && url) {
                window.location.href = url;
            }
        });
    });
    
    document.querySelectorAll('.notification-item-dismiss').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            
            await dismissNotification(id);
            
            const item = btn.closest('.notification-item');
            item.style.opacity = '0';
            item.style.transform = 'translateX(20px)';
            item.style.transition = 'all 0.3s ease';
            
            setTimeout(() => {
                item.remove();
                checkIfEmpty();
            }, 300);
            
            await updateBadgeCount();
        });
    });
    
    document.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', async () => {
            const id = item.dataset.id;
            await markNotificationRead(id);
            item.classList.remove('unread');
            await updateBadgeCount();
        });
    });
}

function checkIfEmpty() {
    const content = document.getElementById('notificationPanelContent');
    if (!content) return;
    
    const items = content.querySelectorAll('.notification-item');
    if (items.length === 0) {
        content.innerHTML = `
            <div class="notification-empty">
                <span style="font-size: 48px; opacity: 0.3;">🔔</span>
                <p>No new notifications</p>
            </div>
        `;
    }
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return 'Over a week ago';
}