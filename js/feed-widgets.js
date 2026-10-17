// ========================================
// FEED WIDGETS - Sidebars Population
// ========================================

import { db } from './firebase-config.js';
import { ARCANE_CONFIG } from './arcane-config.js';
import { createMatchCard } from './match-card-renderer.js';
import { getAllMatches } from './api-client.js';
import { shortTitle } from './title-clean.js';
import { buildParticipation } from './participation-model.js';
import { closingSoon, announcementToShow, formatLeft } from './feed-strip-model.js';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFollowerCount, getFollowingCount } from './follow-system.js';

// ✅ NEW IMPORTS for personal widgets
import { getUserXPFromStorage, getUserRank } from './rank-system.js';
import { getUnlockedAchievementsFromFirebase } from './achievement-tracker.js';
import { ACHIEVEMENTS } from './achievements.js';

import { fixAvatarUrl } from './avatar-url.js';
// Several widgets need the same matches and the same user votes: ask once per page load.
const once = (() => { const memo = new Map(); return (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); }; })();
const matchesOnce = () => once('matches', () => getAllMatches());
const myVotesOnce = userId => once('votes:' + userId, async () => (await getDocs(query(collection(db, 'votes'), where('userId', '==', userId)))).docs.map(d => d.data()));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ========================================
// INITIALIZE ALL WIDGETS
// ========================================

export async function initializeFeedWidgets() {
    console.log('🎨 Initializing feed widgets...');
    
    await Promise.all([
        loadUserProfile(),
        // ✅ NEW: Personal widgets
        loadPersonalRankCard(),
        loadRoundProgress(),
        loadFeedStrips(),
        loadFeaturedAchievement(),
        loadTopMoment(),
        // Existing widgets
        loadLiveMatches(),
        loadRecentActivity(),
        loadTournamentStats()
    ]);
    
    console.log('✅ Feed widgets loaded');
}

// ========================================
// LEFT SIDEBAR - User Profile
// ========================================

async function loadUserProfile() {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        const username = localStorage.getItem('username');
        const avatarJson = localStorage.getItem('avatar');
        
        if (!username || username === 'Anonymous') {
            document.querySelector('.sidebar-profile-card').style.display = 'none';
            return;
        }
        
        // Set username
        document.getElementById('sidebarUsername').textContent = username;
        
        // Set avatar
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
        
        const avatarEl = document.getElementById('sidebarAvatar');
        if (avatar.type === 'url') {
            avatarEl.src = avatar.value;
        } else if (avatar.type === 'emoji') {
            avatarEl.src = createEmojiAvatar(avatar.value);
        } else if (avatar.type === 'champion') {
            avatarEl.src = avatar.imageUrl;
        }
        
        // ✅ Load user's actual profile data from Firebase
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
            const profileData = profileDoc.data();
            
            // ✅ Set bio from profile
            const bioEl = document.getElementById('sidebarBio');
            if (bioEl && profileData.bio) {
                bioEl.textContent = profileData.bio;
            }
        }
        
        // ✅ Use follow-system.js to get real counts from follows collection
        const [followingCount, followerCount] = await Promise.all([
            getFollowingCount(userId),
            getFollowerCount(userId)
        ]);
        
        document.getElementById('sidebarFollowing').textContent = followingCount;
        document.getElementById('sidebarFollowers').textContent = followerCount;
        
        // Load vote count
        const votesQuery = query(collection(db, 'votes'), where('userId', '==', userId));
        const votesSnapshot = await getDocs(votesQuery);
        document.getElementById('sidebarVotes').textContent = votesSnapshot.size;
        
        // Load notification badge
        const { getUnreadCount } = await import('./notification-storage.js');
        const unreadCount = await getUnreadCount(userId);
        if (unreadCount > 0) {
            const badge = document.getElementById('sidebarNotifBadge');
            if (badge) {
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.display = 'inline-block';
            }
        }
        
        console.log('✅ User profile loaded');
        
    } catch (error) {
        console.error('❌ Error loading user profile:', error);
    }
}

// ========================================
// ✅ NEW: PERSONAL RANK CARD WIDGET
// ========================================

