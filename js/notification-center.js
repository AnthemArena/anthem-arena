console.log('🔔 notification-center.js loaded');

import { 
    
    getUnreadNotifications, 
    getUnreadCount, 
    markNotificationRead, 
    dismissNotification 
} from './notification-storage.js';
import { sendMessage } from './message-system.js';


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
            
           // ✅ HANDLE MESSAGE REPLY
            if (action === 'open-message') {
                const userId = localStorage.getItem('tournamentUserId');
                const notifications = await getUnreadNotifications(userId);
                const notification = notifications.find(n => n.id === id);
                
                if (notification && notification.ctaData) {
                    // Show message composer
                    await markNotificationRead(id);
                    await updateBadgeCount();
                    
                    showMessageComposer(
                        notification.ctaData.fromUserId,
                        notification.ctaData.fromUsername,
                        {
                            matchId: notification.matchId,
                            matchTitle: notification.matchTitle,
                            replyTo: notification.ctaData.originalMessage,
                            notificationId: id
                        }
                    );
                    
                    return; // Don't navigate
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
// ========================================
// MESSAGE COMPOSER
// ========================================

function showMessageComposer(toUserId, toUsername, context = {}) {
    // Remove existing composer if any
    const existing = document.getElementById('messageComposer');
    if (existing) existing.remove();
    
    // Create composer overlay
    const composer = document.createElement('div');
    composer.id = 'messageComposer';
    composer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(5px);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
    `;
    
    composer.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 2px solid rgba(200, 170, 110, 0.3);
            border-radius: 12px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            animation: slideUp 0.3s ease;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #C8AA6E; font-size: 1.2rem;">
                    💬 Message ${toUsername}
                </h3>
                <button id="closeComposer" style="
                    background: none;
                    border: none;
                    color: #888;
                    font-size: 1.5rem;
                    cursor: pointer;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">×</button>
            </div>
            
            ${context.replyTo ? `
                <div style="
                    background: rgba(200, 170, 110, 0.1);
                    border-left: 3px solid #C8AA6E;
                    padding: 12px;
                    margin-bottom: 16px;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    color: #aaa;
                ">
                    <div style="color: #C8AA6E; font-weight: 600; margin-bottom: 4px;">
                        Replying to:
                    </div>
                    "${context.replyTo}"
                </div>
            ` : ''}
            
            ${context.matchTitle ? `
                <div style="
                    background: rgba(200, 170, 110, 0.05);
                    padding: 8px 12px;
                    margin-bottom: 16px;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    color: #888;
                ">
                    📍 About: ${context.matchTitle}
                </div>
            ` : ''}
            
            <textarea id="messageInput" 
                placeholder="Type your message... (max 300 characters)"
                maxlength="300"
                style="
                    width: 100%;
                    height: 120px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px solid rgba(200, 170, 110, 0.3);
                    border-radius: 8px;
                    padding: 12px;
                    color: #fff;
                    font-family: inherit;
                    font-size: 1rem;
                    resize: vertical;
                    margin-bottom: 12px;
                "
            ></textarea>
            
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span id="charCount" style="color: #888; font-size: 0.85rem;">0/300</span>
                <div style="display: flex; gap: 8px;">
                    <button id="cancelMessage" style="
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        color: #fff;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                    ">Cancel</button>
                    <button id="sendMessage" style="
                        background: linear-gradient(135deg, #C8AA6E, #B89A5E);
                        border: none;
                        color: #1a1a2e;
                        padding: 10px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 700;
                        box-shadow: 0 4px 12px rgba(200, 170, 110, 0.3);
                    ">Send 💬</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(composer);
    
    // Get elements
    const input = document.getElementById('messageInput');
    const charCount = document.getElementById('charCount');
    const sendBtn = document.getElementById('sendMessage');
    const cancelBtn = document.getElementById('cancelMessage');
    const closeBtn = document.getElementById('closeComposer');
    
    // Focus input
    input.focus();
    
    // Character counter
    input.addEventListener('input', () => {
        const length = input.value.length;
        charCount.textContent = `${length}/300`;
        charCount.style.color = length > 280 ? '#e74c3c' : '#888';
    });
    
    // Close handlers
    const closeComposer = () => {
        composer.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => composer.remove(), 200);
    };
    
    closeBtn.addEventListener('click', closeComposer);
    cancelBtn.addEventListener('click', closeComposer);
    composer.addEventListener('click', (e) => {
        if (e.target === composer) closeComposer();
    });
    
    // Send message
    sendBtn.addEventListener('click', async () => {
        const message = input.value.trim();
        
        if (!message) {
            input.style.borderColor = '#e74c3c';
            setTimeout(() => {
                input.style.borderColor = 'rgba(200, 170, 110, 0.3)';
            }, 1000);
            return;
        }
        
        // Show loading state
        sendBtn.textContent = 'Sending...';
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.6';
        
        // Send message
        const success = await sendMessage(toUserId, toUsername, message, context);
        
        if (success) {
            // Success feedback
            sendBtn.textContent = '✓ Sent!';
            sendBtn.style.background = 'linear-gradient(135deg, #27ae60, #229954)';
            
            // Close after 1 second
            setTimeout(() => {
                closeComposer();
                
                // Show success toast
                showQuickToast(`✅ Message sent to ${toUsername}!`, 2000);
            }, 1000);
            
        } else {
            // Error feedback
            sendBtn.textContent = '✗ Failed';
            sendBtn.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
            
            setTimeout(() => {
                sendBtn.textContent = 'Send 💬';
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
                sendBtn.style.background = 'linear-gradient(135deg, #C8AA6E, #B89A5E)';
            }, 2000);
        }
    });
    
    // Send on Enter (Shift+Enter for new line)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });
}

// Helper function for quick toasts
function showQuickToast(message, duration = 2000) {
    const existing = document.getElementById('quickToast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'quickToast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #C8AA6E, #B89A5E);
        color: #1a1a2e;
        padding: 12px 20px;
        border-radius: 8px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10002;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
    
    @keyframes slideUp {
        from { 
            opacity: 0;
            transform: translateY(20px);
        }
        to { 
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes slideInRight {
        from { 
            opacity: 0;
            transform: translateX(100px);
        }
        to { 
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideOutRight {
        from { 
            opacity: 1;
            transform: translateX(0);
        }
        to { 
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);