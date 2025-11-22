// ========================================
// SOCIAL FEED - CORE FUNCTIONALITY
// League Music Tournament
// ========================================

import { db } from './firebase-config.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc,
    getDocs,
    query, 
    where, 
    orderBy, 
    limit,
    updateDoc,
    increment,
    arrayUnion,
    arrayRemove,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// AUTO-POST WHEN USER VOTES (Hook into vote.js)
// ========================================

/**
 * Create a post when user votes
 * Called from vote.js after successful vote submission
 */
/**
 * Generate engaging, context-aware post text based on vote impact
 */
function generateVotePostText(voteData, matchState) {
    const { votedSongName, opponentSongName, round } = voteData;
    const { voteDiff, userPct, wasClose, isWinning, isDominating, tippedScale } = matchState;
    
    // 🎯 TIPPED THE SCALES - Vote changed the leader or made it close
    if (tippedScale) {
        return `just tipped the scales in the ${votedSongName} vs ${opponentSongName} match! ⚖️`;
    }
    
    // 🔥 NAILBITER - Very close match
    if (wasClose && voteDiff <= 3) {
        const templates = [
            `voted in a nail-biter! ${votedSongName} vs ${opponentSongName} separated by just ${voteDiff} vote${voteDiff === 1 ? '' : 's'}! 🔥`,
            `just cast a deciding vote! ${votedSongName} vs ${opponentSongName} is TOO close! ⚔️`,
            `made it even closer! ${votedSongName} vs ${opponentSongName} - only ${voteDiff} vote${voteDiff === 1 ? '' : 's'} apart! 😱`
        ];
        return templates[Math.floor(Math.random() * templates.length)];
    }
    
    // 💪 REINFORCED LEAD - Voted for already-winning song
    if (isDominating && userPct >= 65) {
        const templates = [
            `rallied behind ${votedSongName}! Now dominating at ${userPct}%! 🚀`,
            `joined the ${votedSongName} momentum train! Leading ${userPct}% to ${100 - userPct}%! 🔥`,
            `backed the favorite ${votedSongName} - now crushing it at ${userPct}%! 💪`
        ];
        return templates[Math.floor(Math.random() * templates.length)];
    }
    
    // 🎭 UNDERDOG SUPPORT - Voted for losing song
    if (!isWinning && userPct < 45) {
        const templates = [
            `stood with the underdog ${votedSongName}! Fighting at ${userPct}%! 🛡️`,
            `backed ${votedSongName} against the odds! Behind but not out! ⚔️`,
            `supports ${votedSongName} in the comeback attempt! Currently ${userPct}% vs ${100 - userPct}%! 🎭`
        ];
        return templates[Math.floor(Math.random() * templates.length)];
    }
    
    // ⚖️ BALANCED MATCH - Neither side dominating
    if (userPct >= 45 && userPct <= 60) {
        const templates = [
            `voted ${votedSongName} in a balanced battle vs ${opponentSongName}! ${userPct}% to ${100 - userPct}%! ⚖️`,
            `picked ${votedSongName} over ${opponentSongName} - anyone's game at ${userPct}%! 🎯`,
            `chose ${votedSongName} in this even matchup! ${userPct}% vs ${100 - userPct}%! 🔥`
        ];
        return templates[Math.floor(Math.random() * templates.length)];
    }
    
    // 🎵 DEFAULT - Standard vote message
    const defaultTemplates = [
        `just voted for ${votedSongName} over ${opponentSongName}! 🎵`,
        `picked ${votedSongName} in Round ${round}! Let's go! 🚀`,
        `chose ${votedSongName} - ${opponentSongName} put up a good fight though! 😅`,
        `Team ${votedSongName} all the way! 🏆`
    ];
    
    return defaultTemplates[Math.floor(Math.random() * defaultTemplates.length)];
}

/**
 * Create a vote post with smart context-aware messaging
 */
