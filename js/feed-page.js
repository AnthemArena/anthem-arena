// ========================================
// FEED PAGE - UI CONTROLLER
// League Music Tournament
// ========================================
import { initializeFeedWidgets, setupSidebarInteractions  } from './feed-widgets.js';

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
// SONG DATA
// ========================================

let musicVideos = [];

async function loadMusicVideos() {
    try {
        const response = await fetch('/data/music-videos.json');
        musicVideos = await response.json();
        console.log('✅ Loaded music videos:', musicVideos.length);
    } catch (error) {
        console.error('❌ Error loading music videos:', error);
    }
}

// ========================================
// ✅ @MENTION SYSTEM
// ========================================

let allUsers = []; // Cache of all users for autocomplete

async function loadAllUsers() {
    try {
        const { db } = await import('./firebase-config.js');
        const { collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const profilesRef = collection(db, 'profiles');
        const q = query(profilesRef, where('username', '!=', null));
        const snapshot = await getDocs(q);
        
        allUsers = [];
        snapshot.forEach(doc => {
            const profile = doc.data();
            if (profile.username && profile.username !== 'Anonymous') {
                allUsers.push({
                    userId: doc.id,
                    username: profile.username,
                    avatar: profile.avatar,
                    level: profile.level || 1,
                    rank: profile.rank || 'New Voter',
                    totalVotes: profile.totalVotes || 0
                });
            }
        });
        
        console.log('✅ Loaded users for mentions:', allUsers.length);
        
    } catch (error) {
        console.error('❌ Error loading users:', error);
    }
}

// Parse @mentions in text (for display)
function parseMentions(text) {
    if (!text) return '';
    
    let parsedText = escapeHtml(text);
    
    // Find all @mentions (word characters only)
    const mentionRegex = /@(\w+)/g;
    
    parsedText = parsedText.replace(mentionRegex, (match, username) => {
        // Check if user exists
        const user = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
        
        if (user) {
            return `<span class="user-mention" 
                data-user-id="${user.userId}" 
                data-username="${user.username}"
                data-level="${user.level}"
                data-rank="${escapeHtml(user.rank)}"
                data-votes="${user.totalVotes}">@${username}</span>`;
        }
        
        return match; // Not a valid user, leave as plain text
    });
    
    return parsedText;
}

// Extract mentioned user IDs from text (for notifications)
function extractMentionedUsers(text) {
    if (!text) return [];
    
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
        const username = match[1];
        const user = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
        
        if (user) {
            mentions.push({
                userId: user.userId,
                username: user.username
            });
        }
    }
    
    return mentions;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Show loading spinner with custom message
 */
function showLoadingSpinner(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const spinnerText = document.getElementById('spinner-text');
    
    if (overlay && spinnerText) {
        spinnerText.textContent = message;
        overlay.style.display = 'flex';
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Hide loading spinner
 */
function hideLoadingSpinner() {
    const overlay = document.getElementById('loading-overlay');
    
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    }
}

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
    
    // ✅ Show full-page spinner
    showLoadingSpinner('Loading feed...');

    try {

         // ✅ Load users for mentions
    await loadAllUsers();

          // ✅ Load music videos data
    await loadMusicVideos();

        // ✅ NEW: Update header banner first
        await updateFeedHeaderBanner();
        
        // Initialize widgets FIRST
        await initializeFeedWidgets();

         // ✅ Setup sidebar interactions (makes profile card clickable)
        setupSidebarInteractions();
        
        // ✅ NEW: Make profile widget fully clickable
        makeProfileWidgetClickable();
        
        // Check if user is logged in
        checkLoginStatus();
        
        // Setup filter buttons
        setupFilters();

        // ✅ NEW: Setup search
setupSearch();
        
        // Setup create post box
        setupCreatePost();
        
        // Load initial feed
        await loadFeed();
        
        // Setup load more button
        setupLoadMore();
        
        console.log('✅ Feed page ready');
        
        // ✅ Hide spinner when done
        hideLoadingSpinner();
        
    } catch (error) {
        console.error('❌ Error loading feed:', error);
        
        // ✅ Hide spinner on error
        hideLoadingSpinner();
        
        // Show error message
        const feedContainer = document.getElementById('feedPosts');
        if (feedContainer) {
            feedContainer.innerHTML = `
                <div class="error-state">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    <h3>Error Loading Feed</h3>
                    <p>Could not load the feed. Please try refreshing the page.</p>
                    <button onclick="location.reload()" class="btn-retry">Retry</button>
                </div>
            `;
        }
    }
});

// ========================================
// ✅ NEW: MAKE PROFILE WIDGET CLICKABLE
// ========================================

function makeProfileWidgetClickable() {
    const profileWidget = document.querySelector('.profile-widget');
    if (profileWidget) {
        profileWidget.style.cursor = 'pointer';
        profileWidget.addEventListener('click', (e) => {
            // Don't trigger if clicking on a button or link inside
            if (e.target.closest('button, a')) return;
            
            window.location.href = '/profile.html';
        });
    }
}

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
// ✅ NEW: SEARCH FUNCTIONALITY
// ========================================

let searchQuery = '';
let isSearching = false;

function setupSearch() {
    const searchInput = document.getElementById('feedSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    
    if (!searchInput || !clearBtn) return;
    
    // Debounced search (wait 300ms after typing stops)
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        // Show/hide clear button
        clearBtn.style.display = query ? 'block' : 'none';
        
        // Clear previous timeout
        clearTimeout(searchTimeout);
        
        // Wait 300ms before searching
        searchTimeout = setTimeout(async () => {
            searchQuery = query;
            
            if (query) {
                isSearching = true;
                await performSearch(query);
            } else {
                isSearching = false;
                await loadFeed(); // Reload normal feed
            }
        }, 300);
    });
    
    // Clear search
    clearBtn.addEventListener('click', async () => {
        searchInput.value = '';
        searchQuery = '';
        isSearching = false;
        clearBtn.style.display = 'none';
        await loadFeed();
        searchInput.focus();
    });
    
    // Enter key submits search immediately
    searchInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            const query = searchInput.value.trim();
            searchQuery = query;
            
            if (query) {
                isSearching = true;
                await performSearch(query);
            }
        }
    });
}

