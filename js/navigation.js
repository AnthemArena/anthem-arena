// ========================================
// NAVIGATION WITH RANK SYSTEM
// ========================================

import { getUserXPFromStorage, getUserRank, calculateUserXP } from './rank-system.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase-config.js';

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

document.addEventListener('DOMContentLoaded', function() {
    console.log('🧭 Navigation DOMContentLoaded fired');
    
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
            </ul>
            
            <!-- ✅ RANK DISPLAY -->
            <div class="nav-rank-container" id="navRankContainer" style="display: none;">
                <a href="/my-votes" class="nav-rank-mini" id="navRankMini" title="Your rank">
                    <div class="rank-level-badge">
                        <span class="rank-level-number">1</span>
                    </div>
                    <div class="rank-mini-info">
                        <div class="rank-mini-progress">
                            <div class="rank-mini-bar" style="width: 0%"></div>
                        </div>
                        <span class="rank-mini-title">New Voter</span>
                    </div>
                </a>
            </div>
            
            <button class="mobile-menu-toggle" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
        </div>
    </nav>
    `;
    
    document.getElementById('nav-placeholder').innerHTML = navHTML;
    console.log('✅ Navigation HTML injected');
    
    // Auto-highlight current page
    const currentPath = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav-links a').forEach(link => {
        const linkPath = link.getAttribute('href').replace(/\/$/, '') || '/';
        
        // Normalize paths for comparison
        const normalizedCurrent = currentPath === '' ? '/' : currentPath;
        const normalizedLink = linkPath === '' ? '/' : linkPath;
        
        // Check if current page matches link
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
        
        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.main-nav')) {
                navLinks.classList.remove('active');
                mobileToggle.classList.remove('active');
                document.body.classList.remove('menu-open');
            }
        });
        
        // Close menu when clicking a link
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', function() {
                navLinks.classList.remove('active');
                mobileToggle.classList.remove('active');
                document.body.classList.remove('menu-open');
            });
        });
    }
    
    // ✅ LOAD RANK DISPLAY
    console.log('🎯 Calling updateNavRank...');
    updateNavRank();
});

// ========================================
// UPDATE NAVIGATION RANK DISPLAY
// ========================================

async function updateNavRank() {
    const navRankContainer = document.getElementById('navRankContainer');
    const navRank = document.getElementById('navRankMini');
    
    console.log('🔍 === RANK DEBUG START ===');
    console.log('Container exists:', !!navRankContainer);
    console.log('Rank element exists:', !!navRank);
    
    if (!navRank || !navRankContainer) {
        console.error('❌ Rank elements not found in DOM');
        return;
    }
    
    try {
        // Get user ID
        const userId = localStorage.getItem('voterId');
        console.log('User ID:', userId);
        
        if (!userId) {
            console.warn('⚠️ No voter ID found');
            navRankContainer.style.display = 'none';
            return;
        }
        
        // Try to get cached XP first (for instant display)
        const cachedXP = getUserXPFromStorage();
        console.log('Cached XP:', cachedXP);
        
        if (cachedXP > 0) {
            console.log('✅ Displaying cached rank');
            displayRank(cachedXP);
            navRankContainer.style.display = 'flex';  // ✅ Changed to 'flex'
        }
        
        // Then fetch real data from Firebase
        console.log('📡 Fetching votes from Firebase...');
        const votesRef = collection(db, 'votes');
        const userVotesQuery = query(
            votesRef,
            where('userId', '==', userId),
            where('tournament', '==', ACTIVE_TOURNAMENT)
        );
        
        const snapshot = await getDocs(userVotesQuery);
        console.log('Votes found:', snapshot.size);
        
        if (snapshot.empty) {
            console.warn('⚠️ No votes found for user');
            navRankContainer.style.display = 'none';
            return;
        }
        
        const allVotes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log('All votes:', allVotes);
        
        // Calculate XP and rank
        const xpData = calculateUserXP(allVotes);
        console.log('XP Data:', xpData);
        
        // Update display
        displayRank(xpData.totalXP);
        navRankContainer.style.display = 'flex';  // ✅ Changed to 'flex'
        
        // Save to localStorage for faster subsequent loads
        localStorage.setItem('userTotalXP', xpData.totalXP.toString());
        
        console.log('✅ Rank display updated successfully');
        console.log('🔍 === RANK DEBUG END ===');
        
    } catch (error) {
        console.error('❌ Error updating nav rank:', error);
        console.error('Error details:', error.message);
        navRankContainer.style.display = 'none';
    }
}

function displayRank(xp) {
    const navRank = document.getElementById('navRankMini');
    if (!navRank) return;
    
    const rank = getUserRank(xp);
    
    // Update level number
    const levelNumber = navRank.querySelector('.rank-level-number');
    if (levelNumber) {
        levelNumber.textContent = rank.currentLevel.level;
    }
    
    // Update progress bar
    const progressBar = navRank.querySelector('.rank-mini-bar');
    if (progressBar) {
        progressBar.style.width = `${rank.progressPercentage}%`;
    }
    
    // Update title (remove emoji for cleaner look in nav)
    const titleSpan = navRank.querySelector('.rank-mini-title');
    if (titleSpan) {
        const cleanTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
        titleSpan.textContent = cleanTitle;
    }
    
    // Update tooltip
    if (rank.nextLevel) {
        navRank.title = `${rank.currentLevel.title} - Level ${rank.currentLevel.level}\n${xp.toLocaleString()} XP (${rank.progressXP}/${rank.xpForNextLevel} to next level)`;
    } else {
        navRank.title = `${rank.currentLevel.title} - Level ${rank.currentLevel.level}\n${xp.toLocaleString()} XP (Maximum level!)`;
    }
}

// ========================================
// EXPORT FOR USE IN OTHER FILES
// ========================================

export { updateNavRank };