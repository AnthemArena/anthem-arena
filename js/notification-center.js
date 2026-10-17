console.log('🔔 notification-center.js loaded');

import { 
    getUnreadNotifications, 
    getUnreadCount, 
    markNotificationRead, 
    dismissNotification 
} from './notification-storage.js';
import { sendMessage } from './message-system.js';

// ✅ GUARD: Prevent duplicate initialization
let isInitialized = false;
let isPanelOpen = false;
let currentTab = 'all';
let isAnimating = false; // ✅ ADD THIS


export async function initNotificationCenter() {
    // ✅ Exit if already initialized
    if (isInitialized) {
        console.log('⏭️ Notification center already initialized, skipping');
        return;
    }
    
    const bell = document.getElementById('notificationBell');
    const badge = document.getElementById('notificationBadge');
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    const closeBtn = document.getElementById('closeNotificationPanel');
    
    if (!bell || !panel) {
        console.error('❌ Notification center elements not found!');
        console.log('   Bell:', bell);
        console.log('   Panel:', panel);
        
        // ✅ Only retry once if never initialized
        if (!isInitialized) {
            console.log('   Trying again in 1 second...');
            setTimeout(() => {
                initNotificationCenter();
            }, 1000);
        }
        return;
    }
    
    console.log('✅ Initializing notification center...');
    
    // Update badge count
    await updateBadgeCount();
    
    // ✅ CRITICAL: Only clone if bell has a parent (not already removed)
    if (bell.parentNode) {
        const newBell = bell.cloneNode(true);
        bell.parentNode.replaceChild(newBell, bell);
    }
    
    // ✅ Get fresh reference to bell after replacement
    const freshBell = document.getElementById('notificationBell');
    
    // ✅ Attach single click handler
    freshBell.addEventListener('click', async (e) => {
        e.preventDefault();           // ✅ Prevent default
                e.stopPropagation();          // ✅ Stop bubbling
                        e.stopImmediatePropagation(); // ✅ Stop duplicate listeners

                          // ✅ Ignore rapid clicks
        if (isAnimating) {
            console.log('⏭️ Click ignored - animation in progress');
            return;
        }


        console.log('🔔 Bell clicked, current state:', isPanelOpen);

                isAnimating = true;


        
        if (isPanelOpen) {
            closePanel();
        } else {
            await openPanel();
        }
       // ✅ Reset after animation completes
        setTimeout(() => {
            isAnimating = false;
        }, 400); // Slightly longer than CSS transition
    });
    
    // Attach other listeners
    closeBtn?.addEventListener('click', closePanel);
    overlay?.addEventListener('click', closePanel);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isPanelOpen) {
            closePanel();
        }
    });
    
    // Add tabs to panel
    addTabsToPanel(panel);
    
    // Update badge count every 2 minutes
    setInterval(updateBadgeCount, 120000);
    
    // Expose functions globally
    window.openNotificationPanel = openPanel;
    window.closeNotificationPanel = closePanel;
    
    // ✅ Mark as initialized
    isInitialized = true;
    
    console.log('✅ Notification center initialized');
}

// ========================================
// TAB SYSTEM FOR NOTIFICATION CENTER
// ========================================

