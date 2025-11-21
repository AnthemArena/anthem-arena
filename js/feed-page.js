// ========================================
// FEED PAGE - UI CONTROLLER
// League Music Tournament
// ========================================
import { initializeFeedWidgets, setupSidebarInteractions } from './feed-widgets.js';

import { 
    getFeed, 
    likePost, 
    unlikePost, 
    hasLikedPost,
    followUser,
    unfollowUser,
    isFollowing 
} from './social-feed.js';

// ========================================
// STATE
// ========================================

let currentFilter = 'all';
let currentPosts = [];
let lastLoadedIndex = 0;
const POSTS_PER_PAGE = 20;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎵 Feed page loading...');

      // Initialize widgets FIRST
    await initializeFeedWidgets();
    setupSidebarInteractions();
    
    // Check if user is logged in
    checkLoginStatus();
    
    // Setup filter buttons
    setupFilters();
    
    // Setup create post box
    setupCreatePost();
    
    // Load initial feed
    await loadFeed();
    
    // Setup load more button
    setupLoadMore();
    
    console.log('✅ Feed page ready');
});

// ========================================
// LOGIN STATUS
// ========================================

function checkLoginStatus() {
    const username = localStorage.getItem('username');
    const isPublic = localStorage.getItem('isPublic') === 'true';
    const avatarJson = localStorage.getItem('avatar');
    
    if (username && username !== 'Anonymous' && isPublic) {
        // Show create post box
        document.getElementById('createPostBox').style.display = 'block';
        
        // Set avatar
        try {
            const avatar = JSON.parse(avatarJson);
            const avatarImg = document.getElementById('createPostAvatar');
            
            if (avatar.type === 'url') {
                avatarImg.src = avatar.value;
            } else {
                // For emoji avatars, create a canvas
                avatarImg.src = createEmojiAvatar(avatar.value);
            }
        } catch (e) {
            console.error('Error setting avatar:', e);
        }
    }
}

// ========================================
// FILTERS
// ========================================

function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Get filter type
            currentFilter = btn.dataset.filter;
            
            // Reload feed
            lastLoadedIndex = 0;
            await loadFeed();
        });
    });
}

// ========================================
// LOAD FEED
// ========================================

async function loadFeed() {
    const feedContainer = document.getElementById('feedPosts');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    
    // Show loading
    loadingState.style.display = 'block';
    emptyState.style.display = 'none';
    feedContainer.innerHTML = '';
    feedContainer.appendChild(loadingState);
    feedContainer.appendChild(emptyState);
    
    try {
        // Fetch posts based on filter
        let feedType = currentFilter === 'following' ? 'following' : 'all';
        currentPosts = await getFeed(feedType, 100);
        
        // Apply additional filtering
        if (currentFilter === 'trending') {
            // Sort by likes + comments (engagement)
            currentPosts.sort((a, b) => {
                const engagementA = (a.likeCount || 0) + (a.commentCount || 0) * 2;
                const engagementB = (b.likeCount || 0) + (b.commentCount || 0) * 2;
                return engagementB - engagementA;
            });
        }
        
        // Hide loading
        loadingState.style.display = 'none';
        
        // Show posts or empty state
        if (currentPosts.length === 0) {
            emptyState.style.display = 'block';
        } else {
            renderPosts(0, POSTS_PER_PAGE);
        }
        
    } catch (error) {
        console.error('❌ Error loading feed:', error);
        loadingState.innerHTML = '<p style="color: var(--danger);">Failed to load feed. Please try again.</p>';
    }
}

// ========================================
// RENDER POSTS
// ========================================

function renderPosts(startIndex, count) {
    const feedContainer = document.getElementById('feedPosts');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    
    // Get posts to render
    const postsToRender = currentPosts.slice(startIndex, startIndex + count);
    
    // Render each post
    postsToRender.forEach(post => {
        const postElement = createPostElement(post);
        feedContainer.appendChild(postElement);
    });
    
    // Update last loaded index
    lastLoadedIndex = startIndex + count;
    
    // Show/hide load more button
    if (lastLoadedIndex < currentPosts.length) {
        loadMoreContainer.style.display = 'block';
    } else {
        loadMoreContainer.style.display = 'none';
    }
}

// ========================================
// CREATE POST ELEMENT
// ========================================

