// music-gallery.js - League of Legends Music Tournament
import { getAllMatches } from './api-client.js';
import { getBookForSong } from './bookMappings.js';

// Keep Firebase imports for backward compatibility if needed elsewhere
import { db } from './firebase-config.js';

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

let allVideos = []; // Store all video data
const searchInput = document.getElementById('searchInput');
const musicCount = document.getElementById('characterCount');
const noResults = document.getElementById('noResults');
const resetButton = document.getElementById('resetFilters');
const musicGrid = document.getElementById('characterGrid');
const sortSelect = document.getElementById('sortSelect');

// Video modal elements
const videoModal = document.getElementById('videoModal');
const modalVideoFrame = document.getElementById('modalVideoFrame');
const videoModalClose = document.querySelector('.video-modal-close');

// ========================================
// GET ALL TOURNAMENT STATS (OPTIMIZED - ONE QUERY)
// ========================================
async function getAllTournamentStats() {
    try {
        console.log('📊 Loading tournament stats from edge cache...');
        
        const allMatches = await getAllMatches();
        
        // Create stats object for all songs
        const statsMap = {};
        
        allMatches.forEach(match => {
            
            // Only count completed matches
            if (match.status !== 'completed') return;
            
            const winnerId = match.winnerId || match.winner;
            const song1Id = match.song1.id;
            const song2Id = match.song2.id;
            
            // Initialize stats if not exists
            if (!statsMap[song1Id]) {
                statsMap[song1Id] = { wins: 0, losses: 0 };
            }
            if (!statsMap[song2Id]) {
                statsMap[song2Id] = { wins: 0, losses: 0 };
            }
            
            // Update win/loss records
            if (winnerId === song1Id) {
                statsMap[song1Id].wins++;
                statsMap[song2Id].losses++;
            } else if (winnerId === song2Id) {
                statsMap[song2Id].wins++;
                statsMap[song1Id].losses++;
            }
        });
        
        // Convert to readable format
        const formattedStats = {};
        for (const [songId, stats] of Object.entries(statsMap)) {
            const totalMatches = stats.wins + stats.losses;
            const winRate = totalMatches > 0 ? Math.round((stats.wins / totalMatches) * 100) : 0;
            
            formattedStats[songId] = {
                wins: stats.wins,
                losses: stats.losses,
                winRecord: `${stats.wins}-${stats.losses}`,
                winRate: `${winRate}%`,
                totalMatches
            };
        }
        
        console.log(`✅ Loaded stats for ${Object.keys(formattedStats).length} songs`);
        return formattedStats;
        
    } catch (error) {
        console.error('Error fetching tournament stats:', error);
        return {};
    }
}

// ========================================
// LOAD MUSIC VIDEOS (OPTIMIZED)
// ========================================
async function loadMusicVideos() {
    try {
        const response = await fetch('/data/music-videos.json');
        allVideos = await response.json();
        
        // 🔥 Load ALL stats in ONE query
        const tournamentStats = await getAllTournamentStats();
        
        // Apply live stats to each video
        allVideos.forEach(video => {
            const liveStats = tournamentStats[video.id];
            
            if (liveStats && liveStats.totalMatches > 0) {
                // Override JSON stats with live Firebase data
                video.stats.winRecord = liveStats.winRecord;
                video.stats.winRate = liveStats.winRate;
                
                console.log(`✅ ${video.shortTitle}: ${liveStats.winRecord} (${liveStats.winRate})`);
            }
        });
        
        renderVideos(allVideos);
        setupEventListeners();
        filterMusicVideos();
        
        console.log(`✅ Loaded ${allVideos.length} music videos with live stats`);
    } catch (error) {
        console.error('Error loading music videos:', error);
        noResults.style.display = 'block';
        noResults.innerHTML = '<h3>Error loading music videos</h3><p>Please refresh the page.</p>';
    }
}

// ========================================
// RENDER VIDEO CARDS
// ========================================
function renderVideos(videos) {
    musicGrid.innerHTML = ''; // Clear existing cards
    
    videos.forEach(video => {
        const card = createVideoCard(video);
        musicGrid.appendChild(card);
    });
}

