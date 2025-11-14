// ========================================
// API CLIENT - USES NETLIFY EDGE CACHE
// All Firebase reads go through this layer
// ========================================

const API_BASE = '/api';

/**
 * Fetch all matches (cached at Netlify edge)
 */
export async function getAllMatches(bypassCache = false) {
    try {
        console.log('Fetching matches from edge cache...');
        
        const cacheBuster = bypassCache ? `?_refresh=${Date.now()}` : '';
        const url = `${API_BASE}/matches${cacheBuster}`;
        
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...(bypassCache && { 'Cache-Control': 'no-cache' })
            }
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        const cacheStatus = response.headers.get('X-Cache');
        console.log(`Matches loaded (Cache: ${cacheStatus || 'UNKNOWN'})`);
        
        return Array.isArray(data) ? data : [];
        
    } catch (error) {
        console.error('Error fetching matches:', error);
        throw error;
    }
}

/**
 * Fetch single match (cached at edge)
 */
export async function getMatch(matchId, bypassCache = false) {
    try {
        console.log(`📡 Fetching match ${matchId} from edge cache${bypassCache ? ' (BYPASS)' : ''}...`);
        
        // Add cache-busting timestamp if bypassing cache
        const cacheBuster = bypassCache ? `&_refresh=${Date.now()}` : '';
        
        const response = await fetch(`/api/matches?matchId=${matchId}${cacheBuster}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // Force fresh data if bypassing cache
                ...(bypassCache && { 'Cache-Control': 'no-cache' })
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

/**
 * Get total site-wide vote count (cached at edge)
 */
export async function getTotalVotes() {
    try {
        console.log('📊 Fetching total site votes...');
        
        const response = await fetch('/api/total-votes', {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        const cacheStatus = response.headers.get('X-Cache');
        
        console.log(`✅ Total votes: ${data.totalVotes} (Cache: ${cacheStatus || 'UNKNOWN'})`);
        
        return data;
        
    } catch (error) {
        console.error('❌ Error fetching total votes:', error);
        // Return fallback on error
        return { totalVotes: 0, milestoneReached: false, timestamp: Date.now() };
    }
}