function createPostElement(post) {
    const postDiv = document.createElement('div');
    postDiv.className = 'feed-post';
    postDiv.dataset.postId = post.postId;
    
    // Format time
    const timeAgo = getTimeAgo(post.timestamp);
    
    // Get avatar URL
    const avatarUrl = getAvatarUrl(post.avatar);
    
    // Determine if current user
    const currentUserId = localStorage.getItem('tournamentUserId');
    const isOwnPost = post.userId === currentUserId;
    
    // Build HTML
    postDiv.innerHTML = `
        <div class="post-header">
            <img src="${avatarUrl}" alt="${post.username}" class="user-avatar">
            <div class="post-meta">
                <span class="username" data-user-id="${post.userId}">${post.username}</span>
                <span class="post-time">${timeAgo}</span>
            </div>
            ${!isOwnPost ? `
                <button class="follow-btn" data-user-id="${post.userId}" data-username="${post.username}">
                    <i class="fa-solid fa-user-plus"></i>
                    Follow
                </button>
            ` : ''}
        </div>
        
        <div class="post-content">
            ${renderPostContent(post)}
        </div>
        
        <div class="post-actions-bar">
            <button class="action-btn like-btn" data-post-id="${post.postId}">
                <i class="fa-regular fa-heart"></i>
                <span class="like-count">${post.likeCount || 0}</span>
            </button>
            <button class="action-btn comment-btn" data-post-id="${post.postId}">
                <i class="fa-regular fa-comment"></i>
                <span class="comment-count">${post.commentCount || 0}</span>
            </button>
            <button class="action-btn share-btn" data-post-id="${post.postId}">
                <i class="fa-solid fa-share"></i>
                Share
            </button>
        </div>
    `;
    
    // Setup interactions
    setupPostInteractions(postDiv, post);
    
    return postDiv;
}

// ========================================
// RENDER POST CONTENT
// ========================================

// ========================================
// RENDER POST CONTENT
// ========================================

function renderPostContent(post) {
    if (post.type === 'vote') {
        // NEW: Show the smart context-aware text!
        const smartText = post.text || `voted for ${post.votedSongName || post.songTitle}`;
        
        return `
            <p class="post-text vote-text">
                <i class="fa-solid fa-check-circle"></i> ${escapeHtml(smartText)}
            </p>
            
            <div class="match-embed" data-match-id="${post.matchId}">
                <h4 class="match-title">${escapeHtml(post.matchTitle)}</h4>
                <div class="match-songs">
                    <div class="song-info ${post.choice === 'song1' ? 'picked' : ''}">
                        <div class="song-title">${escapeHtml(post.votedSongName || post.songTitle)}</div>
                    </div>
                    <div class="vs-divider">VS</div>
                    <div class="song-info ${post.choice === 'song2' ? 'picked' : ''}">
                        <div class="song-title">${escapeHtml(post.opponentSongName || 'Other Song')}</div>
                    </div>
                </div>
            </div>
        `;
    } else if (post.type === 'user_post' && post.content) {
        return `<p class="post-text">${escapeHtml(post.content)}</p>`;
    }
    
    return '';
}
// ========================================
// SETUP POST INTERACTIONS
// ========================================

async function setupPostInteractions(postElement, post) {
    // Like button
    const likeBtn = postElement.querySelector('.like-btn');
    const likeIcon = likeBtn.querySelector('i');
    const likeCount = likeBtn.querySelector('.like-count');
    
    // Check if already liked
    const alreadyLiked = await hasLikedPost(post.postId);
    if (alreadyLiked) {
        likeIcon.classList.remove('fa-regular');
        likeIcon.classList.add('fa-solid');
        likeBtn.classList.add('liked');
    }
    
    likeBtn.addEventListener('click', async () => {
        const isLiked = likeBtn.classList.contains('liked');
        
        if (isLiked) {
            // Unlike
            const success = await unlikePost(post.postId);
            if (success) {
                likeIcon.classList.remove('fa-solid');
                likeIcon.classList.add('fa-regular');
                likeBtn.classList.remove('liked');
                likeCount.textContent = Math.max(0, parseInt(likeCount.textContent) - 1);
            }
        } else {
            // Like
            const success = await likePost(post.postId);
            if (success) {
                likeIcon.classList.remove('fa-regular');
                likeIcon.classList.add('fa-solid');
                likeBtn.classList.add('liked');
                likeCount.textContent = parseInt(likeCount.textContent) + 1;
            }
        }
    });
    
    // Follow button
    const followBtn = postElement.querySelector('.follow-btn');
    if (followBtn) {
        // Check if already following
        const targetUserId = followBtn.dataset.userId;
        const alreadyFollowing = await isFollowing(targetUserId);
        
        if (alreadyFollowing) {
            followBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Following';
            followBtn.classList.add('following');
        }
        
        followBtn.addEventListener('click', async () => {
            const targetUsername = followBtn.dataset.username;
            const isFollowingNow = followBtn.classList.contains('following');
            
            if (isFollowingNow) {
                // Unfollow
                const success = await unfollowUser(targetUserId, targetUsername);
                if (success) {
                    followBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Follow';
                    followBtn.classList.remove('following');
                }
            } else {
                // Follow
                const success = await followUser(targetUserId, targetUsername);
                if (success) {
                    followBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Following';
                    followBtn.classList.add('following');
                }
            }
        });
    }
    
    // Match embed click - navigate to vote page
    const matchEmbed = postElement.querySelector('.match-embed');
    if (matchEmbed) {
        matchEmbed.addEventListener('click', () => {
            const matchId = matchEmbed.dataset.matchId;
            window.location.href = `/vote.html?match=${matchId}`;
        });
    }
    
    // Comment button (placeholder for Phase 2)
    const commentBtn = postElement.querySelector('.comment-btn');
    commentBtn.addEventListener('click', () => {
        if (window.showNotification) {
            window.showNotification('Comments coming soon!', 'info');
        }
    });
    
    // Share button
    const shareBtn = postElement.querySelector('.share-btn');
    shareBtn.addEventListener('click', () => {
        sharePost(post);
    });
}