async function loadPersonalRankCard() {
    const container = document.getElementById('personalRankWidget');
    if (!container) return; // Widget not in HTML yet
    
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        const username = localStorage.getItem('username');
        
        if (!username || username === 'Anonymous') {
            container.style.display = 'none';
            return;
        }
        
        // Get XP and rank
        const xp = getUserXPFromStorage();
        const rank = getUserRank(xp);
        
        // Get avatar
        const avatarJson = localStorage.getItem('avatar');
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
        const avatarUrl = getAvatarUrl(avatar);
        
        // Get vote count
        const votesQuery = query(collection(db, 'votes'), where('userId', '==', userId));
        const votesSnapshot = await getDocs(votesQuery);
        const voteCount = votesSnapshot.size;
        
        // Get achievement count
        const unlockedIds = await getUnlockedAchievementsFromFirebase(userId);
        const achievementCount = unlockedIds.length;
        
        // Progress percentage
        const progressPercent = Math.round(rank.progressPercent);
        
        // Clean rank title (remove emojis)
        const cleanTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
        
        container.innerHTML = `
            <div class="personal-rank-card" onclick="window.location.href='/profile.html'">
                <div class="rank-header">
                    <div class="rank-info">
                        <div class="rank-level">
                            <span class="level-badge">Lv. ${rank.currentLevel.level}</span>
                            <span class="rank-title">${cleanTitle}</span>
                        </div>
                    </div>
                </div>
                
                <div class="rank-progress-section">
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <div class="progress-text">
                        ${(rank.currentXP || 0).toLocaleString()} / ${(rank.nextLevel?.xpNeeded || 0).toLocaleString()} XP
                    </div>
                </div>
                
                <div class="rank-stats-row">
                    <div class="rank-stat">
                        <i class="fa-solid fa-trophy"></i>
                        <span>${voteCount}</span>
                    </div>
                    <div class="rank-stat">
                        <i class="fa-solid fa-award"></i>
                        <span>${achievementCount}</span>
                    </div>
                </div>
            </div>
        `;
        
        console.log('✅ Personal rank card loaded');
        
    } catch (error) {
        console.error('❌ Error loading rank card:', error);
        container.style.display = 'none';
    }
}

// ========================================
// ✅ NEW: ROUND PROGRESS WIDGET (replaces streak)
// ========================================

// ========================================
// ✅ FIXED: ROUND PROGRESS WIDGET
// ========================================

// ========================================
// TOP-OF-FEED STRIPS: pinned announcement (data/announcement.json) and "closing soon" reminder
// ========================================
async function loadFeedStrips() {
    const box = document.getElementById('feedStrips');
    if (!box) return;
    box.innerHTML = '';

    // Announcement: edit data/announcement.json (enabled, id, text, link, expires) and deploy. A new id shows again for people who dismissed the old one.
    try {
        const cfg = await (await fetch('/data/announcement.json', { cache: 'no-cache' })).json();
        let dismissed = null;
        try { dismissed = localStorage.getItem('dismissedAnnouncement'); } catch (e) {}
        const a = announcementToShow(cfg, Date.now(), dismissed);
        if (a) {
            const el = document.createElement('div');
            el.className = 'feed-strip feed-announcement';
            el.innerHTML = `<i class="fa-solid fa-thumbtack"></i><span class="strip-text">${esc(a.text)}${a.linkUrl ? ` <a href="${esc(a.linkUrl)}">${esc(a.linkText)} →</a>` : ''}</span>
                <button type="button" class="strip-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>`;
            el.querySelector('.strip-close').addEventListener('click', () => {
                try { localStorage.setItem('dismissedAnnouncement', a.id); } catch (e) {}
                el.remove();
            });
            box.appendChild(el);
        }
    } catch (e) { /* no announcement file: nothing to show */ }

    // Closing soon: live matches this user has not voted on, soonest deadline first
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        const [matches, votes] = await Promise.all([matchesOnce(), userId ? myVotesOnce(userId) : Promise.resolve(null)]);
        const c = closingSoon({ matches, votes, cupId: ARCANE_CONFIG.tournamentId });
        if (c.count > 0) {
            const el = document.createElement('a');
            el.className = 'feed-strip feed-closing';
            el.href = c.nextId ? `/vote?match=${encodeURIComponent(c.nextId)}` : '/matches';
            const left = c.msLeft !== null ? ` · next closes in ${formatLeft(c.msLeft)}` : '';
            el.innerHTML = `<i class="fa-solid fa-hourglass-half"></i><span class="strip-text">${votes ? `You haven't voted in ${c.count} open ${c.count === 1 ? 'match' : 'matches'}` : `${c.count} ${c.count === 1 ? 'match is' : 'matches are'} open for voting`}${left}</span><span class="strip-cta">Vote →</span>`;
            box.appendChild(el);
        }
    } catch (e) { console.error('❌ Error loading closing-soon strip:', e); }
}