async function performSearch(query) {
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
        // Get all posts
        const allPosts = await getFeed('all', 200);
        
        const lowerQuery = query.toLowerCase();
        
        // Filter posts by:
        // - Username
        // - Post content
        // - Song names
        // - Match titles
        const filteredPosts = allPosts.filter(post => {
            // Search username
            if (post.username && post.username.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            
            // Search post content
            if (post.content && post.content.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            
            // Search post text (for vote posts)
            if (post.text && post.text.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            
            // Search song names
            if (post.votedSongName && post.votedSongName.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            
            if (post.songTitle && post.songTitle.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            
            if (post.opponentSongName && post.opponentSongName.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            
            // Search match title
            if (post.matchTitle && post.matchTitle.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            
            return false;
        });
        
        // Hide loading
        loadingState.style.display = 'none';
        
        // Show results
        if (filteredPosts.length === 0) {
            emptyState.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-search" style="font-size: 3rem; opacity: 0.3;"></i>
                    <h3>No Results Found</h3>
                    <p>No posts match "${escapeHtml(query)}"</p>
                    <p style="font-size: 0.85rem; opacity: 0.7;">Try different keywords or check spelling</p>
                </div>
            `;
            emptyState.style.display = 'block';
        } else {
            // Add search info
            const searchInfo = document.createElement('div');
            searchInfo.className = 'search-results-info';
            searchInfo.innerHTML = `
                Found <strong>${filteredPosts.length}</strong> result${filteredPosts.length !== 1 ? 's' : ''} for "${escapeHtml(query)}"
            `;
            feedContainer.appendChild(searchInfo);
            
            // Render filtered posts
            currentPosts = filteredPosts;
            lastLoadedIndex = 0;
            renderPosts(0, POSTS_PER_PAGE);
        }
        
    } catch (error) {
        console.error('❌ Search error:', error);
        loadingState.innerHTML = '<p style="color: var(--danger);">Search failed. Please try again.</p>';
    }
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
        const currentUserId = localStorage.getItem('tournamentUserId');
        
        // ========================================
        // FETCH POSTS BASED ON FILTER
        // ========================================
        
        if (currentFilter === 'my-posts') {
            // ✅ MY POSTS: Show only current user's posts
            if (!currentUserId || currentUserId === 'anonymous') {
                loadingState.style.display = 'none';
                emptyState.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-user-slash" style="font-size: 3rem; opacity: 0.3;"></i>
                        <h3>Not Logged In</h3>
                        <p>You need to be logged in to see your posts</p>
                    </div>
                `;
                emptyState.style.display = 'block';
                return;
            }
            
            currentPosts = await getFeed('all', 100);
            currentPosts = currentPosts.filter(post => post.userId === currentUserId);
            
        } else if (currentFilter === 'following') {
            // ✅ FOLLOWING: Show posts from people you follow
            if (!currentUserId || currentUserId === 'anonymous') {
                loadingState.style.display = 'none';
                emptyState.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-user-friends" style="font-size: 3rem; opacity: 0.3;"></i>
                        <h3>Not Logged In</h3>
                        <p>Log in to see posts from people you follow</p>
                    </div>
                `;
                emptyState.style.display = 'block';
                return;
            }
            
            currentPosts = await getFeed('following', 100);
            
        } else if (currentFilter === 'trending') {
            // ✅ TRENDING: Most engagement (likes + comments * 2)
            currentPosts = await getFeed('all', 100);
            currentPosts.sort((a, b) => {
                const engagementA = (a.likeCount || 0) + (a.commentCount || 0) * 2;
                const engagementB = (b.likeCount || 0) + (b.commentCount || 0) * 2;
                return engagementB - engagementA;
            });
            
            // Only show posts with at least 1 engagement
            currentPosts = currentPosts.filter(post => 
                (post.likeCount || 0) + (post.commentCount || 0) > 0
            );
            
        } else {
            // ✅ ALL: Show all public posts (default)
            currentPosts = await getFeed('all', 100);
        }
        
        // Hide loading
        loadingState.style.display = 'none';
        
        // ========================================
        // SHOW POSTS OR EMPTY STATE
        // ========================================
        
        if (currentPosts.length === 0) {
            let emptyMessage = '';
            
            if (currentFilter === 'my-posts') {
                emptyMessage = `
                    <div class="empty-state">
                        <i class="fa-solid fa-pen" style="font-size: 3rem; opacity: 0.3;"></i>
                        <h3>No Posts Yet</h3>
                        <p>You haven't created any posts. Share something with the community!</p>
                    </div>
                `;
            } else if (currentFilter === 'following') {
                emptyMessage = `
                    <div class="empty-state">
                        <i class="fa-solid fa-user-plus" style="font-size: 3rem; opacity: 0.3;"></i>
                        <h3>No Posts from Following</h3>
                        <p>Follow other users to see their posts here</p>
                    </div>
                `;
            } else if (currentFilter === 'trending') {
                emptyMessage = `
                    <div class="empty-state">
                        <i class="fa-solid fa-fire" style="font-size: 3rem; opacity: 0.3;"></i>
                        <h3>No Trending Posts</h3>
                        <p>Be the first to create popular content!</p>
                    </div>
                `;
            } else {
                emptyMessage = `
                    <div class="empty-state">
                        <i class="fa-solid fa-inbox" style="font-size: 3rem; opacity: 0.3;"></i>
                        <h3>No Posts Yet</h3>
                        <p>Be the first to share something!</p>
                    </div>
                `;
            }
            
            emptyState.innerHTML = emptyMessage;
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

        // ✅ Setup tooltips after rendering
    setupSongTooltips();
        setupMentionTooltips(); // ✅ NEW!

    
    // Show/hide load more button
    if (lastLoadedIndex < currentPosts.length) {
        loadMoreContainer.style.display = 'block';
    } else {
        loadMoreContainer.style.display = 'none';
    }
}


// ========================================
// RENDER POST CONTENT
// ========================================

function renderPostContent(post) {
    if (post.type === 'vote') {
        const smartText = post.text || `voted for ${post.votedSongName || post.songTitle}`;
        
        return `
            <p class="post-text vote-text">
                <i class="fa-solid fa-check-circle"></i> ${parseMentions(parseSongMentions(smartText))}
            </p>
            
            <div class="match-embed" data-match-id="${post.matchId}">
                <h4 class="match-title">${escapeHtml(post.matchTitle)}</h4>
                <div class="match-songs">
                    <div class="song-info ${post.choice === 'song1' ? 'picked' : ''}">
                        <div class="song-title">${parseSongMentions(post.votedSongName || post.songTitle)}</div>
                    </div>
                    <div class="vs-divider">VS</div>
                    <div class="song-info ${post.choice === 'song2' ? 'picked' : ''}">
                        <div class="song-title">${parseSongMentions(post.opponentSongName || 'Other Song')}</div>
                    </div>
                </div>
            </div>
        `;
    } else if (post.type === 'user_post' && post.content) {
        // ✅ Parse BOTH song mentions AND user mentions
        return `<p class="post-text">${parseMentions(parseSongMentions(post.content))}</p>`;
    }
    
    return '';
}

// ========================================
// ✅ SONG TOOLTIP SYSTEM
// ========================================

// ========================================
// ✅ SONG TOOLTIP SYSTEM (FIXED)
// ========================================

// ========================================
// ✅ SONG TOOLTIP SYSTEM (SIMPLIFIED)
// ========================================

function setupSongTooltips() {
    const mentions = document.querySelectorAll('.song-mention');
    
    if (mentions.length === 0) return;
    
    mentions.forEach((mention) => {
        mention.addEventListener('mouseenter', (e) => {
            // Check if tooltip already exists
            if (mention.querySelector('.song-tooltip')) return;
            
            const songName = mention.dataset.songName;
            const videoId = mention.dataset.videoId;
            const artist = mention.dataset.artist;
            const year = mention.dataset.year;
            
            if (!videoId) return;
            
            // Create tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'song-tooltip';
            tooltip.innerHTML = `
                <div class="tooltip-thumbnail">
                    <img 
                        src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" 
                        alt="${songName}"
                    >
                </div>
            `;
            
            mention.style.position = 'relative';
            mention.appendChild(tooltip);
        });
        
        mention.addEventListener('mouseleave', (e) => {
            const tooltip = mention.querySelector('.song-tooltip');
            if (tooltip) {
                setTimeout(() => tooltip.remove(), 200);
            }
        });
    });
}


// ========================================
// ✅ PROFILE TOOLTIP ON @MENTION HOVER
// ========================================

function setupMentionTooltips() {
    document.querySelectorAll('.user-mention').forEach(mention => {
        mention.addEventListener('mouseenter', () => {
            // Check if tooltip already exists
            if (mention.querySelector('.mention-tooltip')) return;
            
            const userId = mention.dataset.userId;
            const username = mention.dataset.username;
            const level = mention.dataset.level || '1';
            const rank = mention.dataset.rank || 'New Voter';
            const votes = mention.dataset.votes || '0';
            
            // Get user from allUsers array
            const user = allUsers.find(u => u.userId === userId);
            const avatarUrl = user ? getAvatarUrl(user.avatar) : createEmojiAvatar('👤');
            
            // Create tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'mention-tooltip';
            tooltip.innerHTML = `
                <div class="tooltip-profile-header">
                    <img src="${avatarUrl}" alt="${username}" class="tooltip-profile-avatar">
                    <div class="tooltip-profile-info">
                        <div class="tooltip-profile-username">@${username}</div>
                        <div class="tooltip-profile-rank">${rank}</div>
                    </div>
                </div>
                <div class="tooltip-profile-stats">
                    <div class="tooltip-profile-stat">
                        <div class="tooltip-profile-stat-value">${level}</div>
                        <div class="tooltip-profile-stat-label">Level</div>
                    </div>
                    <div class="tooltip-profile-stat">
                        <div class="tooltip-profile-stat-value">${votes}</div>
                        <div class="tooltip-profile-stat-label">Votes</div>
                    </div>
                </div>
                <a href="/profile.html?user=${userId}" class="tooltip-profile-link" onclick="event.stopPropagation()">
                    View Profile →
                </a>
            `;
            
            mention.style.position = 'relative';
            mention.appendChild(tooltip);
        });
        
        mention.addEventListener('mouseleave', () => {
            const tooltip = mention.querySelector('.mention-tooltip');
            if (tooltip) {
                setTimeout(() => tooltip.remove(), 200);
            }
        });
        
        // Click to go to profile
        mention.addEventListener('click', (e) => {
            e.preventDefault();
            const userId = mention.dataset.userId;
            window.location.href = `/profile.html?user=${userId}`;
        });
    });
}

// ========================================
// SETUP POST INTERACTIONS
// ========================================

async function setupPostInteractions(postElement, post) {
    const currentUserId = localStorage.getItem('tournamentUserId');

        // ✅ NEW: Setup post menu (edit/delete)
    setupPostMenu(postElement, post);
    
    // ✅ NEW: Make username and avatar clickable → go to profile
    const username = postElement.querySelector('.username');
    const avatar = postElement.querySelector('.user-avatar');
    
    const goToProfile = () => {
        const targetUserId = post.userId;
        
        if (targetUserId === currentUserId) {
            // Go to own profile
            window.location.href = '/profile.html';
        } else {
            // Go to other user's profile
            window.location.href = `/profile.html?user=${targetUserId}`;
        }
    };
    
    if (username) {
        username.style.cursor = 'pointer';
        username.addEventListener('click', goToProfile);
    }
    
    if (avatar) {
        avatar.style.cursor = 'pointer';
        avatar.addEventListener('click', goToProfile);
    }
    
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
        const postAuthorId = likeBtn.dataset.postAuthorId;
        
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
                
                // ✅ NEW: Send notification to post author
                if (postAuthorId && postAuthorId !== currentUserId) {
                    await sendLikeNotification(postAuthorId, post);
                }
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
    
    // ✅ NEW: Comment button - toggle comments section
    const commentBtn = postElement.querySelector('.comment-btn');
    const commentsSection = postElement.querySelector(`#comments-${post.postId}`);
    
    commentBtn.addEventListener('click', async () => {
        if (commentsSection.style.display === 'none') {
            // Show comments
            commentsSection.style.display = 'block';
            
            // Load comments if not loaded
            await loadComments(post.postId);
        } else {
            // Hide comments
            commentsSection.style.display = 'none';
        }
    });
    
    // ✅ NEW: Send comment button
    const sendCommentBtn = postElement.querySelector('.send-comment-btn');
    const commentInput = postElement.querySelector('.comment-input');

    // ✅ Setup mention autocomplete for comments
setupMentionAutocomplete(commentInput);

    
    sendCommentBtn.addEventListener('click', async () => {
        await postComment(post.postId, commentInput);
    });
    
    commentInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await postComment(post.postId, commentInput);
        }
    });
    
    // Share button
    const shareBtn = postElement.querySelector('.share-btn');
    shareBtn.addEventListener('click', () => {
        sharePost(post);
    });
}

// ========================================
// ✅ NEW: COMMENT SYSTEM
// ========================================

async function loadComments(postId) {
    const commentsList = document.getElementById(`comments-list-${postId}`);
    if (!commentsList) return;
    
    try {
        const { db } = await import('./firebase-config.js');
        const { collection, query, where, orderBy, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const commentsRef = collection(db, 'comments');
        const q = query(
            commentsRef,
            where('postId', '==', postId),
            orderBy('timestamp', 'asc')
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            commentsList.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>';
            return;
        }
        
        commentsList.innerHTML = '';
        
        // Separate top-level comments and replies
        const topLevelComments = [];
        const repliesMap = {}; // parentId -> [replies]
        
        snapshot.forEach(doc => {
            const comment = doc.data();
            
            if (!comment.parentId) {
                // Top-level comment
                topLevelComments.push(comment);
            } else {
                // Reply
                if (!repliesMap[comment.parentId]) {
                    repliesMap[comment.parentId] = [];
                }
                repliesMap[comment.parentId].push(comment);
            }
        });
        
        // Render top-level comments with their replies
        topLevelComments.forEach(comment => {
            const commentElement = createCommentElement(comment, false);
            commentsList.appendChild(commentElement);
            
            // Load replies for this comment
            const replies = repliesMap[comment.commentId] || [];
            const repliesContainer = commentElement.querySelector(`#replies-${comment.commentId}`);
            
            if (repliesContainer && replies.length > 0) {
                replies.forEach(reply => {
                    const replyElement = createCommentElement(reply, true);
                    repliesContainer.appendChild(replyElement);
                });
            }
        });
        
    } catch (error) {
        console.error('❌ Error loading comments:', error);
        commentsList.innerHTML = '<p class="error-text">Failed to load comments</p>';
    }
}

function createCommentElement(comment, isReply = false) {
    const div = document.createElement('div');
    div.className = isReply ? 'comment reply-comment' : 'comment';
    div.dataset.commentId = comment.commentId;
    
    const avatarUrl = getAvatarUrl(comment.avatar);
    const timeAgo = getTimeAgo(comment.timestamp);
    const currentUserId = localStorage.getItem('tournamentUserId');
    const isOwnComment = comment.userId === currentUserId;
    
    div.innerHTML = `
    <img src="${avatarUrl}" alt="${comment.username}" class="comment-avatar" data-user-id="${comment.userId}">
    <div class="comment-content">
        <div class="comment-header">
            <span class="comment-username" data-user-id="${comment.userId}">${comment.username}</span>
            <span class="comment-time">${timeAgo}</span>
            ${isOwnComment ? `
                <button class="comment-delete-btn" data-comment-id="${comment.commentId}" data-post-id="${comment.postId}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            ` : ''}
        </div>
        <p class="comment-text">${parseMentions(escapeHtml(comment.content))}</p>
        
        ${!isReply ? `
            <div class="comment-actions">
                <button class="reply-btn" data-comment-id="${comment.commentId}" data-username="${comment.username}">
                    <i class="fa-solid fa-reply"></i> Reply
                </button>
            </div>
        ` : ''}
        
        ${!isReply ? `
            <div class="replies-container" id="replies-${comment.commentId}">
                <!-- Replies load here -->
            </div>
        ` : ''}
    </div>
`;
    
    // Make username/avatar clickable
    const username = div.querySelector('.comment-username');
    const avatar = div.querySelector('.comment-avatar');
    
    const goToProfile = () => {
        if (comment.userId === currentUserId) {
            window.location.href = '/profile.html';
        } else {
            window.location.href = `/profile.html?user=${comment.userId}`;
        }
    };
    
    username.style.cursor = 'pointer';
    username.addEventListener('click', goToProfile);
    avatar.style.cursor = 'pointer';
    avatar.addEventListener('click', goToProfile);
    
    // Delete handler
    const deleteBtn = div.querySelector('.comment-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            await deleteComment(comment.commentId, comment.postId, div);
        });
    }
    
    // ✅ Reply button handler
    if (!isReply) {
        const replyBtn = div.querySelector('.reply-btn');
        if (replyBtn) {
            replyBtn.addEventListener('click', () => {
                showReplyInput(comment.commentId, comment.postId, comment.username);
            });
        }
    }
    
    return div;
}

// ========================================
// ✅ AUTO-COMPLETE FOR @MENTIONS
// ========================================

let currentMentionInput = null;
let mentionDropdown = null;

function setupMentionAutocomplete(inputElement) {
    // Create dropdown if doesn't exist
    if (!mentionDropdown) {
        mentionDropdown = document.createElement('div');
        mentionDropdown.className = 'mention-dropdown';
        mentionDropdown.style.display = 'none';
        document.body.appendChild(mentionDropdown);
    }
    
    inputElement.addEventListener('input', (e) => {
        const text = e.target.value;
        const cursorPos = e.target.selectionStart;
        
        // Find @ before cursor
        const textBeforeCursor = text.substring(0, cursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
        
        if (lastAtIndex === -1) {
            mentionDropdown.style.display = 'none';
            return;
        }
        
        // Get text after @
        const searchTerm = textBeforeCursor.substring(lastAtIndex + 1);
        
        // Check if still typing username (no spaces)
        if (searchTerm.includes(' ')) {
            mentionDropdown.style.display = 'none';
            return;
        }
        
        // Filter users
        const matches = allUsers.filter(user => 
            user.username.toLowerCase().startsWith(searchTerm.toLowerCase())
        ).slice(0, 5);
        
        if (matches.length === 0 || searchTerm.length === 0) {
            mentionDropdown.style.display = 'none';
            return;
        }
        
        // Show dropdown
        currentMentionInput = {
            element: e.target,
            atIndex: lastAtIndex,
            searchTerm: searchTerm
        };
        
        showMentionDropdown(matches, e.target);
    });
    
    // Hide on blur (with delay for click)
    inputElement.addEventListener('blur', () => {
        setTimeout(() => {
            mentionDropdown.style.display = 'none';
        }, 200);
    });
}

function showMentionDropdown(users, inputElement) {
    const rect = inputElement.getBoundingClientRect();
    
    mentionDropdown.innerHTML = users.map(user => {
        const avatarUrl = getAvatarUrl(user.avatar);
        return `
            <div class="mention-option" data-username="${user.username}" data-user-id="${user.userId}">
                <img src="${avatarUrl}" alt="${user.username}" class="mention-avatar">
                <div class="mention-info">
                    <div class="mention-username">@${user.username}</div>
                    <div class="mention-rank">${user.rank} • ${user.totalVotes} votes</div>
                </div>
            </div>
        `;
    }).join('');
    
    mentionDropdown.style.display = 'block';
    mentionDropdown.style.position = 'fixed';
    mentionDropdown.style.left = rect.left + 'px';
    mentionDropdown.style.top = (rect.top - mentionDropdown.offsetHeight - 8) + 'px';
    
    // Add click handlers
    mentionDropdown.querySelectorAll('.mention-option').forEach(option => {
        option.addEventListener('click', () => {
            const username = option.dataset.username;
            insertMention(username);
        });
    });
}

function insertMention(username) {
    if (!currentMentionInput) return;
    
    const input = currentMentionInput.element;
    const text = input.value;
    const atIndex = currentMentionInput.atIndex;
    const searchTerm = currentMentionInput.searchTerm;
    
    // Replace @searchTerm with @username
    const before = text.substring(0, atIndex);
    const after = text.substring(atIndex + searchTerm.length + 1);
    
    input.value = before + '@' + username + ' ' + after;
    
    // Set cursor after mention
    const newCursorPos = (before + '@' + username + ' ').length;
    input.setSelectionRange(newCursorPos, newCursorPos);
    
    // Hide dropdown
    mentionDropdown.style.display = 'none';
    input.focus();
}

// ========================================
// ✅ SHOW REPLY INPUT BOX
// ========================================

function showReplyInput(parentCommentId, postId, parentUsername) {
    const repliesContainer = document.getElementById(`replies-${parentCommentId}`);
    if (!repliesContainer) return;
    
    // Check if reply input already exists
    if (repliesContainer.querySelector('.reply-input-box')) {
        return; // Already showing
    }
    
    const currentAvatar = JSON.parse(localStorage.getItem('avatar') || '{}');
    const avatarUrl = getAvatarUrl(currentAvatar);
    
    const replyInputBox = document.createElement('div');
    replyInputBox.className = 'reply-input-box';
    replyInputBox.innerHTML = `
        <img src="${avatarUrl}" alt="You" class="comment-avatar">
        <input 
            type="text" 
            class="reply-input" 
            placeholder="Reply to ${parentUsername}..." 
            maxlength="280"
            data-parent-id="${parentCommentId}"
            data-post-id="${postId}"
        >
        <button class="send-reply-btn" disabled>
            <i class="fa-solid fa-paper-plane"></i>
        </button>
        <button class="cancel-reply-btn">
            <i class="fa-solid fa-times"></i>
        </button>
    `;
    
    repliesContainer.insertBefore(replyInputBox, repliesContainer.firstChild);
    
    const input = replyInputBox.querySelector('.reply-input');

    // ✅ Setup mention autocomplete
setupMentionAutocomplete(input);

    const sendBtn = replyInputBox.querySelector('.send-reply-btn');
    const cancelBtn = replyInputBox.querySelector('.cancel-reply-btn');
    
    // Focus input
    input.focus();
    
    // Enable/disable send button
    input.addEventListener('input', () => {
        sendBtn.disabled = input.value.trim().length === 0;
    });
    
    // Send reply
    sendBtn.addEventListener('click', async () => {
        await postReply(postId, parentCommentId, input);
        replyInputBox.remove();
    });
    
    // Enter to send
    input.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!sendBtn.disabled) {
                await postReply(postId, parentCommentId, input);
                replyInputBox.remove();
            }
        }
    });
    
    // Cancel
    cancelBtn.addEventListener('click', () => {
        replyInputBox.remove();
    });
}

// ========================================
// ✅ POST REPLY
// ========================================

async function postReply(postId, parentCommentId, inputElement) {
    const content = inputElement.value.trim();
    if (!content) return;
    
    const username = localStorage.getItem('username');
    if (!username || username === 'Anonymous') {
        if (window.showNotification) {
            window.showNotification('Please set a username to reply', 'error');
        }
        return;
    }
    
    try {
        const userId = localStorage.getItem('tournamentUserId');
        const avatarJson = localStorage.getItem('avatar');
        
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
        
        const commentId = `reply_${userId}_${Date.now()}`;
        const comment = {
            commentId: commentId,
            postId: postId,
            parentId: parentCommentId,
            userId: userId,
            username: username,
            avatar: avatar,
            content: content,
            timestamp: Date.now()
        };
        
        // Save to Firestore
        const { db } = await import('./firebase-config.js');
        const { doc, setDoc, updateDoc, increment, Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        comment.createdAt = Timestamp.now();
        await setDoc(doc(db, 'comments', commentId), comment);
        
        // Update post comment count
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            commentCount: increment(1)
        });
        
        console.log('✅ Reply posted');
        
        // ========================================
        // ✅ SEND NOTIFICATIONS
        // ========================================
        
        // 1. Notify parent comment author
        const parentComment = await getComment(parentCommentId);
        if (parentComment && parentComment.userId !== userId) {
            await sendReplyNotification(parentComment.userId, postId, content, parentComment.username);
        }
        
        // 2. Notify mentioned users
        const mentionedUsers = extractMentionedUsers(content);
        
        if (mentionedUsers.length > 0) {
            console.log(`📢 Found ${mentionedUsers.length} mentions in reply:`, mentionedUsers);
            
            for (const mention of mentionedUsers) {
                // Don't notify yourself or the parent commenter (they already got notified)
                if (mention.userId === userId || mention.userId === parentComment?.userId) continue;
                
                try {
                    await saveNotification(mention.userId, {
                        type: 'mention',
                        priority: 7,
                        message: `📢 ${username} mentioned you in a reply`,
                        detail: content.length > 60 ? content.substring(0, 60) + '...' : content,
                        icon: '📢',
                        triggerUsername: username,
                        triggerUserId: userId,
                        ctaText: 'View Reply',
                        ctaAction: 'navigate',
                        targetUrl: `/feed.html#post-${postId}`
                    });
                    
                    console.log(`✅ Mention notification sent to @${mention.username}`);
                    
                } catch (error) {
                    console.error(`❌ Error sending mention notification to @${mention.username}:`, error);
                }
            }
        }
        
        // Clear input
        inputElement.value = '';
        
        // Add reply to UI
        const repliesContainer = document.getElementById(`replies-${parentCommentId}`);
        if (repliesContainer) {
            const replyElement = createCommentElement(comment, true);
            repliesContainer.appendChild(replyElement);
        }
        
        // Update comment count in UI
        const commentCountSpan = document.querySelector(`[data-post-id="${postId}"].comment-btn .comment-count`);
        if (commentCountSpan) {
            commentCountSpan.textContent = parseInt(commentCountSpan.textContent) + 1;
        }
        
    } catch (error) {
        console.error('❌ Error posting reply:', error);
        if (window.showNotification) {
            window.showNotification('Failed to post reply', 'error');
        }
    }
}