// ========================================
// LOAD MORE
// ========================================

function setupLoadMore() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    loadMoreBtn.addEventListener('click', () => {
        renderPosts(lastLoadedIndex, POSTS_PER_PAGE);
    });
}

// ========================================
// CREATE POST
// ========================================

function setupCreatePost() {
    const postInput = document.getElementById('postInput');
    const submitBtn = document.getElementById('submitPostBtn');
    const charCount = document.getElementById('charCount');
    
    if (!postInput || !submitBtn) return;
    
    // Character counter
    postInput.addEventListener('input', () => {
        const remaining = 280 - postInput.value.length;
        charCount.textContent = remaining;
        
        if (remaining < 20) {
            charCount.classList.add('danger');
            charCount.classList.remove('warning');
        } else if (remaining < 50) {
            charCount.classList.add('warning');
            charCount.classList.remove('danger');
        } else {
            charCount.classList.remove('warning', 'danger');
        }
        
        // Enable/disable submit
        submitBtn.disabled = postInput.value.trim().length === 0 || remaining < 0;
    });
    
    // Submit post
    submitBtn.addEventListener('click', async () => {
        await createUserPost();
    });
    
    // Enter to submit (Shift+Enter for new line)
    postInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!submitBtn.disabled) {
                await createUserPost();
            }
        }
    });
}

async function createUserPost() {
    const postInput = document.getElementById('postInput');
    const submitBtn = document.getElementById('submitPostBtn');
    const content = postInput.value.trim();
    
    if (!content) return;
    
    // Disable submit while posting
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Posting...';
    
    try {
        const userId = localStorage.getItem('tournamentUserId');
        const username = localStorage.getItem('username');
        const avatarJson = localStorage.getItem('avatar');
        
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
        
        // Create post object
        const postId = `user_${userId}_${Date.now()}`;
        const post = {
            postId: postId,
            userId: userId,
            username: username,
            avatar: avatar,
            type: 'user_post',
            content: content,
            timestamp: Date.now(),
            privacy: 'public',
            likeCount: 0,
            commentCount: 0,
            createdAt: new Date()
        };
        
        // Save to Firestore
        const { db } = await import('./firebase-config.js');
        const { doc, setDoc, Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        post.createdAt = Timestamp.now();
        await setDoc(doc(db, 'posts', postId), post);
        
        console.log('✅ User post created');
        
        // Clear input
        postInput.value = '';
        document.getElementById('charCount').textContent = '280';
        
        // Show success
        if (window.showNotification) {
            window.showNotification('Post shared!', 'success');
        }
        
        // Prepend new post to feed
        const feedContainer = document.getElementById('feedPosts');
        const postElement = createPostElement(post);
        feedContainer.insertBefore(postElement, feedContainer.firstChild);
        
        // Add to current posts array
        currentPosts.unshift(post);
        
    } catch (error) {
        console.error('❌ Error creating post:', error);
        if (window.showNotification) {
            window.showNotification('Failed to post. Try again.', 'error');
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Post';
    }
}

// ========================================
// SHARE POST
// ========================================

function sharePost(post) {
    const shareUrl = `${window.location.origin}/feed.html#post-${post.postId}`;
    const shareText = `Check out this post from ${post.username} on League Music Tournament!`;
    
    // Check if Web Share API is available
    if (navigator.share) {
        navigator.share({
            title: 'League Music Tournament',
            text: shareText,
            url: shareUrl
        }).then(() => {
            console.log('✅ Post shared');
        }).catch((error) => {
            console.log('Share cancelled:', error);
        });
    } else {
        // Fallback: Copy link to clipboard
        navigator.clipboard.writeText(shareUrl).then(() => {
            if (window.showNotification) {
                window.showNotification('Link copied to clipboard!', 'success');
            }
        }).catch((error) => {
            console.error('❌ Copy failed:', error);
        });
    }
}

// ========================================
// UTILITIES
// ========================================

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    // Format date for older posts
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getAvatarUrl(avatar) {
    if (!avatar) {
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect fill="%23C8AA6E"/><text x="25" y="35" text-anchor="middle" fill="black" font-size="30">🎵</text></svg>';
    }
    
    if (avatar.type === 'url') {
        return avatar.value;
    } else {
        // Emoji avatar - create data URL
        return createEmojiAvatar(avatar.value);
    }
}

function createEmojiAvatar(emoji) {
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="%23C8AA6E"/><text x="25" y="35" text-anchor="middle" font-size="30">${emoji}</text></svg>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('✅ Feed page module loaded');