async function loadRoundProgress() {
    const container = document.getElementById('roundProgressWidget');
    if (!container) return;

    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        if (!userId) { container.style.display = 'none'; return; }

        // Same numbers as the profile: only matches that have opened count, stage by stage (js/participation-model.js).
        const [matches, votes] = await Promise.all([matchesOnce(), myVotesOnce(userId)]);
        const p = buildParticipation({ matches, votes, cupId: ARCANE_CONFIG.tournamentId });

        if (p.totalVotes === 0 || p.totalPossible === 0) { container.style.display = 'none'; return; }

        let cta;
        if (p.overallPercentage === 100) cta = '<div class="progress-cta complete">✅ Every open match voted! More coming soon.</div>';
        else if (p.current) cta = `<div class="progress-cta">🎯 ${p.current.total - p.current.voted} left in ${esc(p.current.label)}!</div>`;
        else cta = '<div class="progress-cta"><a href="/matches.html">View Matches →</a></div>';

        container.innerHTML = `
            <div class="round-progress-card">
                <div class="progress-header">
                    <i class="fa-solid fa-trophy"></i>
                    <span>Tournament Progress</span>
                </div>
                <div class="overall-progress">
                    <div class="progress-circle-mini">
                        <svg width="60" height="60">
                            <circle cx="30" cy="30" r="25" stroke="rgba(255, 79, 180, 0.2)" stroke-width="4" fill="none"/>
                            <circle cx="30" cy="30" r="25" stroke="#ff4fb4" stroke-width="4" fill="none"
                                stroke-dasharray="157" stroke-dashoffset="${157 - (157 * p.overallPercentage / 100)}"
                                transform="rotate(-90 30 30)" style="transition: stroke-dashoffset 0.5s ease;"/>
                        </svg>
                        <div class="progress-value">${p.overallPercentage}%</div>
                    </div>
                    <div class="progress-label">${p.totalVotes} / ${p.totalPossible} open matches</div>
                </div>
                <div class="rounds-breakdown-mini">
                    ${p.byStage.map(r => `
                        <div class="round-row-mini ${r.percentage === 100 ? 'complete' : ''} ${r.live ? 'active-round' : ''}">
                            <span class="round-name" title="${esc(r.label)}">${esc(r.short)}</span>
                            <div class="round-bar-mini"><div class="round-bar-fill" style="width: ${r.percentage}%"></div></div>
                            <span class="round-votes">${r.voted}/${r.total}</span>
                        </div>`).join('')}
                </div>
                ${cta}
            </div>
        `;
    } catch (error) {
        console.error('❌ Error loading round progress:', error);
        container.style.display = 'none';
    }
}

// ========================================
// ✅ NEW: FEATURED ACHIEVEMENT WIDGET
// ========================================

async function loadFeaturedAchievement() {
    const container = document.getElementById('featuredAchievementWidget');
    if (!container) return;
    
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        
        if (!userId) {
            container.style.display = 'none';
            return;
        }
        
        const unlockedIds = await getUnlockedAchievementsFromFirebase(userId);
        
        if (unlockedIds.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        // Get highest rarity achievement
        const unlockedAchievements = unlockedIds
            .map(id => ({ ...ACHIEVEMENTS[id], id }))
            .filter(Boolean)
            .sort((a, b) => {
                const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4 };
                const rarityA = rarityOrder[a.rarity] || 0;
                const rarityB = rarityOrder[b.rarity] || 0;
                if (rarityB !== rarityA) return rarityB - rarityA;
                return (b.xp || 0) - (a.xp || 0);
            });
        
        const featured = unlockedAchievements[0];
        
        container.innerHTML = `
            <div class="featured-achievement-card" onclick="window.location.href='/profile.html#tab-achievements'">
                <div class="achievement-widget-header">
                    <i class="fa-solid fa-award"></i>
                    <span>Top Achievement</span>
                </div>
                <div class="achievement-content">
                    <div class="achievement-badge-lg">
                        ${featured.icon}
                    </div>
                    <div class="achievement-details">
                        <div class="achievement-name">${featured.name}</div>
                        <span class="achievement-rarity ${featured.rarity}">${featured.rarity}</span>
                    </div>
                    <div class="achievement-description">${featured.description}</div>
                    <div class="achievement-xp-badge">+${featured.xp} XP</div>
                </div>
                
                ${unlockedAchievements.length > 1 ? `
                    <div class="achievement-count">
                        ${unlockedAchievements.length} achievements unlocked
                    </div>
                ` : ''}
            </div>
        `;
        
        console.log('✅ Featured achievement loaded');
        
    } catch (error) {
        console.error('❌ Error loading featured achievement:', error);
        container.style.display = 'none';
    }
}