// ========================================
// ✅ GET COMMENT (HELPER)
// ========================================

async function getComment(commentId) {
    try {
        const { db } = await import('./firebase-config.js');
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const commentDoc = await getDoc(doc(db, 'comments', commentId));
        return commentDoc.exists() ? commentDoc.data() : null;
    } catch (error) {
        console.error('❌ Error getting comment:', error);
        return null;
    }
}

// ========================================
// ✅ SEND REPLY NOTIFICATION
// ========================================

async function sendReplyNotification(recipientUserId, postId, replyContent, parentUsername) {
    try {
        const currentUserId = localStorage.getItem('tournamentUserId');
        const currentUsername = localStorage.getItem('username');
        
        if (!currentUsername || currentUsername === 'Anonymous') return;
        if (recipientUserId === currentUserId) return;
        
        const { saveNotification } = await import('./notification-storage.js');
        
        const preview = replyContent.length > 50 
            ? replyContent.substring(0, 50) + '...' 
            : replyContent;
        
        await saveNotification(recipientUserId, {
            type: 'reply',
            priority: 8,
            message: `💬 ${currentUsername} replied to your comment`,
            detail: `"${preview}"`,
            icon: '💬',
            triggerUsername: currentUsername,
            triggerUserId: currentUserId,
            ctaText: 'View Reply',
            ctaAction: 'navigate',
            targetUrl: `/feed.html#post-${postId}`
        });
        
        console.log(`✅ Reply notification sent to ${recipientUserId}`);
        
    } catch (error) {
        console.error('❌ Error sending reply notification:', error);
    }
}