function addTabsToPanel(panel) {
    // Check if tabs already exist
    if (panel.querySelector('.notification-tabs')) {
        console.log('⏭️ Tabs already added');
        return;
    }
    
    const header = panel.querySelector('.notification-panel-header');
    if (!header) return;
    
    // ✅ ADD CLEAR OLD BUTTON TO HEADER (before tabs)
    const closeBtn = header.querySelector('.close-btn');
    if (closeBtn && !header.querySelector('.clear-old-btn')) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'clear-old-btn';
        clearBtn.textContent = 'Clear Old';
        clearBtn.onclick = dismissOldNotifications;
        clearBtn.style.cssText = `
            background: rgba(200, 170, 110, 0.15);
            border: 1px solid rgba(200, 170, 110, 0.3);
            color: #C8AA6E;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-right: 8px;
        `;
        clearBtn.onmouseover = () => clearBtn.style.background = 'rgba(200, 170, 110, 0.25)';
        clearBtn.onmouseout = () => clearBtn.style.background = 'rgba(200, 170, 110, 0.15)';
        
        // Insert before close button
        closeBtn.parentNode.insertBefore(clearBtn, closeBtn);
    }
    
    const tabsHTML = `
    <div class="notification-tabs" style="display: flex; gap: 4px; padding: 8px 0; border-bottom: 1px solid rgba(200, 170, 110, 0.2);">
        <button class="notif-tab active" data-tab="all">
            <i class="fa-solid fa-bell"></i> All
        </button>
        <button class="notif-tab" data-tab="votes">
            <i class="fa-solid fa-chart-line"></i> Votes
        </button>
        <button class="notif-tab" data-tab="social">
            <i class="fa-solid fa-heart"></i> Social
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
    
    // Add tab styles (only once)
    if (!document.getElementById('notificationTabStyles')) {
        const style = document.createElement('style');
        style.id = 'notificationTabStyles';
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
    }
    
    setupTabListeners();
}

function setupTabListeners() {
    document.querySelectorAll('.notif-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('.notif-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
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
    
    let filtered = notifications;
    if (tab === 'votes') {
        filtered = notifications.filter(n => 
            n.type === 'causal-event' || n.type === 'live-activity'
        );
    } else if (tab === 'achievements') {
        filtered = notifications.filter(n => n.type === 'achievement');
    } else if (tab === 'social') {
        filtered = notifications.filter(n => 
            n.type === 'like' || n.type === 'comment' || n.type === 'follow'
        );
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
    
    // ✅ NEW: Group notifications by user + event type
    const grouped = groupNotificationsByUser(filtered);
    
    content.innerHTML = grouped.map(notification => {
        return renderNotificationItem(notification);
    }).join('');
    
    attachNotificationListeners();
    await updateCtaButtonsWithPrivacy();
}

window.openConversationModal = function(userId, username) {
    showMessageComposer(userId, username, {});
};

// ========================================
// DISMISS OLD NOTIFICATIONS (>48 HOURS)
// ========================================

async function dismissOldNotifications() {
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId) return;
    
    const button = document.querySelector('.clear-old-btn');
    if (button) {
        button.textContent = 'Cleaning...';
        button.disabled = true;
    }
    
    try {
        // Get all unread notifications
        const notifications = await getUnreadNotifications(userId);
        
        // Filter to only old ones (>48 hours)
        const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
        const oldNotifications = notifications.filter(n => n.timestamp < twoDaysAgo);
        
        if (oldNotifications.length === 0) {
            if (button) {
                button.textContent = 'Nothing to Clear';
                setTimeout(() => {
                    button.textContent = 'Clear Old';
                    button.disabled = false;
                }, 2000);
            }
            return;
        }
        
        console.log(`🧹 Dismissing ${oldNotifications.length} old notifications...`);
        
        // Dismiss each old notification
        let dismissed = 0;
        for (const notif of oldNotifications) {
            const success = await dismissNotification(notif.id);
            if (success) dismissed++;
        }
        
        console.log(`✅ Dismissed ${dismissed} old notifications`);
        
        // Reload panel to show updated list
        const activeTab = document.querySelector('.notif-tab.active')?.dataset.tab || 'all';
        const content = document.getElementById('notificationPanelContent');
        await loadNotificationsTab(content, userId, activeTab);
        
        if (button) {
            button.textContent = `✓ Cleared ${dismissed}`;
            setTimeout(() => {
                button.textContent = 'Clear Old';
                button.disabled = false;
            }, 3000);
        }
        
    } catch (error) {
        console.error('❌ Error dismissing old notifications:', error);
        if (button) {
            button.textContent = 'Error';
            setTimeout(() => {
                button.textContent = 'Clear Old';
                button.disabled = false;
            }, 2000);
        }
    }
}

// Expose to window for onclick handler
window.dismissOldNotifications = dismissOldNotifications;
// ========================================
// GROUP NOTIFICATIONS BY USER
// ========================================

function groupNotificationsByUser(notifications) {
    // Group by user + relationship type
    const grouped = new Map();
    
    notifications.forEach(n => {
        // Create a unique key for grouping
        const key = `${n.triggerUserId || 'system'}-${n.relationship || n.type}`;
        
        if (!grouped.has(key)) {
            // First notification from this user for this type
            grouped.set(key, {
                ...n,
                count: 1,
                matches: [{
                    matchId: n.matchId,
                    matchTitle: n.matchTitle,
                    detail: n.detail
                }],
                ids: [n.id]
            });
        } else {
            // Add to existing group
            const existing = grouped.get(key);
            existing.count++;
            existing.matches.push({
                matchId: n.matchId,
                matchTitle: n.matchTitle,
                detail: n.detail
            });
            existing.ids.push(n.id);
            
            // Keep most recent timestamp
            if (n.timestamp > existing.timestamp) {
                existing.timestamp = n.timestamp;
            }
        }
    });
    
    // Convert back to array and sort by timestamp
    return Array.from(grouped.values())
        .sort((a, b) => b.timestamp - a.timestamp);
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
    console.log('📂 Opening notification panel...');
    
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    
    if (!panel) {
        console.error('❌ Panel element not found');
        return;
    }
    
    // Apply champion pack theme
    const championPack = window.championLoader?.getCurrentPack();
    if (championPack?.theme) {
        const theme = championPack.theme;
        const root = document.documentElement;
        
        root.style.setProperty('--champion-border-color', theme.borderColor);
        root.style.setProperty('--champion-border-glow', theme.borderGlow);
        root.style.setProperty('--champion-title-color', theme.titleColor);
        root.style.setProperty('--champion-detail-color', theme.detailColor);
        root.style.setProperty('--champion-button-bg', theme.buttonBackground);
        root.style.setProperty('--champion-button-hover', theme.buttonHover);
        root.style.setProperty('--champion-button-text', theme.buttonText);
        root.style.setProperty('--champion-text-shadow', theme.textShadow);
        
        console.log(`🎨 Applied ${championPack.name} theme to notification panel`);
    }
    
    // ✅ Show overlay first
    if (overlay) {
        overlay.style.display = 'block';
        overlay.offsetHeight; // Force reflow
        overlay.classList.add('show');
    }
    
    // ✅ Show panel
    panel.style.display = 'flex';
    panel.offsetHeight; // Force reflow
    panel.classList.add('open');
    
    isPanelOpen = true;
    
    // Load notifications
    await loadNotificationsByTab(currentTab);
    
    console.log('✅ Panel opened');
}

function closePanel() {
    console.log('📭 Closing panel...');
    
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    
    if (panel) {
        panel.classList.remove('open');
        setTimeout(() => {
            panel.style.display = 'none';
        }, 300);
    }
    
    if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 200);
    }
    
    isPanelOpen = false;
    
    console.log('✅ Panel closed');
}



function renderNotificationItem(notification) {
    const timeAgo = getTimeAgo(notification.timestamp);
    const unreadClass = !notification.read && !notification.dismissed ? 'unread' : '';
    
    const championPack = window.championLoader?.getCurrentPack();
    const isChampionNotification = notification.type === 'live-activity' || 
                                   notification.type === 'danger' || 
                                   notification.type === 'nailbiter' ||
                                   notification.type === 'comeback' ||
                                   notification.type === 'winning';
    
    const isSocial = notification.relationship === 'ally' || notification.relationship === 'opponent';   // vote-with / vote-against
    const championAttr = (isChampionNotification || isSocial) && championPack 
        ? `data-from-champion="${championPack.id}"` 
        : '';

    const typeIcons = {
        'like': '❤️',
        'comment': '💬',
        'follow': '👤',
        'achievement': '🏆',
        'live-activity': '🎯',
        'causal-event': '⚡',
        'message-received': '💬'
    };
    
    // ✅ NEW: Text-to-emoji fallback map
    const iconTextMap = {
        'Crossed Swords': '⚔️',
        'crossed swords': '⚔️',
        'swords': '⚔️'
    };

    // ✅ NEW: Relationship-based fallbacks
    const relationshipIcons = {
        'rival': '⚔️',
        'ally': '🤝',
        'opponent': '⚔️',
        'teammate': '✨'
    };

    // ✅ UPDATED: Smart icon selection with fallback chain
    const icon = iconTextMap[notification.icon] 
        || notification.icon 
        || relationshipIcons[notification.relationship] 
        || typeIcons[notification.type] 
        || '📢';
    
    // ✅ NEW: Show count badge if multiple matches
    const countBadge = notification.count > 1 
        ? `<span class="notification-count">${notification.count}</span>`
        : '';
    
    // ✅ NEW: Update message for grouped notifications
    let displayMessage = notification.message;
    let displayDetail = notification.detail || '';
    
    if (notification.count > 1) {
        displayMessage = `${notification.triggerUsername} voted in ${notification.count} matches`;
        
        // Show first 2 match titles
        const matchTitles = notification.matches
            .slice(0, 2)
            .map(m => m.matchTitle)
            .join(', ');
        
        displayDetail = notification.count > 2 
            ? `${matchTitles} +${notification.count - 2} more`
            : matchTitles;
    }
    
    // Image logic
    let imageHtml = '';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    if (isSocial && championPack?.icon) {
        // Same idea as the toast: the other voter's face, with the champion who is reacting pinned to the corner,
        // ringed in the pack colour (green-ish for an ally, the pack accent for a rival).
        const ring = notification.relationship === 'ally' ? '#4ade80' : (championPack.color || '#ff69b4');
        const name = notification.triggerUsername || '?';
        const face = notification.thumbnailUrl
            ? `<img src="${esc(notification.thumbnailUrl)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;border:2px solid ${ring};">`
            : `<div style="width:100%;height:100%;border-radius:50%;background:#2a2342;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;border:2px solid ${ring};">${esc(name.charAt(0).toUpperCase())}</div>`;
        imageHtml = `
            <div style="position:relative;width:44px;height:44px;flex-shrink:0;margin-right:10px;">
                ${face}
                <img src="${esc(championPack.icon)}" alt="${esc(championPack.name)}" title="${esc(championPack.name)}"
                     style="position:absolute;bottom:-4px;right:-6px;width:24px;height:24px;border-radius:50%;object-fit:cover;border:2px solid ${championPack.color || '#ff69b4'};background:#14101f;">
            </div>
        `;
    } else if (notification.thumbnailUrl) {
        imageHtml = `
            <div style="position: relative; width: 40px; height: 40px; flex-shrink: 0; margin-right: 8px;">
                <img src="${notification.thumbnailUrl}" 
                     style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid rgba(200, 155, 60, 0.3);">
                <div style="position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; background: linear-gradient(135deg, #C8AA6E, #B89A5E); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; border: 2px solid #1a1a2e;">
                    ${icon}${countBadge}
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
                    ${icon}${countBadge}
                </div>
            </div>
        `;
    } else {
        imageHtml = `<span class="notification-item-icon" style="font-size: 20px; margin-right: 8px;">${icon}${countBadge}</span>`;
    }
    
    // CTA button logic (unchanged but uses notification.ids for grouped)
    let ctaHtml = '';
    if (notification.ctaAction === 'send-emote' || notification.ctaAction === 'open-message') {
        ctaHtml = `
            <button class="notification-item-cta" 
                    data-id="${notification.ids ? notification.ids.join(',') : notification.id}"
                    data-action="${notification.ctaAction}"
                    data-target-user="${notification.triggerUserId}"
                    data-url="${notification.targetUrl || ''}">
                <span class="cta-loading">Checking...</span>
            </button>
        `;
    } else {
        ctaHtml = `
            <button class="notification-item-cta" 
                    data-id="${notification.ids ? notification.ids.join(',') : notification.id}"
                    data-action="${notification.ctaAction}"
                    data-url="${notification.targetUrl || ''}">
                ${notification.ctaText}
            </button>
        `;
    }
    
    return `
        <div class="notification-item ${unreadClass}" 
             data-id="${notification.ids ? notification.ids.join(',') : notification.id}"
             ${championAttr} ${notification.relationship ? `data-relationship="${esc(notification.relationship)}"` : ''}>
            <div class="notification-item-header" style="display: flex; align-items: center;">
                ${imageHtml}
                <div style="flex: 1; min-width: 0;">
                    <div class="notification-item-message">${displayMessage}</div>
                </div>
                <button class="notification-item-dismiss" 
                        data-id="${notification.ids ? notification.ids.join(',') : notification.id}">
                    Dismiss
                </button>
            </div>
            
            ${displayDetail ? `<div class="notification-item-detail notification-item-detail-clamp">${displayDetail}</div>` : ''}
            

            
            <div class="notification-item-footer">
                <span class="notification-item-time">${timeAgo}${notification.count > 1 ? ` · <a class="notification-item-link" href="#" onclick="expandGroupedNotification('${notification.ids.join(',')}', event); return false;">All ${notification.count} matches</a>` : (isSocial && notification.targetUrl ? ` · <a class="notification-item-link" href="${esc(notification.targetUrl)}">View match</a>` : '')}</span>
                ${ctaHtml}
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
            const notification = notifications.find(n => n.id === notifId.split(',')[0]);   // grouped rows carry several ids
            
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
                const ids = id.split(',');                       // a grouped row ("voted in 2 matches") has several ids
                const notification = notifications.find(n => n.id === ids[0]);
                
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
                        
                        for (const one of ids) { await markNotificationRead(one); await dismissNotification(one); }
                        
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

