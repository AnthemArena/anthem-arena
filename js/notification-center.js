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

// ========================================
// TAB SYSTEM FOR NOTIFICATION CENTER
// ========================================

let currentTab = 'all';

export async function initNotificationCenterWithTabs() {
    const bell = document.getElementById('notificationBell');
    const badge = document.getElementById('notificationBadge');
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    const closeBtn = document.getElementById('closeNotificationPanel');
    
    if (!bell || !panel) {
        console.log('⚠️ Notification center elements not found');
        return;
    }
    
    // Add tabs to panel header
    addTabsToPanel(panel);
    
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
    
    // Make globally accessible
    window.openNotificationPanel = openPanel;
    window.closeNotificationPanel = closePanel;
    
    console.log('✅ Notification center with tabs initialized');
}

function addTabsToPanel(panel) {
    // Find the panel header
    const header = panel.querySelector('.notification-panel-header');
    if (!header) return;
    
    // Add tabs container
    const tabsHTML = `
        <div class="notification-tabs" style="
            display: flex;
            gap: 8px;
            margin-top: 12px;
            border-bottom: 2px solid rgba(200, 170, 110, 0.2);
        ">
            <button class="notif-tab active" data-tab="all">
                <i class="fa-solid fa-bell"></i> All
            </button>
            <button class="notif-tab" data-tab="votes">
                <i class="fa-solid fa-chart-line"></i> Votes
            </button>
            <button class="notif-tab" data-tab="achievements">
                <i class="fa-solid fa-trophy"></i> Achievements
            </button>
            <button class="notif-tab" data-tab="messages">
                <i class="fa-solid fa-envelope"></i> Messages
                <span class="tab-badge" id="messageTabBadge" style="display: none;"></span>
            </button>
        </div>
    `;
    
    header.insertAdjacentHTML('beforeend', tabsHTML);
    
    // Add tab styles
    const style = document.createElement('style');
    style.textContent = `
        .notif-tab {
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.6);
            padding: 8px 16px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 600;
            transition: all 0.2s ease;
            border-bottom: 2px solid transparent;
            display: flex;
            align-items: center;
            gap: 6px;
            position: relative;
        }
        
        .notif-tab:hover {
            color: rgba(255, 255, 255, 0.9);
            background: rgba(200, 170, 110, 0.1);
        }
        
        .notif-tab.active {
            color: #C8AA6E;
            border-bottom-color: #C8AA6E;
        }
        
        .tab-badge {
            background: #e74c3c;
            color: white;
            font-size: 0.7rem;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 10px;
            min-width: 18px;
            text-align: center;
        }
    `;
    document.head.appendChild(style);
    
    // Add tab click handlers
    setupTabListeners();
}

function setupTabListeners() {
    document.querySelectorAll('.notif-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            // Update active state
            document.querySelectorAll('.notif-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Load content for this tab
            currentTab = tab.dataset.tab;
            await loadNotificationsByTab(currentTab);
        });
    });
}

async function loadNotificationsByTab(tab) {
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId || userId === 'anonymous') return;
    
    const content = document.getElementById('notificationPanelContent');
    if (!content) return;
    
    content.innerHTML = '<div class="notification-empty"><p>Loading...</p></div>';
    
    if (tab === 'messages') {
        await loadMessagesTab(content, userId);
    } else {
        await loadNotificationsTab(content, userId, tab);
    }
}

async function loadMessagesTab(content, userId) {
    const { getRecentConversations } = await import('./message-system.js');
    const conversations = await getRecentConversations(20);
    
    if (conversations.length === 0) {
        content.innerHTML = `
            <div class="notification-empty">
                <span style="font-size: 48px; opacity: 0.3;">💬</span>
                <p>No messages yet</p>
                <p style="font-size: 0.85rem; color: #888; margin-top: 8px;">
                    Messages from other users will appear here
                </p>
            </div>
        `;
        return;
    }
    
    content.innerHTML = conversations.map(conv => `
        <div class="notification-item message-item ${conv.unreadCount > 0 ? 'unread' : ''}" 
             data-user-id="${conv.userId}"
             onclick="openConversationModal('${conv.userId}', '${conv.username}')"
             style="cursor: pointer;">
            <div class="notification-item-header" style="display: flex; align-items: center;">
                <div style="
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                    font-weight: 700;
                    color: white;
                    margin-right: 12px;
                    flex-shrink: 0;
                ">
                    ${conv.username.charAt(0).toUpperCase()}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div class="notification-item-message" style="font-weight: 600; color: #C8AA6E;">
                        ${conv.username}
                    </div>
                    <div class="notification-item-detail" style="
                        color: rgba(255, 255, 255, 0.7);
                        font-size: 0.85rem;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">
                        ${conv.lastMessage}
                    </div>
                </div>
                ${conv.unreadCount > 0 ? `
                    <span class="unread-badge" style="
                        background: #e74c3c;
                        color: white;
                        font-size: 0.75rem;
                        font-weight: 700;
                        padding: 4px 8px;
                        border-radius: 12px;
                        margin-left: 8px;
                    ">${conv.unreadCount}</span>
                ` : ''}
            </div>
            <div class="notification-item-footer">
                <span class="notification-item-time">${getTimeAgo(conv.lastMessageTime)}</span>
            </div>
        </div>
    `).join('');
}