// ========================================
// ✅ NEW: TOP SONG WIDGET
// ========================================

async function loadTopMoment() {
    const container = document.getElementById('topSongWidget');
    if (!container) return;

    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        if (!userId) { container.style.display = 'none'; return; }

        const [votes, allMatches] = await Promise.all([myVotesOnce(userId), matchesOnce()]);
        if (!votes.length) { container.style.display = 'none'; return; }
        const matchMap = new Map(allMatches.map(m => [m.matchId || m.id, m]));

        // Count votes per edit, only for matches of the current cup
        const counts = {};
        for (const vote of votes) {
            const match = matchMap.get(vote.matchId);
            if (!match) continue;
            const edit = vote.choice === 'song1' ? match.song1 : match.song2;
            if (!edit || !edit.id) continue;
            if (!counts[edit.id]) counts[edit.id] = { name: shortTitle(edit.shortTitle || edit.title || '', 60), creator: edit.artist || '', videoId: edit.videoId || '', count: 0 };
            counts[edit.id].count++;
        }

        const top = Object.values(counts).sort((a, b) => b.count - a.count)[0];
        if (!top) { container.style.display = 'none'; return; }

        const watch = top.videoId ? `https://youtube.com/watch?v=${encodeURIComponent(top.videoId)}` : null;
        container.innerHTML = `
            <div class="top-song-card" ${watch ? `data-watch="${esc(watch)}"` : ''}>
                <div class="song-widget-header"><i class="fa-solid fa-film"></i><span>Your Top Moment</span></div>
                ${top.videoId ? `<div class="song-thumbnail-container">
                    <img src="https://img.youtube.com/vi/${encodeURIComponent(top.videoId)}/mqdefault.jpg" alt="${esc(top.name)}" class="song-thumbnail" loading="lazy">
                    <div class="play-overlay"><i class="fa-solid fa-play"></i></div></div>` : ''}
                <div class="song-info">
                    <div class="song-medal">🥇</div>
                    <div class="song-details">
                        <div class="song-title">${esc(top.name)}</div>
                        <div class="song-artist">${esc(top.creator)}</div>
                        <div class="song-votes">${top.count} ${top.count === 1 ? 'vote' : 'votes'}</div>
                    </div>
                </div>
            </div>`;
        container.querySelector('.top-song-card[data-watch]')?.addEventListener('click', e => window.open(e.currentTarget.dataset.watch, '_blank', 'noopener'));
    } catch (error) {
        console.error('❌ Error loading top moment:', error);
        container.style.display = 'none';
    }
}

// ========================================
// RIGHT SIDEBAR - Live Matches Widget
// ========================================

async function loadLiveMatches() {
    const container = document.getElementById('liveMatchesWidget');
    
    try {
        // Match documents carry the real vote counts (see note above), so read them via /api/matches
        const allMatches = await matchesOnce();
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        if (liveMatches.length === 0) {
            container.innerHTML = '<p class="widget-loading">No live matches right now</p>';
            return;
        }
        
        // Clear container
        container.innerHTML = '';
        
        // Render up to 3 live matches using match cards
        liveMatches.slice(0, 3).forEach(match => {
            // Transform API data to match card format
            const matchData = transformToMatchCardFormat(match);
            
            // Create match card (reusing existing renderer)
            const card = createMatchCard(matchData);
            
            // Make it compact for widget
            card.classList.add('widget-match-card');
            
            container.appendChild(card);
        });
        
        // Add "View All" link if more than 3
        if (liveMatches.length > 3) {
            const viewAllLink = document.createElement('a');
            viewAllLink.href = '/matches';
            viewAllLink.className = 'widget-view-all';
            viewAllLink.innerHTML = `<i class="fa-solid fa-arrow-right"></i> View all ${liveMatches.length} matches`;
            container.appendChild(viewAllLink);
        }
        
        console.log('✅ Live matches loaded');
        
    } catch (error) {
        console.error('❌ Error loading live matches:', error);
        container.innerHTML = '<p class="widget-loading">Failed to load matches</p>';
    }
}