// ========================================
// EXPAND GROUPED NOTIFICATION
// ========================================

window.expandGroupedNotification = async function(idString, event) {
    event.stopPropagation();
    
    const ids = idString.split(',');
    const userId = localStorage.getItem('tournamentUserId');
    
    // Get all notifications in this group
    const allNotifications = await getUnreadNotifications(userId);
    const groupNotifications = allNotifications.filter(n => ids.includes(n.id));
    
    // Create modal to show all matches
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        z-index: 10002;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
    `;
    
    modal.innerHTML = `
        <div style="
            background: linear-gradient(160deg, #1c0f26 0%, #120a1c 100%);
            border: 2px solid rgba(255, 105, 180, 0.6); box-shadow: 0 0 30px rgba(255, 105, 180, 0.25);
            border-radius: 12px;
            padding: 24px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        ">
            <h3 style="margin: 0 0 16px 0; color: #ff69b4;">
                All Matches (${groupNotifications.length})
            </h3>
            ${groupNotifications.map(n => `
                <div style="
                    background: rgba(255, 105, 180, 0.07);
                    border: 1px solid rgba(255, 105, 180, 0.25);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 12px;
                ">
                    <a href="${n.targetUrl || '#'}" style="display: block; font-weight: 600; color: #fff; margin-bottom: 4px; text-decoration: none;">
                        ${n.matchTitle}
                    </a>
                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7);">
                        ${n.relationship === 'ally' ? '🤝 Same pick as you' : n.relationship === 'opponent' ? '⚔️ Voted against you' : ''}
                        ${n.targetUrl ? ' · <a href="' + n.targetUrl + '" style="color: #ff9bd6;">View match</a>' : ''}
                    </div>
                </div>
            `).join('')}
            <button onclick="this.closest('div[style*=fixed]').remove()" style="
                width: 100%;
                margin-top: 16px;
                background: linear-gradient(135deg, #ff69b4, #ff1493);
                border: none;
                color: #fff;
                padding: 12px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 700;
            ">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
};