async function postComment(postId, inputElement) {
    const content = inputElement.value.trim();
    if (!content) return;
    
    const username = localStorage.getItem('username');
    if (!username || username === 'Anonymous') {
        if (window.showNotification) {
            window.showNotification('Please set a username to comment', 'error');
        }
        return;
    }
    
    try {
        const userId = localStorage.getItem('tournamentUserId');
        const avatarJson = localStorage.getItem('avatar');
        
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
        
        const commentId = `comment_${userId}_${Date.now()}`;
        const comment = {
            commentId: commentId,
            postId: postId,
            userId: userId,
            username: username,
            avatar: avatar,
            content: content,
            timestamp: Date.now()
        };
        
        // Save to Firestore
        const { db } = await import('./firebase-config.js');
        const { doc, setDoc, updateDoc, increment, Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        comment.createdAt = Timestamp.now();
        await setDoc(doc(db, 'comments', commentId), comment);
        
        // Update post comment count
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            commentCount: increment(1)
        });
        
        console.log('✅ Comment posted');
        
        // ========================================
        // ✅ SEND NOTIFICATIONS
        // ========================================
        
        // 1. Notify post author
        const postElement = document.querySelector(`[data-post-id="${postId}"]`);
        if (postElement) {
            const post = currentPosts.find(p => p.postId === postId);
            if (post && post.userId !== userId) {
                await sendCommentNotification(post.userId, post, content);
            }
        }
        
        // 2. Notify mentioned users
        const mentionedUsers = extractMentionedUsers(content);
        
        if (mentionedUsers.length > 0) {
            console.log(`📢 Found ${mentionedUsers.length} mentions in comment:`, mentionedUsers);
            
            for (const mention of mentionedUsers) {
                // Don't notify yourself or the post author (they already got notified)
                const post = currentPosts.find(p => p.postId === postId);
                if (mention.userId === userId || mention.userId === post?.userId) continue;
                
                try {
                    await saveNotification(mention.userId, {
                        type: 'mention',
                        priority: 7,
                        message: `📢 ${username} mentioned you in a comment`,
                        detail: content.length > 60 ? content.substring(0, 60) + '...' : content,
                        icon: '📢',
                        triggerUsername: username,
                        triggerUserId: userId,
                        ctaText: 'View Comment',
                        ctaAction: 'navigate',
                        targetUrl: `/feed.html#post-${postId}`
                    });
                    
                    console.log(`✅ Mention notification sent to @${mention.username}`);
                    
                } catch (error) {
                    console.error(`❌ Error sending mention notification to @${mention.username}:`, error);
                }
            }
        }
        
        // Clear input
        inputElement.value = '';
        
        // Reload comments
        await loadComments(postId);
        
        // Update comment count in UI
        const commentCountSpan = document.querySelector(`[data-post-id="${postId}"].comment-btn .comment-count`);
        if (commentCountSpan) {
            commentCountSpan.textContent = parseInt(commentCountSpan.textContent) + 1;
        }
        
    } catch (error) {
        console.error('❌ Error posting comment:', error);
        if (window.showNotification) {
            window.showNotification('Failed to post comment', 'error');
        }
    }
}

