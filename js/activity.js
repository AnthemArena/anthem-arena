// ========================================
// ACTIVITY FEED PAGE
// ========================================

import { getActivityFeed } from './api-client.js';

let allActivities = [];
let myVotes = {};
let currentFilter = 'all';

/**
 * Render avatar (emoji or image URL)
 */
function renderAvatar(avatar) {
    // Handle old emoji-only format
    if (typeof avatar === 'string') {
        return avatar;
    }
    
    // Handle new format {type: 'emoji'|'url', value: '...'}
    if (avatar && avatar.type === 'url') {
        return `<img src="${avatar.value}" alt="Avatar" onerror="this.style.display='none'; this.nextSibling.style.display='flex';" />
                <span class="avatar-fallback" style="display: none;">👤</span>`;
    }
    
    // Default to emoji
    return avatar?.value || '🎵';
}

// ========================================
// INITIALIZE PAGE
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎭 Activity page loaded');
    
    // Get user's votes from localStorage
    myVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    
    // Load activity feed
    await loadActivityFeed();
    
    // Setup filter buttons
    setupFilters();
});

// ========================================
// LOAD ACTIVITY FEED
// ========================================

async function loadActivityFeed() {
    try {
        console.log('📥 Loading activity feed...');
        
        // Fetch from edge-cached API
        allActivities = await getActivityFeed(100);
        
        if (allActivities.length === 0) {
            document.getElementById('no-activity').style.display = 'flex';
            return;
        }
        
        // Group by match
        const groupedByMatch = groupActivitiesByMatch(allActivities);
        
        // Render feed
        renderActivityFeed(groupedByMatch);
        
        // Update stats
        updateStats(groupedByMatch);
        
        console.log(`✅ Loaded ${allActivities.length} activity items`);
        
    } catch (error) {
        console.error('❌ Error loading activity:', error);
        showError('Could not load activity feed');
    }
}

// ========================================
// GROUP ACTIVITIES BY MATCH
// ========================================

function groupActivitiesByMatch(activities) {
    const grouped = {};
    
    activities.forEach(activity => {
        if (!grouped[activity.matchId]) {
            grouped[activity.matchId] = {
                matchId: activity.matchId,
                matchTitle: activity.matchTitle,
                round: activity.round,
                activities: []
            };
        }
        grouped[activity.matchId].activities.push(activity);
    });
    
    return Object.values(grouped);
}

// ========================================
// RENDER ACTIVITY FEED
// ========================================

function renderActivityFeed(groupedActivities) {
    const container = document.getElementById('activity-feed');
    
    if (groupedActivities.length === 0) {
        container.innerHTML = '<p class="no-results">No activity matches this filter</p>';
        return;
    }
    
    const html = groupedActivities
        .filter(group => filterGroup(group))
        .map(group => renderMatchActivityCard(group))
        .join('');
    
    container.innerHTML = html;
}

// ========================================
// RENDER MATCH ACTIVITY CARD
// ========================================

function renderMatchActivityCard(group) {
    const iHaveVoted = myVotes[group.matchId] !== undefined;
    const activityCount = group.activities.length;
    const myVote = myVotes[group.matchId];
    
    if (!iHaveVoted) {
        // 🔒 LOCKED STATE
        return `
            <div class="activity-card locked" data-state="locked">
                <div class="match-header">
                    <h3>🎵 ${group.matchTitle}</h3>
                    <span class="round-badge">Round ${group.round}</span>
                </div>
                
                <div class="vote-count-badge">
                    👥 ${activityCount} ${activityCount === 1 ? 'person' : 'people'} voted • 🔒 Vote to see picks
                </div>
                
                <div class="activity-list">
                    ${group.activities.slice(0, 5).map(activity => `
                        <div class="activity-item locked">
<div class="user-avatar">${renderAvatar(activity.avatar)}</div>
                            <div class="activity-text">
                                <strong>${activity.username}</strong> voted
                                <span class="time-ago">${getTimeAgo(activity.timestamp)}</span>
                            </div>
                            <div class="lock-icon">🔒</div>
                        </div>
                    `).join('')}
                    ${activityCount > 5 ? `<div class="more-voters">+ ${activityCount - 5} more</div>` : ''}
                </div>
                
                <a href="/vote.html?id=${group.matchId}" class="cta-vote">
                    🗳️ Vote to Reveal Picks
                </a>
            </div>
        `;
    } else {
        // 🔓 REVEALED STATE
        const mySongId = myVote.songId;
        
        return `
            <div class="activity-card revealed" data-state="revealed">
                <div class="match-header">
                    <h3>🎵 ${group.matchTitle}</h3>
                    <span class="round-badge">Round ${group.round}</span>
                    <span class="your-pick">✓ You voted: ${myVote.songTitle}</span>
                </div>
                
                <div class="activity-list">
                    ${group.activities.map(activity => {
                        const matchesMyPick = activity.songId === mySongId;
                        return `
                            <div class="activity-item revealed ${matchesMyPick ? 'same-pick' : 'different-pick'}">
<div class="user-avatar">${renderAvatar(activity.avatar)}</div>
                                <div class="activity-text">
                                    <strong>${activity.username}</strong> → ${activity.songTitle}
                                    <span class="time-ago">${getTimeAgo(activity.timestamp)}</span>
                                    ${matchesMyPick ? '<span class="agreement">🤝 Same pick!</span>' : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <a href="/vote.html?id=${group.matchId}" class="view-match-link">
                    View Full Match Results →
                </a>
            </div>
        `;
    }
}

// ========================================
// FILTER LOGIC
// ========================================

function filterGroup(group) {
    const iHaveVoted = myVotes[group.matchId] !== undefined;
    
    if (currentFilter === 'locked') {
        return !iHaveVoted;
    } else if (currentFilter === 'revealed') {
        return iHaveVoted;
    }
    return true; // 'all'
}

function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update filter
            currentFilter = btn.dataset.filter;
            
            // Re-render
            const groupedByMatch = groupActivitiesByMatch(allActivities);
            renderActivityFeed(groupedByMatch);
        });
    });
}

// ========================================
// UPDATE STATS
// ========================================

function updateStats(groupedActivities) {
    const revealed = groupedActivities.filter(g => myVotes[g.matchId] !== undefined).length;
    const locked = groupedActivities.filter(g => myVotes[g.matchId] === undefined).length;
    
    document.getElementById('revealed-count').textContent = revealed;
    document.getElementById('locked-count').textContent = locked;
}

// ========================================
// HELPER: TIME AGO
// ========================================

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// ========================================
// ERROR HANDLING
// ========================================

function showError(message) {
    const container = document.getElementById('activity-feed');
    container.innerHTML = `
        <div class="error-message">
            <span class="error-icon">⚠️</span>
            <p>${message}</p>
            <button onclick="location.reload()" class="btn-primary">Retry</button>
        </div>
    `;
}

console.log('✅ Activity.js loaded');