function pctOf(votes, total) {
    return total > 0 ? Math.round(((votes || 0) / total) * 100) : 50;
}

// Transform a match document (from /api/matches) to match card format
function transformToMatchCardFormat(apiMatch) {
    return {
        id: apiMatch.id || apiMatch.matchId,
        // show the readable name ("Arcane Test 01") and round name ("Final"), not the raw id and round number
        tournament: apiMatch.tournamentName || apiMatch.tournament || ARCANE_CONFIG.tournamentId,
        round: apiMatch.round,
        roundLabel: apiMatch.roundLabel || null,
        status: apiMatch.status,
        date: apiMatch.startDate,
        endDate: apiMatch.endDate,
        totalVotes: apiMatch.totalVotes || 0,
        // vote.js remembers each vote locally under this key
        hasVoted: !!localStorage.getItem(`vote_${ARCANE_CONFIG.tournamentId}_${apiMatch.id || apiMatch.matchId}`),
        
        competitor1: {
            seed: apiMatch.song1?.seed || 1,
            name: apiMatch.song1?.shortTitle || apiMatch.song1?.title || 'Moment 1',
            source: apiMatch.song1?.artist || 'Artist',
            videoId: apiMatch.song1?.videoId,
            votes: apiMatch.song1?.votes || 0,
            percentage: pctOf(apiMatch.song1?.votes, apiMatch.totalVotes),
            leading: (apiMatch.song1?.votes || 0) > (apiMatch.song2?.votes || 0)
        },
        
        competitor2: {
            seed: apiMatch.song2?.seed || 2,
            name: apiMatch.song2?.shortTitle || apiMatch.song2?.title || 'Moment 2',
            source: apiMatch.song2?.artist || 'Artist',
            videoId: apiMatch.song2?.videoId,
            votes: apiMatch.song2?.votes || 0,
            percentage: pctOf(apiMatch.song2?.votes, apiMatch.totalVotes),
            leading: (apiMatch.song2?.votes || 0) > (apiMatch.song1?.votes || 0)
        }
    };
}

// ========================================
// RIGHT SIDEBAR - Recent Activity Widget
// ========================================

async function loadRecentActivity() {
    const container = document.getElementById('recentActivityWidget');

    try {
        // Newest first, a few extra so that votes from earlier (test) cups can be dropped and still leave five.
        const snapshot = await getDocs(query(collection(db, 'activity'), orderBy('timestamp', 'desc'), limit(40)));
        const cup = ARCANE_CONFIG.tournamentId;
        const activities = snapshot.docs
            .map(doc => doc.data())
            .filter(a => a.isPublic !== false)
            // this cup only: new votes carry tournamentId, and every match id starts with its cup id
            .filter(a => a.tournamentId === cup || String(a.matchId || '').startsWith(cup + '-'))
            .slice(0, 5);

        if (activities.length === 0) {
            container.innerHTML = '<p class="widget-loading">No recent activity</p>';
            return;
        }

        container.innerHTML = activities.map(activity => {
            const title = truncate(shortTitle(activity.songTitle || '', 40), 18);
            // songId on an activity is the video id of the edit that was voted for
            const thumb = activity.songId ? `https://img.youtube.com/vi/${encodeURIComponent(activity.songId)}/mqdefault.jpg` : null;
            return `
                <a class="activity-item-mini" href="/vote?match=${encodeURIComponent(activity.matchId)}">
                    <img src="${esc(getAvatarUrl(activity.avatar))}" alt="" class="activity-avatar-mini">
                    <div class="activity-info-mini">
                        <div class="activity-username">${esc(activity.username)}</div>
                        <div class="activity-action">voted for ${esc(title)}</div>
                        <div class="activity-time">${getTimeAgo(activity.timestamp)}</div>
                    </div>
                    ${thumb ? `<img src="${thumb}" alt="" class="activity-song-thumbnail" loading="lazy">` : ''}
                </a>`;
        }).join('');
    } catch (error) {
        console.error('❌ Error loading recent activity:', error);
        container.innerHTML = '<p class="widget-loading">Failed to load activity</p>';
    }
}

