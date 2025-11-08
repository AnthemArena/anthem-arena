const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

exports.aggregateActivity = functions.pubsub
    .schedule('every 1 minutes')
    .timeZone('UTC')
    .onRun(async (context) => {
        console.log('🔄 Starting activity aggregation...');
        
        try {
            const matchesSnapshot = await db.collection('matches')
                .where('status', '==', 'live')
                .get();
            
            const hotMatches = [];
            
            for (const matchDoc of matchesSnapshot.docs) {
                const match = matchDoc.data();
                const matchId = matchDoc.id;
                
                const totalVotes = (match.song1?.votes || 0) + (match.song2?.votes || 0);
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
                
                await setCachedVoteCount(matchId, totalVotes);
            }
            
            hotMatches.sort((a, b) => b.recentVotes - a.recentVotes);
            const topMatches = hotMatches.slice(0, 5);
            
            await db.collection('system').doc('liveActivity').set({
                hotMatches: topMatches,
                totalActiveUsers: topMatches.reduce((sum, m) => sum + m.recentVotes, 0),
                lastUpdate: Date.now()
            });
            
            console.log(`✅ Aggregated: ${topMatches.length} hot matches`);
            return null;
            
        } catch (error) {
            console.error('❌ Error:', error);
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

function getYouTubeThumbnail(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&\n?#]+)/);
    const videoId = match ? match[1] : '';
    return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';
}