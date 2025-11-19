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
                <li><a href="/my-votes">My Votes</a></li>
                <li><a href="/brackets">Brackets</a></li>
                <li><a href="/music-gallery">Music Gallery</a></li>
                <li><a href="/matches">Matches</a></li>
                <li><a href="/stats">Stats</a></li>
                <li><a href="/about">About</a></li>
                <li><a href="/activity.html" class="nav-link">
                    Community
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
                        <span style="font-size: 20px;">Bell</span>
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
                <button id="closeNotificationPanel" class="close-btn">Cross</button>
            </div>
            
            <div class="notification-panel-content" id="notificationPanelContent">
                <div class="notification-empty">
                    <span style="font-size: 48px; opacity: 0.3;">Bell</span>
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
        const username = localStorage.getItem('username');
        const avatarJson = localStorage.getItem('avatar');
        const currentXP = getUserXPFromStorage();
        
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        const hasVoted = Object.keys(userVotes).length > 0;
        
        if (!hasVoted) {
            console.log('User hasn\'t voted yet - hiding profile');
            navProfileContainer.style.display = 'none';
            return;
        }
        
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: 'Music Note' };
        }
        
        const avatarEl = document.getElementById('navProfileAvatar');
        if (avatarEl) {
            if (avatar && avatar.type === 'url') {
                avatarEl.innerHTML = `
                    <img src="${avatar.value}" alt="Avatar" class="nav-avatar-img" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                    <span class="nav-avatar-fallback" style="display: none;">Person</span>
                `;
            } else {
                avatarEl.textContent = avatar?.value || 'Music Note';
            }
        }
        
        const usernameEl = document.getElementById('navProfileUsername');
        if (usernameEl) {
            usernameEl.textContent = username || 'Voter';
        }
        
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
            if (rank.nextLevel) {
                navProfileCard.title = `${cleanTitle} - Level ${rank.currentLevel.level}\n${currentXP.toLocaleString()} XP (${rank.progressXP}/${rank.xpForNextLevel} to next level)`;
            } else {
                navProfileCard.title = `${cleanTitle} - Level ${rank.currentLevel.level}\n${currentXP.toLocaleString()} XP (Maximum level!)`;
            }
        }
        
        navProfileContainer.style.display = 'flex';
        console.log('Profile display updated successfully');
        
    } catch (error) {
        console.error('Error updating nav profile:', error);
        navProfileContainer.style.display = 'none';
    }
}

// ========================================
// EXPORT FOR USE IN OTHER FILES
// ========================================

export { updateNavProfile };

window.updateNavProfile = updateNavProfile;

window.updateNavRank = updateNavProfile;