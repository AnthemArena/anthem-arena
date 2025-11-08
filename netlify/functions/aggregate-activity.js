const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

exports.aggregateActivity = functions.pubsub
    .schedule('every 1 minutes')
    .timeZone('UTC')
    .onRun(async (context) => {
        console.log('🔄 Starting activity aggregation...');
        
        try {
            const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
            
            // Get all live matches
            const matchesSnapshot = await db.collection('matches')
                .where('status', '==', 'live')
                .get();
            
            const hotMatches = [];
            
            // Aggregate vote activity per match
            for (const matchDoc of matchesSnapshot.docs) {
                const match = matchDoc.data();
                const matchId = matchDoc.id;
                
                // Count recent votes (you'll need to track vote timestamps)
                // For now, we'll use a simple heuristic
                const totalVotes = (match.song1?.votes || 0) + (match.song2?.votes || 0);
                
                // Get previous vote count from cache
                const previousCount = await getCachedVoteCount(matchId);
                const recentVotes = totalVotes - previousCount;
                
                if (recentVotes > 0) {
                    hotMatches.push({
                        matchId: matchId,
                        recentVotes: recentVotes,
                        song1: match.song1?.shortTitle || match.song1?.title || '',
                        song2: match.song2?.shortTitle || match.song2?.title || '',
                        thumbnailUrl: match.song1?.youtubeUrl ? 
                            getYouTubeThumbnail(match.song1.youtubeUrl) : ''
                    });
                }
                
                // Update cached count
                await setCachedVoteCount(matchId, totalVotes);
            }
            
            // Sort by recent activity
            hotMatches.sort((a, b) => b.recentVotes - a.recentVotes);
            
            // Keep top 5 hottest matches
            const topMatches = hotMatches.slice(0, 5);
            
            // Get active user count (rough estimate)
            const activeUsers = await estimateActiveUsers();
            
            // Write aggregated data to Firestore
            await db.collection('system').doc('liveActivity').set({
                hotMatches: topMatches,
                totalActiveUsers: activeUsers,
                lastUpdate: Date.now()
            });
            
            console.log(`✅ Activity aggregated: ${topMatches.length} hot matches, ${activeUsers} active users`);
            
            return null;
            
        } catch (error) {
            console.error('❌ Error aggregating activity:', error);
            throw error;
        }
    });

async function getCachedVoteCount(matchId) {
    try {
        const cacheDoc = await db.collection('voteCache').doc(matchId).get();
        return cacheDoc.exists ? (cacheDoc.data().count || 0) : 0;
    } catch (error) {
        return 0;
    }
}

async function setCachedVoteCount(matchId, count) {
    try {
        await db.collection('voteCache').doc(matchId).set({
            count: count,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Error setting cache:', error);
    }
}

async function estimateActiveUsers() {
    // Simple heuristic: count votes in last 5 minutes
    try {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        
        // This assumes you have a votes collection with timestamps
        // Adjust based on your data structure
        const recentVotesSnapshot = await db.collection('votes')
            .where('timestamp', '>', fiveMinutesAgo)
            .limit(100)
            .get();
        
        // Count unique users
        const uniqueUsers = new Set();
        recentVotesSnapshot.forEach(doc => {
            const userId = doc.data().userId;
            if (userId) uniqueUsers.add(userId);
        });
        
        return uniqueUsers.size;
        
    } catch (error) {
        console.error('Error estimating active users:', error);
        return 0;
    }
}

function getYouTubeThumbnail(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&\n?#]+)/);
    const videoId = match ? match[1] : '';
    return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';
}