async function loadNotificationsTab(content, userId, tab) {
    const notifications = await getUnreadNotifications(userId);
    
    // Filter by tab
    let filtered = notifications;
    if (tab === 'votes') {
        filtered = notifications.filter(n => 
            n.type === 'causal-event' || n.type === 'live-activity'
        );
    } else if (tab === 'achievements') {
        filtered = notifications.filter(n => n.type === 'achievement');
    }
    
    if (filtered.length === 0) {
        content.innerHTML = `
            <div class="notification-empty">
                <span style="font-size: 48px; opacity: 0.3;">🔔</span>
                <p>No ${tab === 'all' ? '' : tab} notifications</p>
            </div>
        `;
        return;
    }
    
    content.innerHTML = filtered.map(notification => {
        return renderNotificationItem(notification);
    }).join('');
    
    attachNotificationListeners();
    await updateCtaButtonsWithPrivacy();
}

// Global function for opening conversations
window.openConversationModal = function(userId, username) {
    showMessageComposer(userId, username, {});
};

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

    // ✅ Check privacy settings for action buttons
    await updateCtaButtonsWithPrivacy();
}

// ========================================
// RENDER CTA BUTTON (WITH PRIVACY CHECK PLACEHOLDER)
// ========================================

function renderCtaButton(notification) {
    // ✅ For actions that need privacy check
    if (notification.ctaAction === 'send-emote' || notification.ctaAction === 'open-message') {
        return `
            <button class="notification-item-cta" 
                    data-id="${notification.id}"
                    data-action="${notification.ctaAction}"
                    data-target-user="${notification.triggerUserId || ''}"
                    data-url="${notification.targetUrl || ''}">
                <span class="cta-loading" style="opacity: 0.6;">Checking...</span>
            </button>
        `;
    }
    
    // ✅ Standard navigation button
    return `
        <button class="notification-item-cta" 
                data-id="${notification.id}"
                data-action="${notification.ctaAction}"
                data-url="${notification.targetUrl || ''}">
            ${notification.ctaText}
        </button>
    `;
}

function renderNotificationItem(notification) {
    const timeAgo = getTimeAgo(notification.timestamp);
    const unreadClass = !notification.read && !notification.dismissed ? 'unread' : '';
    
    // Determine what image to show
    let imageHtml = '';
    
    if (notification.thumbnailUrl) {
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
        imageHtml = `<span class="notification-item-icon" style="font-size: 20px; margin-right: 8px;">${notification.icon}</span>`;
    }
    
    // Determine CTA button HTML
    let ctaHtml = '';
    if (notification.ctaAction === 'send-emote' || notification.ctaAction === 'open-message') {
        ctaHtml = `
            <button class="notification-item-cta" 
                    data-id="${notification.id}"
                    data-action="${notification.ctaAction}"
                    data-target-user="${notification.triggerUserId}"
                    data-url="${notification.targetUrl || ''}">
                <span class="cta-loading">Checking...</span>
            </button>
        `;
    } else {
        ctaHtml = `
            <button class="notification-item-cta" 
                    data-id="${notification.id}"
                    data-action="${notification.ctaAction}"
                    data-url="${notification.targetUrl || ''}">
                ${notification.ctaText}
            </button>
        `;
    }
    
    return `
        <div class="notification-item ${unreadClass}" data-id="${notification.id}">
            <div class="notification-item-header" style="display: flex; align-items: center;">
                ${imageHtml}
                <div style="flex: 1; min-width: 0;">
                    <div class="notification-item-message">${notification.message}</div>
                    
                    <!-- ADD THIS: Clickable username below message -->
                    ${notification.triggerUsername ? `
                        <a href="/profile?user=${notification.triggerUsername}" 
                           style="color: #C8AA6E; text-decoration: none; font-weight: 600; margin-top: 4px; display: inline-block; font-size: 0.85rem;"
                           onclick="event.stopPropagation();">
                            User ${notification.triggerUsername}
                        </a>
                    ` : ''}
                </div>
                <button class="notification-item-dismiss" data-id="${notification.id}">Dismiss</button>
            </div>
            
            ${notification.detail ? `<div class="notification-item-detail">${notification.detail}</div>` : ''}
            
            <div class="notification-item-footer">
                <span class="notification-item-time">${timeAgo}</span>
            ${renderCtaButton(notification)}
            </div>
        </div>
    `;
}