// ========================================
// CREATE INDIVIDUAL VIDEO CARD
// ========================================
function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'character-card';
    
    // Set data attributes for filtering
    card.dataset.category = video.category;
    card.dataset.year = getYearRange(video.year);
    card.dataset.artist = video.artistGroup;
    card.dataset.series = video.seriesCollection; // ✅ NEW: Filter by series
    card.dataset.name = video.title;
    card.dataset.videoId = video.videoId;
    card.dataset.embedAllowed = video.embedAllowed !== false;
    card.dataset.views = video.views; // ✅ For sorting
    
    // ✨ Get book recommendation for this video
    const book = getBookForSong(video);
    const thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`;
    
    // ✨ Build book recommendation section (if book exists)
    let bookSection = '';
    if (book) {
        bookSection = `
            <div class="card-book-recommendation">
                <div class="book-rec-compact">
                    <span class="book-icon-small">📖</span>
                    <div class="book-rec-text">
                        <span class="book-rec-label">Explore the lore:</span>
                        <a href="${book.amazonLink}" 
                           target="_blank" 
                           rel="noopener noreferrer nofollow"
                           class="book-rec-link"
                           onclick="event.stopPropagation(); trackBookClick('${video.slug}', 'gallery-card');">
                            ${book.title} →
                        </a>
                    </div>
                </div>
            </div>
        `;
    }
    
    card.innerHTML = `
        <div class="character-image-wrapper video-thumbnail">
            <img src="${thumbnailUrl}" 
                 alt="${video.shortTitle}" 
                 class="character-image">
            
            <div class="play-overlay">
                <div class="play-button">
                    <svg width="60" height="60" viewBox="0 0 60 60">
                        <circle cx="30" cy="30" r="28" fill="rgba(200, 155, 60, 0.95)"/>
                        <polygon points="23,18 23,42 42,30" fill="#0a0a0a"/>
                    </svg>
                </div>
            </div>
        </div>
        
        <div class="character-info">
            <h3 class="character-name">${video.shortTitle}</h3>
            <p class="character-title">${getSubtitle(video)}</p>
            
            <div class="tournament-stats-detail">
                <div class="stat-item">
                    <span class="stat-icon">${getAccomplishmentIcon(video)}</span>
                    <div class="stat-content">
                        <span class="stat-number">${getAccomplishmentText(video)}</span>
                        <span class="stat-desc">Status</span>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">👁️</span>
                    <div class="stat-content">
                        <span class="stat-number">${formatViews(video.views)}</span>
                        <span class="stat-desc">Views</span>
                    </div>
                </div>
                ${getPerformanceStatHTML(video)}
            </div>
            
            <div class="character-tags">
                <span class="tag tag-seed">Seed #${video.seed}</span>
                <span class="tag tag-category">${video.seriesCollection}</span>
                ${getStatusBadge(video)}
            </div>
            
            ${bookSection}
        </div>
    `;
    
    return card;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function getYearRange(year) {
    if (year >= 2024) return '2024-2025';
    if (year >= 2022) return '2022-2023';
    if (year >= 2020) return '2020-2021';
    if (year >= 2018) return '2018-2019';
    return '2014-2017';
}

function getSubtitle(video) {
    let subtitle = '';
    
    // Add series/event info
    if (video.seriesCollection === 'Worlds Anthem') {
        subtitle = `Worlds ${video.year}`;
    } else if (video.seriesCollection) {
        subtitle = video.seriesCollection;
    } else {
        subtitle = `${video.year}`;
    }
    
    // Add artist
    subtitle += ` • ${video.artist}`;
    
    return subtitle;
}

// ✅ NEW: Accomplishment display logic
function getAccomplishmentIcon(video) {
    if (video.stats.championships >= 2) return '🏆🏆';
    if (video.stats.championships === 1) return '🏆';
    if (video.tournamentStatus === 'eliminated') return '❌';
    return '⚔️';
}

function getAccomplishmentText(video) {
    if (video.stats.championships >= 2) return `${video.stats.championships}x Champion`;
    if (video.stats.championships === 1) return 'Champion';
    if (video.tournamentStatus === 'eliminated') return 'Eliminated';
    return 'Competing';
}

function getStatusBadge(video) {
    if (video.stats.championships >= 2) {
        return '<span class="tag tag-champion">Legend</span>';
    }
    if (video.stats.championships === 1) {
        return '<span class="tag tag-champion">Champion</span>';
    }
    if (video.tournamentStatus === 'eliminated') {
        return '<span class="tag tag-eliminated">Eliminated</span>';
    }
    return '<span class="tag tag-competing">Competing</span>';
}

// ✅ NEW: Only show performance if they have real data
function getPerformanceStatHTML(video) {
    // Only show if they have actual matches (not 0-0)
    if (video.stats.winRecord && video.stats.winRecord !== '0-0') {
        return `
            <div class="stat-item">
                <span class="stat-icon">📊</span>
                <div class="stat-content">
                    <span class="stat-number">${video.stats.winRecord}</span>
                    <span class="stat-desc">${video.stats.winRate} Win Rate</span>
                </div>
            </div>
        `;
    }
    
    // Show year as fallback
    return `
        <div class="stat-item">
            <span class="stat-icon">📅</span>
            <div class="stat-content">
                <span class="stat-number">${video.year}</span>
                <span class="stat-desc">Released</span>
            </div>
        </div>
    `;
}

// ✅ NEW: Format view count
function formatViews(views) {
    if (views >= 1000000000) return (views / 1000000000).toFixed(1) + 'B';
    if (views >= 1000000) return (views / 1000000).toFixed(0) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(0) + 'K';
    return views.toString();
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ========================================
// ✅ NEW: SORTING FUNCTIONALITY
// ========================================
function sortVideos(videos, sortBy) {
    const sorted = [...videos];
    
    switch(sortBy) {
        case 'popular':
            sorted.sort((a, b) => b.views - a.views);
            break;
        case 'newest':
            sorted.sort((a, b) => b.year - a.year || b.uploadDate.localeCompare(a.uploadDate));
            break;
        case 'oldest':
            sorted.sort((a, b) => a.year - b.year || a.uploadDate.localeCompare(b.uploadDate));
            break;
        case 'alphabetical':
            sorted.sort((a, b) => a.shortTitle.localeCompare(b.shortTitle));
            break;
        case 'seed':
            sorted.sort((a, b) => a.seed - b.seed);
            break;
        case 'championships':
            sorted.sort((a, b) => (b.stats.championships || 0) - (a.stats.championships || 0));
            break;
        default:
            // Default: seed order
            sorted.sort((a, b) => a.seed - b.seed);
    }
    
    return sorted;
}

// ========================================
// FILTER FUNCTIONALITY
// ========================================
function filterMusicVideos() {
    const filterInputs = document.querySelectorAll('.filter-input');
    const musicCards = document.querySelectorAll('.character-card');
    
    // Get all checked filters
    const activeFilters = {
        series: [], // ✅ NEW: Filter by series/collection
        year: []
    };

    filterInputs.forEach(input => {
        if (input.checked) {
            const filterType = input.dataset.filter;
            const value = input.value;
            
            if (filterType === 'series') {
                activeFilters.series.push(value);
            } else if (filterType === 'year') {
                activeFilters.year.push(value);
            }
        }
    });

    // Get search term
    const searchTerm = searchInput.value.toLowerCase();
    
    // Get sort option
    const sortBy = sortSelect ? sortSelect.value : 'seed';

    // Filter cards
    let visibleVideos = [];

    allVideos.forEach(video => {
        const cardSeries = video.seriesCollection;
        const cardYear = getYearRange(video.year);
        const cardName = video.title.toLowerCase();
        const cardArtist = video.artist.toLowerCase();

        // Check if card matches all filter criteria
        const matchesSeries = activeFilters.series.length === 0 || activeFilters.series.includes(cardSeries);
        const matchesYear = activeFilters.year.length === 0 || activeFilters.year.includes(cardYear);
        const matchesSearch = searchTerm === '' || cardName.includes(searchTerm) || cardArtist.includes(searchTerm);

        // Show or hide card
        if (matchesSeries && matchesYear && matchesSearch) {
            visibleVideos.push(video);
        }
    });
    
    // Sort visible videos
    visibleVideos = sortVideos(visibleVideos, sortBy);
    
    // Render sorted videos
    renderVideos(visibleVideos);
    
    // Re-attach event listeners
    attachCardEventListeners();

    // Update count
    musicCount.textContent = visibleVideos.length;

    // Show/hide no results message
    if (visibleVideos.length === 0) {
        noResults.style.display = 'block';
    } else {
        noResults.style.display = 'none';
    }
}

// ========================================
// EVENT LISTENERS SETUP
// ========================================
function setupEventListeners() {
    // Filter inputs
    const filterInputs = document.querySelectorAll('.filter-input');
    filterInputs.forEach(input => {
        input.addEventListener('change', filterMusicVideos);
    });

    // Search input
    if (searchInput) {
        searchInput.addEventListener('input', filterMusicVideos);
    }
    
    // Sort select
    if (sortSelect) {
        sortSelect.addEventListener('change', filterMusicVideos);
    }

    // Reset filters
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            filterInputs.forEach(input => {
                input.checked = true;
            });
            if (searchInput) searchInput.value = '';
            if (sortSelect) sortSelect.value = 'seed';
            filterMusicVideos();
        });
    }
    
    // Attach card listeners
    attachCardEventListeners();

    // Close video modal
    if (videoModalClose) {
        videoModalClose.addEventListener('click', closeVideoModal);
    }
    
    if (videoModal) {
        videoModal.addEventListener('click', function(e) {
            if (e.target === videoModal) {
                closeVideoModal();
            }
        });
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && videoModal && videoModal.style.display === 'block') {
            closeVideoModal();
        }
    });
}

function attachCardEventListeners() {
    document.querySelectorAll('.character-card').forEach(card => {
        // Make entire card show pointer cursor
        card.style.cursor = 'pointer';
        
        // Prevent book recommendation area from triggering video
        const bookRec = card.querySelector('.card-book-recommendation');
        if (bookRec) {
            bookRec.addEventListener('click', function(e) {
                e.stopPropagation();
            });
            bookRec.style.cursor = 'default';
        }
        
        // Click anywhere on card opens video
        card.addEventListener('click', function(e) {
            const videoId = this.dataset.videoId;
            const embedAllowed = this.dataset.embedAllowed === 'true';
            
            if (!embedAllowed) {
                window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
            } else {
                openVideoModal(videoId);
            }
        });
        
        // Show play overlay on hover
        card.addEventListener('mouseenter', function() {
            const overlay = this.querySelector('.play-overlay');
            if (overlay) {
                overlay.style.opacity = '1';
            }
        });
        
        card.addEventListener('mouseleave', function() {
            const overlay = this.querySelector('.play-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
            }
        });
    });
}

function openVideoModal(videoId) {
    if (modalVideoFrame && videoModal) {
        modalVideoFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
        videoModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

function closeVideoModal() {
    if (videoModal && modalVideoFrame) {
        videoModal.style.display = 'none';
        modalVideoFrame.src = '';
        document.body.style.overflow = '';
    }
}

// ========================================
// INITIALIZE ON PAGE LOAD (CONDITIONAL)
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Only run gallery-specific code if we're on the gallery page
    if (musicGrid && searchInput) {
        loadMusicVideos();
    } else {
        console.log('Gallery elements not found - skipping gallery initialization');
    }
});

/**
 * Track book clicks for analytics
 */
function trackBookClick(songSlug, location) {
    console.log(`📊 Book clicked: ${songSlug} from ${location}`);
}

// Make available globally
window.trackBookClick = trackBookClick;

// ========================================
// EXPORT FOR USE IN OTHER PAGES
// ========================================
export { getAllTournamentStats };

console.log('League Music Gallery script loaded');