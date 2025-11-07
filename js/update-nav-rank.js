// ========================================
// UPDATE NAVIGATION RANK DISPLAY
// ========================================

import { getUserXPFromStorage, getUserRank, calculateUserXP } from './rank-system.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase-config.js';

const ACTIVE_TOURNAMENT = 'league-music-2024';

export async function updateNavRank() {
    const navRank = document.getElementById('navRankMini');
    if (!navRank) return;
    
    try {
        // Get user ID
        const userId = localStorage.getItem('voterId');
        if (!userId) {
            hideNavRank();
            return;
        }
        
        // Calculate XP from votes
        const votesRef = collection(db, 'votes');
        const userVotesQuery = query(
            votesRef,
            where('userId', '==', userId),
            where('tournament', '==', ACTIVE_TOURNAMENT)
        );
        
        const snapshot = await getDocs(userVotesQuery);
        const allVotes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Calculate XP and rank
        const xpData = calculateUserXP(allVotes);
        const rank = getUserRank(xpData.totalXP);
        
        // Update display
        navRank.querySelector('.rank-level-number').textContent = rank.currentLevel.level;
        navRank.querySelector('.rank-mini-bar').style.width = `${rank.progressPercentage}%`;
        navRank.querySelector('.rank-mini-title').textContent = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
        
        // Update tooltip
        navRank.title = `${rank.currentLevel.title} - Level ${rank.currentLevel.level}\n${xpData.totalXP} XP ${rank.nextLevel ? `(${rank.progressXP}/${rank.xpForNextLevel} to next)` : '(MAX)'}`;
        
        // Save XP to localStorage for faster subsequent loads
        localStorage.setItem('userTotalXP', xpData.totalXP.toString());
        
    } catch (error) {
        console.error('Error updating nav rank:', error);
    }
}

function hideNavRank() {
    const navRank = document.getElementById('navRankMini');
    if (navRank) {
        navRank.style.display = 'none';
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', () => {
    updateNavRank();
});