// ========================================
// UPDATE CTA BUTTONS BASED ON PRIVACY
// ========================================

async function updateCtaButtonsWithPrivacy() {
    const buttons = document.querySelectorAll('.notification-item-cta[data-target-user]');
    
    const { getAvailableActions } = await import('./notification-storage.js');
    
    for (const btn of buttons) {
        const targetUserId = btn.dataset.targetUser;
        const action = btn.dataset.action;
        const notifId = btn.dataset.id;
        
        if (!targetUserId) continue;
        
        try {
            const permissions = await getAvailableActions(targetUserId);
            
            // Get notification data for context
            const userId = localStorage.getItem('tournamentUserId');
            const notifications = await getUnreadNotifications(userId);
            const notification = notifications.find(n => n.id === notifId);
            
            if (action === 'send-emote') {
                if (permissions.canEmote) {
                    btn.innerHTML = notification?.ctaText || 'Send Emote';
                    btn.disabled = false;
                    btn.style.cursor = 'pointer';
                    btn.style.opacity = '1';
                } else {
                    btn.innerHTML = `<span style="opacity: 0.6; font-size: 0.85rem;">🔒 Emotes Disabled</span>`;
                    btn.disabled = true;
                    btn.title = permissions.emoteReason || 'Cannot send emote';
                    btn.style.cursor = 'not-allowed';
                    btn.style.opacity = '0.5';
                }
            } else if (action === 'open-message') {
                if (permissions.canMessage) {
                    btn.innerHTML = notification?.ctaText || 'Reply';
                    btn.disabled = false;
                    btn.style.cursor = 'pointer';
                    btn.style.opacity = '1';
                } else {
                    btn.innerHTML = `<span style="opacity: 0.6; font-size: 0.85rem;">🔒 Messages Disabled</span>`;
                    btn.disabled = true;
                    btn.title = permissions.messageReason || 'Cannot send message';
                    btn.style.cursor = 'not-allowed';
                    btn.style.opacity = '0.5';
                }
            }
        } catch (error) {
            console.warn('Could not check permissions for button', error);
            // On error, show button as enabled (fail open)
            btn.innerHTML = notification?.ctaText || 'Action';
            btn.disabled = false;
        }
    }
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
                  <a href="/profile?user=${toUsername}" 
                   style="color: #888; text-decoration: none; font-size: 0.85rem; border: 1px solid rgba(200, 170, 110, 0.3); padding: 4px 8px; border-radius: 4px; transition: all 0.2s;"
                   onmouseover="this.style.color='#C8AA6E'; this.style.borderColor='#C8AA6E';"
                   onmouseout="this.style.color='#888'; this.style.borderColor='rgba(200, 170, 110, 0.3)';">
                    👤 View Profile
                </a>
            </div>
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
        const result = await sendMessage(toUserId, toUsername, message, context);
        
        if (result.success) {
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
            
            // ✅ Show reason if available
            if (result.reason) {
                input.placeholder = result.reason;
                input.style.borderColor = '#e74c3c';
                showQuickToast(result.reason, 3000);
            } else {
                showQuickToast('⚠️ Could not send message', 2000);
            }
            
            setTimeout(() => {
                sendBtn.textContent = 'Send 💬';
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
                sendBtn.style.background = 'linear-gradient(135deg, #C8AA6E, #B89A5E)';
                input.style.borderColor = 'rgba(200, 170, 110, 0.3)';
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