// ========================================
// ✅ NEW: DELETE COMMENT
// ========================================

async function deleteComment(commentId, postId, commentElement) {
    if (!confirm('Delete this comment? This cannot be undone.')) {
        return;
    }
    
    try {
        // Delete from Firestore
        const { doc, deleteDoc, updateDoc, increment } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await deleteDoc(doc(db, 'comments', commentId));
        
        // Decrement post comment count
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            commentCount: increment(-1)
        });
        
        console.log('✅ Comment deleted');
        
        // Animate removal
        commentElement.style.transition = 'all 0.3s ease';
        commentElement.style.opacity = '0';
        commentElement.style.transform = 'translateX(-20px)';
        
        setTimeout(() => {
            commentElement.remove();
            
            // Update comment count in UI
            const commentCountSpan = document.querySelector(`[data-post-id="${postId}"].comment-btn .comment-count`);
            if (commentCountSpan) {
                const currentCount = parseInt(commentCountSpan.textContent);
                commentCountSpan.textContent = Math.max(0, currentCount - 1);
            }
            
            // Check if comments section is now empty
            const commentsList = document.getElementById(`comments-list-${postId}`);
            if (commentsList && commentsList.children.length === 0) {
                commentsList.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>';
            }
        }, 300);
        
        if (window.showNotification) {
            window.showNotification('Comment deleted', 'success');
        }
        
    } catch (error) {
        console.error('❌ Error deleting comment:', error);
        if (window.showNotification) {
            window.showNotification('Failed to delete comment', 'error');
        }
    }
}
// ========================================
// ✅ UPDATED: NOTIFICATION SYSTEM (INTEGRATED)
// ========================================