export async function createVotePost(voteData) {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        const username = localStorage.getItem('username') || 'Anonymous';
        const isPublic = localStorage.getItem('isPublic') === 'true';
        const avatarJson = localStorage.getItem('avatar');
        
        // Don't post if user is private or anonymous
        if (!isPublic || username === 'Anonymous' || !userId) {
            console.log('⏸️ Skipping post - user is private or anonymous');
            return null;
        }
        
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
        
        // ========================================
        // ✅ FETCH MATCH STATE FOR CONTEXT
        // ========================================
        let matchState = {
            voteDiff: 0,
            userPct: 50,
            wasClose: false,
            isWinning: false,
            isDominating: false,
            tippedScale: false
        };
        
        try {
            // Fetch current match data to determine context
            const matchResponse = await fetch(`/api/matches`);
            const allMatches = await matchResponse.json();
            const match = allMatches.find(m => (m.matchId || m.id) === voteData.matchId);
            
           if (match) {
    const votedSong = voteData.choice === 'song1' ? match.song1 : match.song2;
    const opponentSong = voteData.choice === 'song1' ? match.song2 : match.song1;
    
    // ✅ FIX: Add 1 to voted song (our vote isn't reflected in cache yet)
    const votedVotes = (votedSong?.votes || 0) + 1;  // ← ADD +1 HERE
    const opponentVotes = opponentSong?.votes || 0;
    const totalVotes = votedVotes + opponentVotes;
    
    matchState.voteDiff = Math.abs(votedVotes - opponentVotes);
    matchState.userPct = totalVotes > 0 ? Math.round((votedVotes / totalVotes) * 100) : 50;
    matchState.wasClose = matchState.voteDiff <= 5;
    matchState.isWinning = votedVotes >= opponentVotes;
    matchState.isDominating = matchState.userPct >= 65;
    
    // Tipped the scale = was tied/losing, now winning
    const previousVotedVotes = votedVotes - 1; // Before our vote
    const wasPreviouslyLosing = previousVotedVotes < opponentVotes;
    const wasPreviouslyTied = previousVotedVotes === opponentVotes;
    
    matchState.tippedScale = (
        (wasPreviouslyLosing && matchState.isWinning) ||  // Was losing, now winning
        (wasPreviouslyTied && matchState.voteDiff === 1)   // Was tied, now leading by 1
    );
    
    console.log('📊 Match context (with our vote):', matchState);
}
        } catch (error) {
            console.warn('⚠️ Could not fetch match state for context:', error);
        }
        
        // ========================================
        // GENERATE CONTEXT-AWARE POST TEXT
        // ========================================
        const postText = generateVotePostText({
            votedSongName: voteData.votedSongName || voteData.songTitle,
            opponentSongName: voteData.opponentSongName,
            matchTitle: voteData.matchTitle,
            round: voteData.round
        }, matchState);
        
        // Generate post ID
        const postId = `vote_${voteData.matchId}_${userId}_${Date.now()}`;
        
       // Create post object
const post = {
    postId: postId,
    userId: userId,
    username: username,
    avatar: avatar,
    type: 'vote',
    text: postText,
    matchId: voteData.matchId,
    matchTitle: voteData.matchTitle,
    votedSongName: voteData.votedSongName || voteData.songTitle,
    opponentSongName: voteData.opponentSongName,
    votedSongId: voteData.songId,
    // ✅ FIX: Generate thumbnail from songId, use null if missing
    votedThumbnail: voteData.songId 
        ? `https://img.youtube.com/vi/${voteData.songId}/mqdefault.jpg` 
        : null,
    // ✅ FIX: Remove opponentThumbnail or set to null (we don't have opponent videoId)
    opponentThumbnail: null,
    choice: voteData.choice,
    tournamentId: voteData.tournamentId || '2025-worlds-anthems',
    round: voteData.round || 1,
    matchState: matchState,
    timestamp: Date.now(),
    privacy: 'public',
    likeCount: 0,
    commentCount: 0,
    createdAt: Timestamp.now()
};
        
        // Save to Firestore
        await setDoc(doc(db, 'posts', postId), post);
        
        console.log('✅ Vote post created with smart context:', postId);
        console.log('📝 Post text:', postText);
        
        // ✅ Fan out to followers' feeds (async - don't block)
        fanOutToFollowers(userId, post).catch(err => 
            console.warn('⚠️ Fan-out failed:', err)
        );
        
        return post;
        
    } catch (error) {
        console.error('❌ Error creating vote post:', error);
        return null;
    }
}

/**
 * Fan out post to followers' feeds
 * This makes feed reads O(1) instead of O(n)
 */
async function fanOutToFollowers(userId, post) {
    try {
        // Get user's followers
        const userDoc = await getDoc(doc(db, 'users', userId));
        const followers = userDoc.data()?.followers || [];
        
        if (followers.length === 0) {
            console.log('📭 No followers to fan out to');
            return;
        }
        
        console.log(`📤 Fanning out to ${followers.length} followers...`);
        
        // Write post to each follower's feed
        const promises = followers.map(followerId => 
            setDoc(doc(db, 'feeds', followerId, 'posts', post.postId), post)
        );
        
        await Promise.all(promises);
        
        console.log(`✅ Fanned out to ${followers.length} feeds`);
        
    } catch (error) {
        console.error('❌ Fan-out error:', error);
    }
}

// ========================================
// FOLLOW/UNFOLLOW SYSTEM
// ========================================

/**
 * Follow a user
 */
