console.log('🔔 notification-center.js loaded');

import { 
    getUnreadNotifications, 
    getUnreadCount, 
    markNotificationRead, 
    dismissNotification 
} from './notification-storage.js';
import { withoutEmoteCta } from './features.js';
import { groupNotifications, groupHeadline, socialHeadline, isSocialTabItem, isFollowNotification, isFollowBack, followHeadline, followQuip, isContentNotification, contentHeadline, contentQuote, contentIcon, contentCta, isEventNotification, eventKind, eventTag, eventGlyph, eventUrl, isStreakNotification, streakView } from './notification-model.js';
import { getFollowingIds } from './follow-system.js';
import { socialRowHtml, followRowHtml, contentRowHtml, eventRowHtml, avatarSrc, fallbackAvatarFor, championBadgeUrl } from './notification-visuals.js';
import { enrichSocial, matchesLoaded } from './notification-social-context.js';

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
        clearBtn.textContent = 'Clear all';
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
    
    await loadNotificationsTab(content, userId, tab);
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
        filtered = notifications.filter(isSocialTabItem);
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
    const followingIds = await getFollowingIds(localStorage.getItem('tournamentUserId'));
    const grouped = groupNotifications(filtered, followingIds);
    followingNow = followingIds;
    await enrichSocial(grouped);        // voter avatars + the two edits' pictures for ally/rival rows
    
    content.innerHTML = grouped.map(notification => {
        return renderNotificationItem(notification);
    }).join('');
    
    attachNotificationListeners();
    await updateCtaButtonsWithPrivacy();

    // A slow match list made vote rows fall back to avatars; once it lands, draw them again with the edit pictures
    const missing = grouped.some(n => (n.relationship === 'ally' || n.relationship === 'opponent') && n.nv && !n.nv.edits);
    if (missing && await matchesLoaded()) {
        if (document.querySelector('.notif-tab.active')?.dataset.tab !== tab || !document.body.contains(content)) return;
        await enrichSocial(grouped.filter(n => n.nv && !n.nv.edits));
        content.innerHTML = grouped.map(renderNotificationItem).join('');
        attachNotificationListeners();
        await updateCtaButtonsWithPrivacy();
    }
}

// ========================================
// CLEAR ALL (in the tab you are looking at)
// ========================================
// This used to dismiss only notifications older than 48 hours, but the panel only lists the last 72 hours, so it nearly
// always said "Nothing to Clear". Now it clears everything in the current tab (with a second tap to confirm).

let clearConfirmTimer = null;

