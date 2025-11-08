// ========================================
// YOUTUBE PLAYLIST CAROUSEL
// ========================================

const PLAYLIST_ID = 'PLlU9fZcbJfgtSQuaJlo1BmSjwDVQb2kgY';
// At the top — NO hardcoded key!
const API_KEY = window.YOUTUBE_API_KEY;

if (!API_KEY || API_KEY.includes('<%')) {
    console.error('YouTube API key failed to load. Check Netlify.');
}
const MAX_RESULTS = 50; // Increased to get more videos
const PLAYLIST_NAME = 'Anthem Arena Season 1'; // ✅ Playlist name

let currentVideoId = null;
let playlistVideos = [];

// ========================================
// FETCH PLAYLIST VIDEOS
// ========================================
async function fetchPlaylistVideos() {
    try {
        const response = await fetch('/.netlify/functions/youtube');
        const data = await response.json();

        if (data.error) {
            console.error('YouTube API Error:', data.error);
            return [];
        }

        playlistVideos = data.items.map(item => ({
            videoId: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium.url,
            publishedAt: item.snippet.publishedAt
        }));

        return playlistVideos;
    } catch (error) {
        console.error('Error fetching playlist:', error);
        return [];
    }
}


// ========================================
// RENDER PLAYLIST CAROUSEL
// ========================================
async function renderPlaylistCarousel() {
    const container = document.getElementById('youtube-playlist-container');
    if (!container) return;
    
    const videos = await fetchPlaylistVideos();
    
    if (videos.length === 0) {
        container.innerHTML = `
            <div class="youtube-playlist-section">
                <div class="section-header">
                    <p style="color: #999; text-align: center;">Unable to load videos. Please check back later.</p>
                </div>
            </div>
        `;
        return;
    }
        // ✅ NO default video - player starts hidden
    currentVideoId = null;
    
    const carouselHTML = `
        <div class="youtube-playlist-section">
            <div class="container">
                <div class="section-header">
                    <span class="section-label">🎬 Match Highlights</span>
                    <h2 class="section-title">${PLAYLIST_NAME}</h2>
                    <p class="section-subtitle">Follow the action and watch the H2H matches on Youtube! • ${videos.length} videos</p>
                </div>
                
                <!-- Video Thumbnails Carousel -->
                <div class="video-carousel-wrapper">
                    <div class="video-carousel">
                        ${videos.map((video, index) => `
                            <div class="video-thumbnail-card" 
                                 data-video-id="${video.videoId}"
                                 onclick="loadVideo('${video.videoId}')">
                                <img src="${video.thumbnail}" 
                                     alt="${video.title}"
                                     loading="lazy">
                                <div class="video-card-overlay">
                                    <i class="fas fa-play-circle"></i>
                                </div>
                                <div class="video-card-title">${truncateTitle(video.title)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- ✅ Active Video Player - HIDDEN BY DEFAULT with Close Button -->
                <div class="youtube-player-container" id="youtube-player-container" style="display: none;">
                    <button class="player-close-btn" onclick="closePlayer()" aria-label="Close video player">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="player-wrapper">
                        <iframe id="youtube-playlist-player"
                                src=""
                                frameborder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowfullscreen>
                        </iframe>
                    </div>
                </div>
                
                <!-- Playlist CTA -->
                <div class="playlist-cta">
                    <a href="https://www.youtube.com/playlist?list=${PLAYLIST_ID}" 
                       target="_blank" 
                       class="btn btn-primary">
                        <i class="fab fa-youtube"></i>
                        Watch Full Playlist on YouTube
                    </a>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = carouselHTML;
}

// ========================================
// LOAD VIDEO IN PLAYER
// ========================================
window.loadVideo = function(videoId) {
    currentVideoId = videoId;
    
    // ✅ Show player container with smooth reveal
    const playerContainer = document.getElementById('youtube-player-container');
    if (playerContainer && playerContainer.style.display === 'none') {
        playerContainer.style.display = 'block';
        // Smooth scroll to player
        setTimeout(() => {
            playerContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
    
    // Update player iframe
    const player = document.getElementById('youtube-playlist-player');
    if (player) {
        player.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
    
    // Update active thumbnail
    document.querySelectorAll('.video-thumbnail-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.videoId === videoId) {
            card.classList.add('active');
        }
    });
};

// ========================================
// CLOSE VIDEO PLAYER
// ========================================
window.closePlayer = function() {
    const playerContainer = document.getElementById('youtube-player-container');
    if (playerContainer) {
        playerContainer.style.display = 'none';
        
        // Stop video playback
        const player = document.getElementById('youtube-playlist-player');
        if (player) {
            player.src = '';
        }
        
        // Clear active states
        document.querySelectorAll('.video-thumbnail-card').forEach(card => {
            card.classList.remove('active');
        });
        
        // Reset current video
        currentVideoId = null;
    }
};

// ========================================
// LOAD VIDEO IN PLAYER
// ========================================
window.loadVideo = function(videoId) {
    currentVideoId = videoId;
    
    // ✅ Show player container with smooth reveal
    const playerContainer = document.getElementById('youtube-player-container');
    if (playerContainer && playerContainer.style.display === 'none') {
        playerContainer.style.display = 'block';
        // Smooth scroll to player
        setTimeout(() => {
            playerContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
    
    // Update player iframe
    const player = document.getElementById('youtube-playlist-player');
    if (player) {
        player.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
    
    // Update active thumbnail
    document.querySelectorAll('.video-thumbnail-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.videoId === videoId) {
            card.classList.add('active');
        }
    });
};

// ========================================
// HELPER: TRUNCATE TITLE
// ========================================
function truncateTitle(title) {
    const maxLength = 40;
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
}

// ========================================
// INITIALIZE ON PAGE LOAD
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    renderPlaylistCarousel();
});