export async function followUser(targetUserId, targetUsername) {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        const username = localStorage.getItem('username');
        
        if (!userId || !username) {
            throw new Error('Must be logged in to follow users');
        }
        
        if (userId === targetUserId) {
            throw new Error('Cannot follow yourself');
        }
        
        // Update current user's following list
        await updateDoc(doc(db, 'users', userId), {
            following: arrayUnion(targetUserId)
        });
        
        // Update target user's followers list
        await updateDoc(doc(db, 'users', targetUserId), {
            followers: arrayUnion(userId)
        });
        
        console.log(`✅ Now following ${targetUsername}`);
        
        // Show notification
        if (window.showNotification) {
            window.showNotification(`Now following ${targetUsername}!`, 'success');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Follow error:', error);
        if (window.showNotification) {
            window.showNotification('Could not follow user', 'error');
        }
        return false;
    }
}

/**
 * Unfollow a user
 */
export async function unfollowUser(targetUserId, targetUsername) {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        
        if (!userId) {
            throw new Error('Must be logged in');
        }
        
        // Remove from following list
        await updateDoc(doc(db, 'users', userId), {
            following: arrayRemove(targetUserId)
        });
        
        // Remove from target's followers
        await updateDoc(doc(db, 'users', targetUserId), {
            followers: arrayRemove(userId)
        });
        
        console.log(`✅ Unfollowed ${targetUsername}`);
        
        if (window.showNotification) {
            window.showNotification(`Unfollowed ${targetUsername}`, 'info');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Unfollow error:', error);
        return false;
    }
}

/**
 * Check if following a user
 */
export async function isFollowing(targetUserId) {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        if (!userId) return false;
        
        const userDoc = await getDoc(doc(db, 'users', userId));
        const following = userDoc.data()?.following || [];
        
        return following.includes(targetUserId);
        
    } catch (error) {
        console.error('❌ Error checking follow status:', error);
        return false;
    }
}

// ========================================
// LIKE SYSTEM
// ========================================

/**
 * Like a post
 */
export async function likePost(postId) {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        const username = localStorage.getItem('username');
        
        if (!userId || !username) {
            throw new Error('Must be logged in to like posts');
        }
        
        const likeId = `${postId}_${userId}`;
        
        // Check if already liked
        const likeDoc = await getDoc(doc(db, 'likes', likeId));
        if (likeDoc.exists()) {
            console.log('⚠️ Already liked this post');
            return false;
        }
        
        // Create like document
        await setDoc(doc(db, 'likes', likeId), {
            likeId: likeId,
            postId: postId,
            userId: userId,
            username: username,
            timestamp: Date.now()
        });
        
        // Increment post like count
        await updateDoc(doc(db, 'posts', postId), {
            likeCount: increment(1)
        });
        
        console.log('❤️ Post liked');
        
        return true;
        
    } catch (error) {
        console.error('❌ Like error:', error);
        return false;
    }
}

/**
 * Unlike a post
 */
export async function unlikePost(postId) {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        
        if (!userId) {
            throw new Error('Must be logged in');
        }
        
        const likeId = `${postId}_${userId}`;
        
        // Delete like document
        const { deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await deleteDoc(doc(db, 'likes', likeId));
        
        // Decrement post like count
        await updateDoc(doc(db, 'posts', postId), {
            likeCount: increment(-1)
        });
        
        console.log('💔 Post unliked');
        
        return true;
        
    } catch (error) {
        console.error('❌ Unlike error:', error);
        return false;
    }
}

/**
 * Check if user liked a post
 */
export async function hasLikedPost(postId) {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        if (!userId) return false;
        
        const likeId = `${postId}_${userId}`;
        const likeDoc = await getDoc(doc(db, 'likes', likeId));
        
        return likeDoc.exists();
        
    } catch (error) {
        console.error('❌ Error checking like status:', error);
        return false;
    }
}

// ========================================
// FETCH FEED
// ========================================

/**
 * Get feed for current user (following + own posts)
 */
export async function getFeed(feedType = 'following', limitCount = 50) {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        
        let posts = [];
        
        if (feedType === 'following' && userId) {
            // Get posts from users you follow (pre-computed feed)
            const feedQuery = query(
                collection(db, 'feeds', userId, 'posts'),
                orderBy('timestamp', 'desc'),
                limit(limitCount)
            );
            
            const snapshot = await getDocs(feedQuery);
            posts = snapshot.docs.map(doc => doc.data());
            
        } else {
            // Get all public posts (global feed)
            const postsQuery = query(
                collection(db, 'posts'),
                where('privacy', '==', 'public'),
                orderBy('timestamp', 'desc'),
                limit(limitCount)
            );
            
            const snapshot = await getDocs(postsQuery);
            posts = snapshot.docs.map(doc => doc.data());
        }
        
        console.log(`📥 Loaded ${posts.length} posts (${feedType})`);
        
        return posts;
        
    } catch (error) {
        console.error('❌ Error fetching feed:', error);
        return [];
    }
}

console.log('✅ Social feed module loaded');