async function dismissOldNotifications() {
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId) return;
    const button = document.querySelector('.clear-old-btn');
    const activeTab = document.querySelector('.notif-tab.active')?.dataset.tab || 'all';

    // first tap asks, second tap (within 3 seconds) does it
    if (button && !button.dataset.confirm) {
        button.dataset.confirm = '1';
        button.textContent = activeTab === 'all' ? 'Clear everything?' : `Clear ${activeTab}?`;
        clearTimeout(clearConfirmTimer);
        clearConfirmTimer = setTimeout(() => { delete button.dataset.confirm; button.textContent = 'Clear all'; }, 3000);
        return;
    }
    clearTimeout(clearConfirmTimer);
    if (button) { delete button.dataset.confirm; button.textContent = 'Clearing...'; button.disabled = true; }

    try {
        const notifications = await getUnreadNotifications(userId);
        let inTab = notifications;
        if (activeTab === 'votes') inTab = notifications.filter(n => n.type === 'causal-event' || n.type === 'live-activity');
        else if (activeTab === 'achievements') inTab = notifications.filter(n => n.type === 'achievement');
        else if (activeTab === 'social') inTab = notifications.filter(isSocialTabItem);

        if (inTab.length === 0) {
            if (button) { button.textContent = 'Nothing to clear'; setTimeout(() => { button.textContent = 'Clear all'; button.disabled = false; }, 2000); }
            return;
        }

        const ok = await dismissNotification(inTab.map(n => n.id).join(','));
        console.log(`🧹 Cleared ${inTab.length} notifications (${activeTab})`);

        const content = document.getElementById('notificationPanelContent');
        await loadNotificationsTab(content, userId, activeTab);
        await updateBadgeCount();

        if (button) { button.textContent = ok ? `✓ Cleared ${inTab.length}` : 'Error'; setTimeout(() => { button.textContent = 'Clear all'; button.disabled = false; }, 2500); }
    } catch (error) {
        console.error('❌ Error clearing notifications:', error);
        if (button) { button.textContent = 'Error'; setTimeout(() => { button.textContent = 'Clear all'; button.disabled = false; }, 2000); }
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



let followingNow = new Set();          // who the viewer follows right now (the bell shows "View profile" instead of "Follow back")

function renderNotificationItem(notification) {
    notification = withoutEmoteCta(notification);      // emotes are off: a thanks / challenge button becomes "View match"
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
    
    const headline = groupHeadline(notification);
    if (headline) {
        // ally / rival group: say what it is ("3 people voted against you in X", "Kai voted against you in 2 matches")
        displayMessage = headline.message;
        displayDetail = headline.detail || displayDetail;
        if (notification.groupKind === 'match') {      // a crowd: no single person to emote, so just open the match
            notification = { ...notification, ctaAction: 'navigate', ctaText: 'View match' };
        }
    }
    // Single ally/rival rows (including ones saved before this wording): always the short headline
    if (!headline && isSocial && !(notification.count > 1)) displayMessage = socialHeadline(notification);
    if (!headline && notification.count > 1) {
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
    
    if (isSocial) return socialRowHtml(notification, { headline, timeAgo, championPack });
    if (isFollowNotification(notification)) {
        return followRowHtml(notification, { headline: followHeadline(notification), quip: followQuip(notification), timeAgo, championPack, theirSrc: notification.nv?.theirSrc, alreadyFollowing: followingNow.has(notification.triggerUserId) || isFollowBack(notification) });
    }

    if (isContentNotification(notification)) {
        // like / comment / reply / mention: grouped per post ("3 people liked your post"), shows the words, opens the post
        const names = notification.users?.length ? notification.users : [notification.triggerUsername].filter(Boolean);
        const srcs = names.map((nm, i) => (names.length > 1 ? notification.nv?.avatars?.[i] : notification.nv?.theirSrc) || avatarSrc(notification.avatars?.[i]) || fallbackAvatarFor(nm));
        return contentRowHtml(notification, { parts: contentHeadline(notification), quote: contentQuote(notification), icon: contentIcon(notification), cta: contentCta(notification), timeAgo, championPack, srcs, names });
    }

    if (isStreakNotification(notification)) {
        // "10 matches in a row with Kai": the ally / rival row, with the champion's line and a View profile button
        const v = streakView(notification);
        return socialRowHtml({ ...notification, relationship: v.relationship, detail: notification.message, matchTitle: '', ctaAction: 'navigate', ctaText: 'View profile', ctaUrl: v.profileUrl, targetUrl: v.profileUrl },
            { headline: { message: v.headline, detail: '' }, timeAgo, championPack });
    }

    if (isEventNotification(notification)) {
        // danger / nailbiter / winning / comeback / closing / no or low votes / round open / match result: one card design
        const kind = eventKind(notification);
        const accent = kind.tone || championPack?.color || '#ff69b4';
        return eventRowHtml(notification, {
            tag: eventTag(notification), glyph: eventGlyph(notification), edits: notification.nv?.edits || null, accent, jinxSrc: championBadgeUrl(championPack),
            quip: notification.message, timeAgo, championPack, cta: notification.ctaText || 'View match', url: eventUrl(notification)
        });
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
    if (notification.ctaAction === 'send-emote') {
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
            ${isSocial && notification.matchTitle && (!(notification.count > 1) || notification.groupKind === 'match') ? `<div class="notification-item-match" title="${esc(notification.matchTitle)}">in ${esc(notification.matchTitle)}</div>` : ''}
            

            
            <div class="notification-item-footer">
                <span class="notification-item-time">${timeAgo}${notification.count > 1 && notification.groupKind !== 'match' ? ` · <a class="notification-item-link" href="#" onclick="expandGroupedNotification('${notification.ids.join(',')}', event); return false;">All ${notification.count} matches</a>` : (isSocial && notification.targetUrl ? ` · <a class="notification-item-link" href="${esc(notification.targetUrl)}">View match</a>` : '')}</span>
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
            
            // New follower: follow them back right from the bell
            if (action === 'follow-back') {
                const original = btn.textContent;
                btn.textContent = 'Following...'; btn.disabled = true;
                try {
                    const { followUser } = await import('./follow-system.js');
                    const result = await followUser(btn.dataset.userId, btn.dataset.username);
                    if (result?.success) {
                        btn.textContent = '✓ Following';
                        for (const one of id.split(',')) await markNotificationRead(one);
                        await updateBadgeCount();
                    } else {
                        btn.textContent = original; btn.disabled = false;
                    }
                } catch (err) {
                    console.warn('Follow back failed', err);
                    btn.textContent = original; btn.disabled = false;
                }
                return;
            }

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
            
            for (const one of id.split(',')) await dismissNotification(one);   // a grouped row carries several ids
            
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
        item.addEventListener('click', async (e) => {
            const id = item.dataset.id;
            for (const one of id.split(',')) await markNotificationRead(one);
            item.classList.remove('unread');
            await updateBadgeCount();
            // ally / rival rows: the row itself opens the match (a per-person group opens its list)
            if (item.classList.contains('nv-row') && !e.target.closest('button, a')) {
                if (item.dataset.group) window.expandGroupedNotification?.(item.dataset.group, e);
                else if (item.dataset.url) window.location.href = item.dataset.url;
            }
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