async function sendLikeNotification(recipientUserId, post) {
    try {
        const currentUserId = localStorage.getItem('tournamentUserId');
        const currentUsername = localStorage.getItem('username');
        
        if (!currentUsername || currentUsername === 'Anonymous') return;
        if (recipientUserId === currentUserId) return; // Don't notify yourself
        
        // ✅ Use your existing notification system
        const { saveNotification } = await import('./notification-storage.js');
        
        await saveNotification(recipientUserId, {
            type: 'like',
            priority: 6,
            message: `❤️ ${currentUsername} liked your post`,
            detail: post.content || post.text || 'your post',
            icon: '❤️',
            
            // Sender info
            triggerUsername: currentUsername,
            triggerUserId: currentUserId,
            
            // Post context
            matchId: post.matchId || null,
            matchTitle: post.matchTitle || null,
            
            // Action
            ctaText: 'View Post',
            ctaAction: 'navigate',
            targetUrl: `/feed.html#post-${post.postId}`
        });
        
        console.log(`✅ Like notification sent to ${recipientUserId}`);
        
    } catch (error) {
        console.error('❌ Error sending like notification:', error);
    }
}

async function sendCommentNotification(recipientUserId, post, commentContent) {
    try {
        const currentUserId = localStorage.getItem('tournamentUserId');
        const currentUsername = localStorage.getItem('username');
        
        if (!currentUsername || currentUsername === 'Anonymous') return;
        if (recipientUserId === currentUserId) return; // Don't notify yourself
        
        // ✅ Use your existing notification system
        const { saveNotification } = await import('./notification-storage.js');
        
        const preview = commentContent.length > 50 
            ? commentContent.substring(0, 50) + '...' 
            : commentContent;
        
        await saveNotification(recipientUserId, {
            type: 'comment',
            priority: 7,
            message: `💬 ${currentUsername} commented on your post`,
            detail: `"${preview}"`,
            icon: '💬',
            
            // Sender info
            triggerUsername: currentUsername,
            triggerUserId: currentUserId,
            
            // Post context
            matchId: post.matchId || null,
            matchTitle: post.matchTitle || null,
            
            // Action
            ctaText: 'View Comment',
            ctaAction: 'navigate',
            targetUrl: `/feed.html#post-${post.postId}`
        });
        
        console.log(`✅ Comment notification sent to ${recipientUserId}`);
        
    } catch (error) {
        console.error('❌ Error sending comment notification:', error);
    }
}

// ========================================
// UPDATE FEED HEADER BANNER
// ========================================

