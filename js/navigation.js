// ========================================
// NAVIGATION WITH RANK SYSTEM + PROFILE + NOTIFICATIONS
// ========================================

import { getUserXPFromStorage, getUserRank } from './rank-system.js';
import { initNotificationCenter } from './notification-center.js';  // STEP 6A: Added

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

document.addEventListener('DOMContentLoaded', function() {
    console.log('Navigation DOMContentLoaded fired');
    
   const navHTML = `
    <nav class="main-nav">
        <div class="nav-container">
            <a href="/index.html" class="logo-link">
                <img src="/images/logo-header.png" alt="Anthem Arena" class="site-logo">
            </a>
          <ul class="nav-links">
    <li><a href="/">Home</a></li>
    <li><a href="/feed.html">
        <i class="fa-solid fa-users"></i>
        Feed
    </a></li>
    <li><a href="/matches">Matches</a></li>
    
    <li class="nav-separator"></li>
    
    <li><a href="/brackets">Brackets</a></li>
    <li><a href="/music-gallery">Gallery</a></li>
    
    <li class="nav-separator"></li>
    
    <li><a href="/stats">Stats</a></li>
    <li><a href="/activity.html">
        <i class="fa-solid fa-bolt"></i>
        Live
    </a></li>
</ul>
            
            <!-- PROFILE + RANK DISPLAY WITH SETTINGS ICON -->
            <div class="nav-profile-container" id="navProfileContainer" style="display: none;">
                <a href="#" class="nav-profile-card" id="navProfileCard" title="Profile Settings" onclick="window.openSettingsModal(); return false;">
                    <div class="profile-avatar" id="navProfileAvatar">
                        Music Note
                    </div>
                    
                    <!-- Notification Bell -->
                    <div class="notification-bell" id="notificationBell" style="position: relative; cursor: pointer; margin-right: 16px;">
                        <span style="font-size: 20px;">🔔</span>
                        <span class="notification-badge" id="notificationBadge" style="display: none; position: absolute; top: -5px; right: -8px; background: #e74c3c; color: white; border-radius: 10px; padding: 2px 6px; font-size: 11px; font-weight: bold;">0</span>
                    </div>
                    
                    <div class="profile-info">
                        <div class="profile-username" id="navProfileUsername">Guest</div>
                        <div class="profile-rank-mini">
                            <div class="rank-progress-bar">
                                <div class="rank-progress-fill" id="navRankProgress" style="width: 0%"></div>
                            </div>
                            <span class="rank-level-text" id="navRankLevel">Lv. 1</span>
                        </div>
                    </div>
                    <i class="fas fa-cog profile-settings-icon"></i>
                </a>
            </div>
            
            <button class="mobile-menu-toggle" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
        </div>

        <!-- Notification Panel -->
        <div id="notificationPanel" class="notification-panel" style="display: none;">
            <div class="notification-panel-header">
                <h3>Notifications</h3>
                <button id="closeNotificationPanel" class="close-btn">X</button>
            </div>
            
            <div class="notification-panel-content" id="notificationPanelContent">
                <div class="notification-empty">
                    <span style="font-size: 48px; opacity: 0.3;">🔔</span>
                    <p>No new notifications</p>
                </div>
            </div>
        </div>

        <div id="notificationOverlay" class="notification-overlay" style="display: none;"></div>
    </nav>
    `;
    
    document.getElementById('nav-placeholder').innerHTML = navHTML;
    console.log('Navigation HTML injected');
    
    // Auto-highlight current page
    const currentPath = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav-links a').forEach(link => {
        const linkPath = link.getAttribute('href').replace(/\/$/, '') || '/';
        
        const normalizedCurrent = currentPath === '' ? '/' : currentPath;
        const normalizedLink = linkPath === '' ? '/' : linkPath;
        
        if (normalizedCurrent === normalizedLink || 
            normalizedCurrent.startsWith(normalizedLink + '/') ||
            (normalizedLink === '/' && (normalizedCurrent === '/' || normalizedCurrent === '/index'))) {
            link.classList.add('active');
        }
    });
    
    // Mobile menu toggle
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileToggle) {
        mobileToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            mobileToggle.classList.toggle('active');
            document.body.classList.toggle('menu-open');
        });
        
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.main-nav')) {
                navLinks.classList.remove('active');
                mobileToggle.classList.remove('active');
                document.body.classList.remove('menu-open');
            }
        });
        
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', function() {
                navLinks.classList.remove('active');
                mobileToggle.classList.remove('active');
                document.body.classList.remove('menu-open');
            });
        });
    }
    
    // LOAD PROFILE + RANK DISPLAY
    console.log('Calling updateNavProfile...');
    updateNavProfile();

    // STEP 6B: Initialize notification center after nav is ready
    initNotificationCenter();
});