// ========================================
// RIGHT SIDEBAR - Tournament Stats Widget
// ========================================

async function loadTournamentStats() {
    try {
        // Everything comes from the match list (its vote counters). The old version also read EVERY vote document in the
        // database to count voters: thousands of reads for every visitor, and it counted voters from earlier test cups.
        const allMatches = await matchesOnce();
        const totalVotes = allMatches.reduce((sum, m) => sum + (m.totalVotes || 0), 0);
        const live = allMatches.filter(m => m.status === 'live').length;
        const completed = allMatches.filter(m => m.status === 'completed').length;

        document.getElementById('widgetTotalVotes').textContent = totalVotes.toLocaleString();
        document.getElementById('widgetLiveMatches').textContent = live.toLocaleString();
        document.getElementById('widgetCompletedMatches').textContent = completed.toLocaleString();
    } catch (error) {
        console.error('❌ Error loading tournament stats:', error);
    }
}

// ========================================
// SETUP SIDEBAR INTERACTIONS
// ========================================

export function setupSidebarInteractions() {
    console.log('🔧 Setting up sidebar interactions...');
    
    // Make entire profile card clickable
    const profileCard = document.querySelector('.sidebar-profile-card');
    if (profileCard) {
        profileCard.style.cursor = 'pointer';
        profileCard.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
        
        profileCard.addEventListener('click', (e) => {
            // Don't trigger if clicking on a button or link inside
            if (e.target.closest('button, a, .sidebar-actions')) return;
            
            window.location.href = '/profile.html';
        });
        
        profileCard.addEventListener('mouseenter', () => {
            profileCard.style.transform = 'translateY(-2px)';
            profileCard.style.boxShadow = '0 6px 16px rgba(255, 79, 180, 0.15)';
        });
        
        profileCard.addEventListener('mouseleave', () => {
            profileCard.style.transform = 'translateY(0)';
            profileCard.style.boxShadow = '';
        });
        
        console.log('✅ Profile card now clickable');
    }
    
    // Wait for notification center to be ready
    setTimeout(() => {
        // Notifications button
const notifBtn = document.getElementById('sidebarNotifications');
        if (notifBtn) {
            notifBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent card click
                console.log('🔔 Notifications clicked');
                
                if (window.openNotificationPanel) {
                    window.openNotificationPanel();
                } else {
                    console.warn('⚠️ Notification panel not ready yet');
                }
            });
            console.log('✅ Notifications button handler attached');
        }
        
        // Messages button - opens notifications and switches to messages tab
        const msgBtn = document.getElementById('sidebarMessages');
        if (msgBtn) {
            msgBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent card click
                console.log('💬 Messages clicked');
                
                if (window.openNotificationPanel) {
                    window.openNotificationPanel();
                    
                    // Switch to messages tab after panel opens
                    setTimeout(() => {
                        const messagesTab = document.querySelector('[data-tab="messages"]');
                        if (messagesTab) {
                            messagesTab.click();
                        }
                    }, 150);
                } else {
                    console.warn('⚠️ Notification panel not ready yet');
                }
            });
            console.log('✅ Messages button handler attached');
        }
    }, 500); // Wait 500ms for notification center to initialize
}

// ========================================
// UTILITIES
// ========================================

function truncate(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function getAvatarUrl(avatar) {
    if (!avatar) {
        return createEmojiAvatar('🎵');
    }
    
    if (avatar.type === 'url') return fixAvatarUrl(avatar.value);
    if (avatar.type === 'champion') return fixAvatarUrl(avatar.imageUrl);
    if (avatar.type === 'emoji') return createEmojiAvatar(avatar.value);
    
    return createEmojiAvatar('🎵');
}

function createEmojiAvatar(emoji) {
    return `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50">
            <rect width="50" height="50" fill="#ff4fb4"/>
            <text x="25" y="35" text-anchor="middle" font-size="30">${emoji}</text>
        </svg>
    `)}`;
}

console.log('✅ Feed widgets module loaded');