async function updateFeedHeaderBanner() {
    const headerBg = document.querySelector('.profile-header-bg');
    if (!headerBg) return;
    
    try {
        // Get current user's banner from localStorage
        const bannerJson = localStorage.getItem('banner');
        const avatarJson = localStorage.getItem('avatar');
        
        let banner;
        try {
            banner = bannerJson ? JSON.parse(bannerJson) : { type: 'auto' };
        } catch {
            banner = { type: 'auto' };
        }
        
        let avatar;
        try {
            avatar = avatarJson ? JSON.parse(avatarJson) : null;
        } catch {
            avatar = null;
        }
        
        // Apply banner based on type
        if (banner.type === 'default') {
            // Gold gradient
            headerBg.style.background = `
                linear-gradient(135deg, 
                    rgba(200, 170, 110, 0.9) 0%, 
                    rgba(26, 26, 46, 0.95) 50%,
                    rgba(10, 10, 10, 0.98) 100%
                )
            `;
            headerBg.style.backgroundImage = '';
            
        } else if (banner.type === 'champion') {
            // Specific champion splash
            const splashUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${banner.championId}_0.jpg`;
            headerBg.style.backgroundImage = `
                linear-gradient(to bottom, 
                    rgba(0, 0, 0, 0.4) 0%,
                    rgba(10, 10, 10, 0.85) 100%
                ),
                url('${splashUrl}')
            `;
            headerBg.style.backgroundSize = 'cover';
            headerBg.style.backgroundPosition = 'center 30%';
            
        } else {
            // Auto-match avatar
            if (avatar && avatar.type === 'url' && avatar.name) {
                const championId = avatar.name.replace(/['\s]/g, '');
                const splashUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championId}_0.jpg`;
                
                headerBg.style.backgroundImage = `
                    linear-gradient(to bottom, 
                        rgba(0, 0, 0, 0.4) 0%,
                        rgba(10, 10, 10, 0.85) 100%
                    ),
                    url('${splashUrl}')
                `;
                headerBg.style.backgroundSize = 'cover';
                headerBg.style.backgroundPosition = 'center 30%';
            } else {
                // Fallback to gradient for emoji avatars
                headerBg.style.background = `
                    linear-gradient(135deg, 
                        rgba(200, 170, 110, 0.9) 0%, 
                        rgba(26, 26, 46, 0.95) 50%,
                        rgba(10, 10, 10, 0.98) 100%
                    )
                `;
                headerBg.style.backgroundImage = '';
            }
        }
        
        console.log('✅ Feed header banner updated');
        
    } catch (error) {
        console.error('❌ Error updating feed header banner:', error);
    }
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
// CREATE POST ELEMENT (UPDATED with Edit/Delete)
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
    
    // ✅ Check if post is editable (within 15 minutes)
    const postAge = Date.now() - post.timestamp;
    const isEditable = isOwnPost && postAge < (15 * 60 * 1000); // 15 minutes
    const editedIndicator = post.editedAt ? '<span class="edited-indicator">• Edited</span>' : '';
    
    // Build HTML
    postDiv.innerHTML = `
        <div class="post-header">
            <img src="${avatarUrl}" alt="${post.username}" class="user-avatar" data-user-id="${post.userId}">
            <div class="post-meta">
                <span class="username" data-user-id="${post.userId}">${post.username}</span>
                <span class="post-time">${timeAgo}${editedIndicator}</span>
            </div>
            ${isOwnPost ? `
                <div class="post-menu">
                    <button class="post-menu-btn" data-post-id="${post.postId}">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>
                    <div class="post-menu-dropdown" id="menu-${post.postId}" style="display: none;">
                        ${isEditable ? `
                            <button class="menu-item edit-post-btn" data-post-id="${post.postId}">
                                <i class="fa-solid fa-pen"></i> Edit Post
                            </button>
                        ` : ''}
                        <button class="menu-item delete-post-btn" data-post-id="${post.postId}">
                            <i class="fa-solid fa-trash"></i> Delete Post
                        </button>
                    </div>
                </div>
            ` : !isOwnPost ? `
                <button class="follow-btn" data-user-id="${post.userId}" data-username="${post.username}">
                    <i class="fa-solid fa-user-plus"></i>
                    Follow
                </button>
            ` : ''}
        </div>
        
        <div class="post-content" data-post-id="${post.postId}">
            ${renderPostContent(post)}
        </div>
        
        <div class="post-actions-bar">
            <button class="action-btn like-btn" data-post-id="${post.postId}" data-post-author-id="${post.userId}">
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
        
        <!-- Comments Section -->
        <div class="post-comments" id="comments-${post.postId}" style="display: none;">
            <div class="comments-list" id="comments-list-${post.postId}">
                <!-- Comments load here -->
            </div>
            <div class="comment-input-box">
                <img src="${getAvatarUrl(JSON.parse(localStorage.getItem('avatar') || '{}'))}" alt="You" class="comment-avatar">
                <input type="text" class="comment-input" placeholder="Write a comment..." maxlength="280" data-post-id="${post.postId}">
                <button class="send-comment-btn" data-post-id="${post.postId}">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;
    
    // Setup interactions
    setupPostInteractions(postDiv, post);
    
    return postDiv;
}

// ========================================
// ✅ NEW: SETUP POST MENU
// ========================================

function setupPostMenu(postElement, post) {
    const menuBtn = postElement.querySelector('.post-menu-btn');
    const menuDropdown = postElement.querySelector('.post-menu-dropdown');
    
    if (!menuBtn || !menuDropdown) return;
    
    // Toggle menu
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Close other open menus
        document.querySelectorAll('.post-menu-dropdown').forEach(menu => {
            if (menu !== menuDropdown) {
                menu.style.display = 'none';
            }
        });
        
        // Toggle this menu
        menuDropdown.style.display = menuDropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.post-menu')) {
            menuDropdown.style.display = 'none';
        }
    });
    
    // Edit button
    const editBtn = menuDropdown.querySelector('.edit-post-btn');
    if (editBtn) {
        editBtn.addEventListener('click', async () => {
            menuDropdown.style.display = 'none';
            await openEditPostModal(post);
        });
    }
    
    // Delete button
    const deleteBtn = menuDropdown.querySelector('.delete-post-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            menuDropdown.style.display = 'none';
            await deletePost(post.postId, postElement);
        });
    }
}

// ========================================
// ✅ NEW: DELETE POST
// ========================================

async function deletePost(postId, postElement) {
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) {
        return;
    }
    
    try {
        // Delete from Firestore
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await deleteDoc(doc(db, 'posts', postId));
        
        console.log('✅ Post deleted from Firestore');
        
        // Animate removal
        postElement.style.transition = 'all 0.3s ease';
        postElement.style.opacity = '0';
        postElement.style.transform = 'translateX(-20px)';
        
        setTimeout(() => {
            postElement.remove();
            
            // Remove from currentPosts array
            const index = currentPosts.findIndex(p => p.postId === postId);
            if (index > -1) {
                currentPosts.splice(index, 1);
            }
            
            // Show success notification
            if (window.showNotification) {
                window.showNotification('Post deleted successfully', 'success');
            }
        }, 300);
        
    } catch (error) {
        console.error('❌ Error deleting post:', error);
        if (window.showNotification) {
            window.showNotification('Failed to delete post', 'error');
        }
    }
}

// ========================================
// ✅ PARSE SONG MENTIONS FOR TOOLTIPS
// ========================================

// ========================================
// ✅ PARSE SONG MENTIONS FOR TOOLTIPS (FIXED)
// ========================================

function parseSongMentions(text) {
    if (!text) return '';
    if (musicVideos.length === 0) return escapeHtml(text);
    
    // ✅ Use shortTitle from your JSON
    const songNames = musicVideos.map(video => video.shortTitle);
    
    // Sort by length (longest first) to avoid partial matches
    songNames.sort((a, b) => b.length - a.length);
    
    let parsedText = escapeHtml(text);
    
    songNames.forEach(songName => {
        // Case-insensitive match with word boundaries
        const regex = new RegExp(`\\b(${escapeRegex(songName)})\\b`, 'gi');
        
        parsedText = parsedText.replace(regex, (match) => {
            const video = musicVideos.find(v => v.shortTitle.toLowerCase() === match.toLowerCase());
            
            // ✅ Use videoId instead of youtubeId
            if (video && video.videoId) {
                return `<span class="song-mention" 
                    data-song-name="${escapeHtml(video.shortTitle)}" 
                    data-video-id="${video.videoId}" 
                    data-artist="${escapeHtml(video.artist || '')}" 
                    data-year="${video.year || ''}">${match}</span>`;
            }
            return match;
        });
    });
    
    return parsedText;
}

// Helper to escape regex special characters
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========================================
// ✅ NEW: OPEN EDIT POST MODAL
// ========================================

async function openEditPostModal(post) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'edit-post-modal';
    modal.innerHTML = `
        <div class="edit-post-overlay"></div>
        <div class="edit-post-container">
            <div class="edit-post-header">
                <h3><i class="fa-solid fa-pen"></i> Edit Post</h3>
                <button class="close-edit-modal">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <div class="edit-post-body">
                <textarea 
                    class="edit-post-input" 
                    maxlength="280" 
                    placeholder="What's on your mind?"
                >${post.content || post.text || ''}</textarea>
                <div class="edit-post-footer">
                    <span class="edit-char-count">
                        <span id="editCharCount">${(post.content || post.text || '').length}</span>/280
                    </span>
                    <button class="btn-save-edit" disabled>
                        <i class="fa-solid fa-check"></i> Save Changes
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Get elements
    const overlay = modal.querySelector('.edit-post-overlay');
    const closeBtn = modal.querySelector('.close-edit-modal');
    const textarea = modal.querySelector('.edit-post-input');
    const charCount = modal.querySelector('#editCharCount');
    const saveBtn = modal.querySelector('.btn-save-edit');
    
    // Focus textarea
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    // Track changes
    const originalContent = textarea.value;
    
    textarea.addEventListener('input', () => {
        const length = textarea.value.length;
        charCount.textContent = length;
        
        // Enable save only if content changed and not empty
        const hasChanged = textarea.value.trim() !== originalContent.trim();
        const isValid = textarea.value.trim().length > 0;
        saveBtn.disabled = !hasChanged || !isValid;
    });
    
    // Close handlers
    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => modal.remove(), 200);
    };
    
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    
    // Save handler
    saveBtn.addEventListener('click', async () => {
        const newContent = textarea.value.trim();
        
        if (!newContent) {
            alert('Post cannot be empty');
            return;
        }
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        
        try {
            // Update in Firestore
            const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            await updateDoc(doc(db, 'posts', post.postId), {
                content: newContent,
                text: newContent, // Update both fields for compatibility
                editedAt: Date.now()
            });
            
            console.log('✅ Post updated');
            
            // Update in UI
            const postElement = document.querySelector(`[data-post-id="${post.postId}"]`);
            if (postElement) {
                const contentDiv = postElement.querySelector('.post-content');
                if (contentDiv) {
                    // Update content
                    const textEl = contentDiv.querySelector('.post-text');
                    if (textEl) {
                        textEl.textContent = newContent;
                    }
                    
                    // Add "Edited" indicator
                    const timeEl = postElement.querySelector('.post-time');
                    if (timeEl && !timeEl.querySelector('.edited-indicator')) {
                        timeEl.innerHTML += ' <span class="edited-indicator">• Edited</span>';
                    }
                }
            }
            
            // Update in currentPosts array
            const postIndex = currentPosts.findIndex(p => p.postId === post.postId);
            if (postIndex > -1) {
                currentPosts[postIndex].content = newContent;
                currentPosts[postIndex].text = newContent;
                currentPosts[postIndex].editedAt = Date.now();
            }
            
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
            
            if (window.showNotification) {
                window.showNotification('Post updated successfully', 'success');
            }
            
            setTimeout(closeModal, 1000);
            
        } catch (error) {
            console.error('❌ Error updating post:', error);
            saveBtn.innerHTML = '<i class="fa-solid fa-times"></i> Error';
            
            if (window.showNotification) {
                window.showNotification('Failed to update post', 'error');
            }
            
            setTimeout(() => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes';
            }, 2000);
        }
    });
    
    // Show modal with animation
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
}