// ========================================
// UPDATE NAVIGATION PROFILE + RANK DISPLAY
// ========================================

async function updateNavProfile() {
    const navProfileContainer = document.getElementById('navProfileContainer');
    const navProfileCard = document.getElementById('navProfileCard');
    
    console.log('Updating nav profile display...');
    
    if (!navProfileCard || !navProfileContainer) {
        console.error('Profile elements not found in DOM');
        return;
    }
    
    try {
        // Get user ID
        const userId = localStorage.getItem('tournamentUserId');
        
        // Try to get username from localStorage first
        let username = localStorage.getItem('username') || localStorage.getItem('tournamentUsername');
        let avatarJson = localStorage.getItem('avatar');
        let avatar;
        
        // If not in localStorage, try loading from Firebase
        if (!username && userId) {
            console.log('Loading profile from Firebase...');
            try {
                const { db } = await import('./firebase-config.js');
                const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                
                const profileDoc = await getDoc(doc(db, 'profiles', userId));
                
                if (profileDoc.exists()) {
                    const profile = profileDoc.data();
                    username = profile.username;
                    avatar = profile.avatar;
                    
                    // Sync to localStorage for future
                    localStorage.setItem('username', username);
                    localStorage.setItem('tournamentUsername', username);
                    localStorage.setItem('avatar', JSON.stringify(avatar));
                    
                    console.log('Profile loaded from Firebase:', username);
                }
            } catch (error) {
                console.warn('Could not load profile from Firebase:', error);
            }
        }
        
        // Parse avatar if from localStorage
        if (!avatar && avatarJson) {
            try {
                avatar = JSON.parse(avatarJson);
            } catch {
                avatar = { type: 'emoji', value: 'Music Note' };
            }
        }
        
        // Check if user has voted (check BOTH localStorage AND Firebase)
        const userVotesLocal = JSON.parse(localStorage.getItem('userVotes') || '{}');
        const hasVotedLocal = Object.keys(userVotesLocal).length > 0;
        
        let hasVotedFirebase = false;
        
        if (userId && !hasVotedLocal) {
            console.log('Checking Firebase for votes...');
            try {
                const { db } = await import('./firebase-config.js');
                const { collection, query, where, getDocs, limit } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                
                const votesQuery = query(
                    collection(db, 'votes'), 
                    where('userId', '==', userId),
                    limit(1)
                );
                const votesSnapshot = await getDocs(votesQuery);
                hasVotedFirebase = !votesSnapshot.empty;
                
                if (hasVotedFirebase) {
                    console.log('User has votes in Firebase');
                }
            } catch (error) {
                console.warn('Could not check Firebase votes:', error);
            }
        }
        
        const hasVoted = hasVotedLocal || hasVotedFirebase;
        
        // ========================================
        // STATE 1: NOT VOTED YET - Show Locked Profile
        // ========================================
        
        if (!hasVoted) {
            console.log("User hasn't voted yet - showing locked state");
            
            navProfileCard.innerHTML = `
                <div class="profile-locked-state">
                    <div class="locked-icon">Locked</div>
                    <div class="locked-info">
                        <div class="locked-title">Profile Locked</div>
                        <div class="locked-subtitle">Vote to unlock!</div>
                    </div>
                </div>
            `;
            
            navProfileCard.title = 'Cast your first vote to unlock your profile and start earning XP!';
            navProfileCard.style.cursor = 'default';
            navProfileCard.onclick = (e) => {
                e.preventDefault();
                if (window.showNotification) {
                    window.showNotification('Cast your first vote to unlock your profile!', 'info');
                }
            };
            
            navProfileContainer.style.display = 'flex';
            return;
        }
        
        // ========================================
        // STATE 2: VOTED BUT NO USERNAME - Show Claim Profile
        // ========================================
        
        if (!username) {
            console.log('User has voted but no username - showing claim prompt');
            
            navProfileCard.innerHTML = `
                <div class="profile-claim-state">
                    <div class="claim-icon">Sparkles</div>
                    <div class="claim-info">
                        <div class="claim-title">Claim Your Profile!</div>
                        <div class="claim-subtitle">Set username & avatar</div>
                    </div>
                    <div class="claim-arrow">Right Arrow</div>
                </div>
            `;
            
            navProfileCard.title = 'Click to set your username and claim your profile!';
            navProfileCard.style.cursor = 'pointer';
            navProfileCard.onclick = (e) => {
                e.preventDefault();
                window.openSettingsModal();
            };
            
            navProfileContainer.style.display = 'flex';
            return;
        }
        
        // ========================================
        // STATE 3: FULL PROFILE - Show Normal Profile
        // ========================================

        console.log('Showing full profile for:', username);

        // Restore original profile card HTML
        navProfileCard.innerHTML = `
            <a href="/profile?user=${username}" class="nav-profile-link" title="View Your Profile">
                <div class="profile-avatar" id="navProfileAvatar">
                    ${avatar && avatar.type === 'url' 
                        ? `<img src="${avatar.value}" alt="Avatar" class="nav-avatar-img" 
                               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                           <span class="nav-avatar-fallback" style="display: none;">Music Note</span>`
                        : `<span class="nav-avatar-emoji">${avatar?.value || 'Music Note'}</span>`
                    }
                </div>
                
                <div class="profile-info">
                    <div class="profile-username" id="navProfileUsername">${username}</div>
                    <div class="profile-rank-mini">
                        <div class="rank-progress-bar">
                            <div class="rank-progress-fill" id="navRankProgress" style="width: 0%"></div>
                        </div>
                        <span class="rank-level-text" id="navRankLevel">Lv. 1</span>
                    </div>
                </div>
            </a>
            
            <!-- Notification Bell -->
            <div class="notification-bell" id="notificationBell" style="position: relative; cursor: pointer;">
                <span style="font-size: 20px;">🔔</span>
                <span class="notification-badge" id="notificationBadge" style="display: none; position: absolute; top: -5px; right: -8px; background: #e74c3c; color: white; border-radius: 10px; padding: 2px 6px; font-size: 11px; font-weight: bold;">0</span>
            </div>
            
            <!-- Settings Button -->
            <button class="nav-settings-btn" onclick="window.openSettingsModal()" title="Profile Settings">
                <i class="fas fa-cog"></i>
            </button>
        `;

        // Remove old onclick handler
        navProfileCard.onclick = null;

        // Update rank display
        const currentXP = getUserXPFromStorage();

        if (currentXP > 0) {
            const rank = getUserRank(currentXP);
            
            const levelEl = document.getElementById('navRankLevel');
            const progressEl = document.getElementById('navRankProgress');
            
            if (levelEl) {
                levelEl.textContent = `Lv. ${rank.currentLevel.level}`;
            }
            
            if (progressEl) {
                progressEl.style.width = `${rank.progressPercentage}%`;
            }
            
            const cleanTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
            const profileLink = navProfileCard.querySelector('.nav-profile-link');
            if (profileLink) {
                if (rank.nextLevel) {
                    profileLink.title = `${cleanTitle} - Level ${rank.currentLevel.level}\n${currentXP.toLocaleString()} XP (${rank.progressXP}/${rank.xpForNextLevel} to next level)\n\nClick to view your profile`;
                } else {
                    profileLink.title = `${cleanTitle} - Level ${rank.currentLevel.level}\n${currentXP.toLocaleString()} XP (Maximum level!)\n\nClick to view your profile`;
                }
            }
        }

        navProfileContainer.style.display = 'flex';
        console.log('Profile display updated successfully');

    } catch (err) {
        console.error('Unexpected error in updateNavProfile:', err);
    }
} // ← This closes the async function
  // ← This was missing in your original code!

// ========================================
// EXPORT FOR USE IN OTHER FILES
// ========================================

export { updateNavProfile };

window.updateNavProfile = updateNavProfile;

window.updateNavRank = updateNavProfile;