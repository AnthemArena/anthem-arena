// ========================================
// API CLIENT - USES NETLIFY EDGE CACHE
// All Firebase reads go through this layer
// ========================================

const API_BASE = '/api';

/**
 * Fetch all matches (cached at Netlify edge)
 */
export async function getAllMatches() {
    try {
        console.log('📡 Fetching matches from edge cache...');
        
        const response = await fetch(`${API_BASE}/matches`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Check if served from cache
        const cacheStatus = response.headers.get('X-Cache');
        console.log(`✅ Matches loaded (Cache: ${cacheStatus || 'UNKNOWN'})`);
        
        return Array.isArray(data) ? data : [];
        
    } catch (error) {
        console.error('❌ Error fetching matches:', error);
        throw error;
    }
}

/**
 * Fetch single match (cached at edge)
 */
export async function getMatch(matchId) {
    try {
        console.log(`📡 Fetching match ${matchId} from edge cache...`);
        
        const response = await fetch(`${API_BASE}/match/${matchId}`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        const cacheStatus = response.headers.get('X-Cache');
        console.log(`✅ Match loaded (Cache: ${cacheStatus || 'UNKNOWN'})`);
        
        return data;
        
    } catch (error) {
        console.error('❌ Error fetching match:', error);
        throw error;
    }
}

/**
 * Submit vote (direct to Firebase - no cache)
 * This still uses Firebase SDK for writes
 */
export async function submitVote(matchId, songId) {
    // Import Firebase for direct write
    const { db } = await import('./firebase-config.js');
    const { doc, updateDoc, increment } = await import(
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
    );
    
    try {
        const matchRef = doc(db, `tournaments/2025-worlds-anthems/matches/${matchId}`);
        
        await updateDoc(matchRef, {
            [`song${songId}.votes`]: increment(1),
            totalVotes: increment(1)
        });
        
        console.log('✅ Vote submitted successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Error submitting vote:', error);
        throw error;
    }
}

console.log('✅ API Client loaded - using Netlify Edge cache');