// ========================================
// CREATE POST
// ========================================

function setupCreatePost() {
    const postInput = document.getElementById('postInput');
    const submitBtn = document.getElementById('submitPostBtn');
    const charCount = document.getElementById('charCount');
    
    if (!postInput || !submitBtn) return;

    // ✅ Setup mention autocomplete
    setupMentionAutocomplete(postInput);
    
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
        
        // ========================================
        // ✅ NEW: SEND MENTION NOTIFICATIONS
        // ========================================
        
        const mentionedUsers = extractMentionedUsers(content);
        
        if (mentionedUsers.length > 0) {
            console.log(`📢 Found ${mentionedUsers.length} mentions:`, mentionedUsers);
            
            for (const mention of mentionedUsers) {
                // Don't notify yourself
                if (mention.userId === userId) continue;
                
                try {
                    await saveNotification(mention.userId, {
                        type: 'mention',
                        priority: 7,
                        message: `📢 ${username} mentioned you in a post`,
                        detail: content.length > 60 ? content.substring(0, 60) + '...' : content,
                        icon: '📢',
                        triggerUsername: username,
                        triggerUserId: userId,
                        ctaText: 'View Post',
                        ctaAction: 'navigate',
                        targetUrl: `/feed.html#post-${postId}`
                    });
                    
                    console.log(`✅ Mention notification sent to @${mention.username}`);
                    
                } catch (error) {
                    console.error(`❌ Error sending mention notification to @${mention.username}:`, error);
                }
            }
        }
        
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
        
        // ✅ Setup tooltips for new post
        setupSongTooltips();
        setupMentionTooltips();
        
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
