// ========================================
// NAVIGATION WITH RANK SYSTEM + PROFILE + NOTIFICATIONS
// ========================================

import { escapeHtml, safeImageUrl } from './html-escape.js';
import { getUserXPFromStorage, getUserRank, hydrateXpFromProfile } from './rank-system.js';

import { ARCANE_CONFIG } from './arcane-config.js';
import { fixAvatarUrl } from './avatar-url.js';
import { announcePendingChampion } from './champion-selected.js';
import { visitorHasVoted } from './voter-state.js';
const ACTIVE_TOURNAMENT = ARCANE_CONFIG.tournamentId;

// Bell icon: inline SVG so it takes the theme colour (the old 🔔 emoji was always yellow)
const BELL_ICON = '<svg class="nav-bell-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6v-5a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z"/></svg>';

// The bell is a div: give it a name and make it work from the keyboard
function labelBell() {
    const bell = document.getElementById('notificationBell');
    if (!bell || bell.dataset.labelled) return;
    bell.dataset.labelled = '1';
    bell.setAttribute('role', 'button'); bell.setAttribute('tabindex', '0'); bell.setAttribute('aria-label', 'Notifications');
    bell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bell.click(); } });
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Navigation DOMContentLoaded fired');
    
   const navHTML = `
<nav class="main-nav" aria-label="Main">
    <div class="nav-container">
        <a href="/index.html" class="logo-link">
            <img src="/logo.png" alt="Arcane Moments" class="site-logo">
        </a>
        
        <ul class="nav-links" id="navLinks">
            <li><a href="/">Home</a></li>
            <li><a href="/feed.html">Feed</a></li>
            <li><a href="/matches">Matches</a></li>
            <li><a href="/brackets">Brackets</a></li>
            <li><a href="/music-gallery">Gallery</a></li>
            <li><a href="/stats">Stats</a></li>
        </ul>
        
        <!-- BELL + ACCOUNT (filled by updateNavProfile) -->
        <div class="nav-profile-container" id="navProfileContainer" style="display: none;">
            <div class="nav-profile-card" id="navProfileCard"></div>
        </div>
        
        <button class="mobile-menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="navLinks">
            <span class="hamburger"></span>
        </button>
    </div>
</nav>

<!-- Dimmed backdrop behind the phone menu (below the sticky bar, above the page) -->
<div class="nav-scrim" id="navScrim" hidden></div>

<!-- ✅ Notification System (OUTSIDE nav, appended to body) -->
<div id="notificationOverlay" class="notification-overlay" style="display: none;"></div>

<div id="notificationPanel" class="notification-panel" style="display: none;">
    <div class="notification-panel-header">
        <h3>Notifications</h3>
        <button id="closeNotificationPanel" class="close-btn">×</button>
    </div>
    
    <div class="notification-panel-content" id="notificationPanelContent">
        <div class="notification-empty">
            <span style="font-size: 48px; opacity: 0.3;">🔔</span>
            <p>No new notifications</p>
        </div>
    </div>
</div>
`;
    
    document.getElementById('nav-placeholder').innerHTML = navHTML;
    console.log('✅ Navigation HTML injected');
    
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
    
    // Mobile menu + account menu: one open at a time; Esc, the backdrop or a link closes; focus goes in and back out.
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    const scrim = document.getElementById('navScrim');
    const navEl = document.querySelector('.main-nav');
    const setNavHeight = () => document.documentElement.style.setProperty('--nav-h', `${Math.round(navEl.getBoundingClientRect().height)}px`);
    setNavHeight();
    window.addEventListener('resize', setNavHeight);

    const mobileOpen = () => navLinks.classList.contains('active');
    function closeMobileMenu({ restoreFocus = false } = {}) {
        if (!mobileOpen()) return;
        navLinks.classList.remove('active');
        mobileToggle.classList.remove('active');
        document.body.classList.remove('menu-open');
        scrim.classList.remove('show');
        setTimeout(() => { if (!mobileOpen()) scrim.hidden = true; }, 220);
        if (restoreFocus) mobileToggle.focus();
    }
    function openMobileMenu() {
        closeUserMenu();
        setNavHeight();
        scrim.hidden = false;
        requestAnimationFrame(() => scrim.classList.add('show'));
        navLinks.classList.add('active');
        mobileToggle.classList.add('active');
        document.body.classList.add('menu-open');   // locks page scroll (CSS)
        navLinks.querySelector('a')?.focus({ preventScroll: true });
    }
    window.__navCloseMobileMenu = closeMobileMenu;

    // account menu (avatar): Profile, My votes, Settings
    const userMenuBtn = () => document.getElementById('navAvatarBtn');
    const userMenu = () => document.getElementById('navUserMenu');
    const userMenuOpen = () => { const m = userMenu(); return !!m && !m.hidden; };
    function closeUserMenu({ restoreFocus = false } = {}) {
        const m = userMenu(), b = userMenuBtn();
        if (!m || m.hidden) return;
        m.hidden = true;
        b?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) b?.focus();
    }
    function openUserMenu() {
        const m = userMenu(), b = userMenuBtn();
        if (!m || !b) return;
        closeMobileMenu();
        m.hidden = false;
        b.setAttribute('aria-expanded', 'true');
        m.querySelector('[role=menuitem]')?.focus();
    }
    window.__navCloseUserMenu = closeUserMenu;

    if (mobileToggle) {
        const sync = () => mobileToggle.setAttribute('aria-expanded', String(mobileOpen()));
        new MutationObserver(sync).observe(navLinks, { attributes: true, attributeFilter: ['class'] });
        mobileToggle.addEventListener('click', () => { mobileOpen() ? closeMobileMenu() : openMobileMenu(); });
        scrim.addEventListener('click', () => closeMobileMenu({ restoreFocus: true }));
        navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMobileMenu()));
    }

    // delegated: the avatar button is redrawn by updateNavProfile
    document.addEventListener('click', function (e) {
        const btn = e.target.closest?.('#navAvatarBtn');
        if (btn) { e.preventDefault(); userMenuOpen() ? closeUserMenu() : openUserMenu(); return; }
        const item = e.target.closest?.('#navUserMenu [role=menuitem]');
        if (item) {
            closeUserMenu();
            if (item.id === 'navMenuSettings') window.openSettingsModal?.();
            return;
        }
        if (!e.target.closest('.nav-avatar-menu')) closeUserMenu();
        if (!e.target.closest('.main-nav') && !e.target.closest('#navScrim')) closeMobileMenu();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (userMenuOpen()) { closeUserMenu({ restoreFocus: true }); e.preventDefault(); }
            else if (mobileOpen()) { closeMobileMenu({ restoreFocus: true }); e.preventDefault(); }
            return;
        }
        const m = userMenu();
        if (m && !m.hidden && m.contains(document.activeElement) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            const items = [...m.querySelectorAll('[role=menuitem]')], i = items.indexOf(document.activeElement);
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next].focus();
        }
        if (e.key === 'Tab' && m && !m.hidden && !m.contains(document.activeElement) && document.activeElement !== userMenuBtn()) closeUserMenu();
    });
    // leaving the menu with Tab closes it
    document.addEventListener('focusin', e => { if (userMenuOpen() && !e.target.closest('.nav-avatar-menu')) closeUserMenu(); });
    // widening the window past the phone breakpoint closes the phone menu
    window.matchMedia('(min-width: 769px)').addEventListener?.('change', ev => { if (ev.matches) closeMobileMenu(); });
    
    // LOAD PROFILE + RANK DISPLAY
    console.log('Calling updateNavProfile...');
    await updateNavProfile();
    hydrateXpFromProfile();   // pull the saved XP back if this browser has less (redraws the nav when it changes)
    announcePendingChampion();   // a champion picked in Settings is announced after the save reloads the page

    // ✅ Initialize notification center AFTER navigation is fully rendered
    console.log('🔔 Initializing notification center...');
    
    setTimeout(async () => {
        try {
            const { initNotificationCenter } = await import('./notification-center.js');
            await initNotificationCenter();
            console.log('✅ Notification center initialized from navigation');
        } catch (error) {
            console.error('❌ Failed to initialize notification center:', error);
        }
    }, 200);
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
                avatar = { type: 'emoji', value: '👤' };
            }
        }
        
        // Repair a saved champion picture url that points at a missing file (e.g. "Lee Sin.png" -> "LeeSin.png")
        if (avatar && avatar.type === 'url' && fixAvatarUrl(avatar.value) !== avatar.value) {
            avatar = { ...avatar, value: fixAvatarUrl(avatar.value) };
            try { localStorage.setItem('avatar', JSON.stringify(avatar)); } catch { /* ignore */ }
        }

        // Everyone gets a profile straight away: no vote is needed to see it (this also saves a Firestore read on every page load).

        // ========================================
        // STATE 2: NO USERNAME YET - Show Claim Profile (With Bell)
        // ========================================
        
        if (!username) {
            console.log('No username yet - showing claim prompt');
            
           // Before the first vote the header has one loud thing, the vote button: the profile ask is a small outlined avatar button.
           // The first vote is the moment to ask, so after it the full card shows.
           const firstVisit = !visitorHasVoted();
           navProfileCard.innerHTML = `
    ${firstVisit ? `<div class="profile-claim-state is-small">
        <button type="button" class="claim-avatar" aria-label="Set your username and avatar"><span aria-hidden="true">👤</span></button>
    </div>` : `<div class="profile-claim-state" role="button" tabindex="0" aria-label="Claim your profile: set a username and avatar">
        <div class="claim-icon" aria-hidden="true">✨</div>
        <div class="claim-info">
            <div class="claim-title">Claim Your Profile!</div>
            <div class="claim-subtitle">Set username & avatar</div>
        </div>
        <div class="claim-arrow" aria-hidden="true">→</div>
    </div>`}
    
    <!-- ✅ Wrap bell in non-clickable container -->
    <div onclick="event.stopPropagation(); event.preventDefault();" 
         style="position: relative; margin: 0 12px; display: block;">
        <div class="notification-bell" id="notificationBell" 
             style="position: relative; cursor: pointer; display: block;">
            ${BELL_ICON}
            <span class="notification-badge" id="notificationBadge" 
                  style="display: none; position: absolute; top: -5px; right: -8px; background: #e74c3c; color: white; border-radius: 10px; padding: 2px 6px; font-size: 11px; font-weight: bold;">0</span>
        </div>
    </div>
`;
            
            navProfileCard.title = 'Click to set your username and claim your profile!';
            navProfileCard.style.cursor = 'pointer';
            navProfileCard.onclick = (e) => {
                e.preventDefault();
                window.openSettingsModal();
            };
            navProfileCard.onkeydown = (e) => {
                if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.profile-claim-state[role=button]')) { e.preventDefault(); window.openSettingsModal(); }
            };
            labelBell();
            
            navProfileContainer.style.display = 'flex';
            
            return;
        }
        
        // ========================================
        // STATE 3: FULL PROFILE - Show Normal Profile (With Bell)
        // ========================================

        console.log('Showing full profile for:', username);

     const profileHref = `/profile?user=${encodeURIComponent(username)}`;
     navProfileCard.innerHTML = `
    <!-- bell first, then the account menu button -->
    <div onclick="event.stopPropagation(); event.preventDefault();" class="nav-bell-wrap">
        <div class="notification-bell" id="notificationBell" 
             style="position: relative; cursor: pointer; display: block;">
            ${BELL_ICON}
            <span class="notification-badge" id="notificationBadge" 
                  style="display: none; position: absolute; top: -5px; right: -8px; background: #e74c3c; color: white; border-radius: 10px; padding: 2px 6px; font-size: 11px; font-weight: bold;">0</span>
        </div>
    </div>

    <div class="nav-avatar-menu">
        <button type="button" class="nav-avatar-btn" id="navAvatarBtn" aria-haspopup="menu" aria-expanded="false" aria-controls="navUserMenu" aria-label="Account menu for ${escapeHtml(username)}">
            <span class="profile-avatar" id="navProfileAvatar">
            ${avatar && avatar.type === 'url' 
                ? `<img src="${safeImageUrl(fixAvatarUrl(avatar.value))}" alt="" class="nav-avatar-img" 
                       onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                   <span class="nav-avatar-fallback" style="display: none;">👤</span>`
                : `<span class="nav-avatar-emoji">${escapeHtml(avatar?.value || '👤')}</span>`
            }
            </span>
            <span class="profile-info">
                <span class="profile-username" id="navProfileUsername">${escapeHtml(username)}</span>
                <span class="profile-rank-mini">
                    <span class="rank-progress-bar">
                        <span class="rank-progress-fill" id="navRankProgress" style="width: 0%"></span>
                    </span>
                    <span class="rank-level-text" id="navRankLevel">Lv. 1</span>
                </span>
            </span>
        </button>
        <div class="nav-user-menu" id="navUserMenu" role="menu" aria-label="Account" hidden>
            <div class="nav-user-menu-head">${escapeHtml(username)}</div>
            <a role="menuitem" href="${profileHref}" class="nav-user-menu-item">Profile</a>
            <a role="menuitem" href="/profile?tab=votes" class="nav-user-menu-item">My votes</a>
            <button role="menuitem" type="button" class="nav-user-menu-item" id="navMenuSettings">Settings</button>
        </div>
    </div>
`;

        // Remove any old onclick handlers
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
            const profileLink = navProfileCard.querySelector('.nav-avatar-btn');
            if (profileLink) {
                if (rank.nextLevel) {
                    profileLink.title = `${cleanTitle} - Level ${rank.currentLevel.level}\n${currentXP.toLocaleString()} XP (${rank.progressXP}/${rank.xpForNextLevel} to next level)\n\nClick to view your profile`;
                } else {
                    profileLink.title = `${cleanTitle} - Level ${rank.currentLevel.level}\n${currentXP.toLocaleString()} XP (Maximum level!)\n\nClick to view your profile`;
                }
            }
        }

        labelBell();
        navProfileContainer.style.display = 'flex';
        console.log('✅ Profile display updated successfully');

    } catch (err) {
        console.error('Unexpected error in updateNavProfile:', err);
    }
}

// ========================================
// EXPORT FOR USE IN OTHER FILES
// ========================================

export { updateNavProfile };

window.updateNavProfile = updateNavProfile;
window.updateNavRank = updateNavProfile;