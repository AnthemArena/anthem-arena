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
        
        // ✅ NEW: Get matches from edge cache
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
            
            if (liveStats) {
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
    card.dataset.accolade = video.accolade;
    card.dataset.name = video.title;
    card.dataset.videoId = video.videoId;
    card.dataset.embedAllowed = video.embedAllowed !== false;
    
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
                    <span class="stat-icon">${getChampionIcon(video.stats.championships)}</span>
                    <div class="stat-content">
                        <span class="stat-number">${video.stats.championships}</span>
                        <span class="stat-desc">Championships</span>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">⚔️</span>
                    <div class="stat-content">
                        <span class="stat-number">${video.stats.winRecord}</span>
                        <span class="stat-desc">Win Record</span>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">🔥</span>
                    <div class="stat-content">
                        <span class="stat-number">${video.stats.winRate}</span>
                        <span class="stat-desc">Win Rate</span>
                    </div>
                </div>
            </div>
            
            <div class="character-tags">
                <span class="tag tag-seed">Seed #${video.seed}</span>
                <span class="tag tag-category">${getCategoryLabel(video.category)}</span>
                <span class="tag tag-accolade">${getAccoladeLabel(video.accolade)}</span>
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

// Helper function for accolade labels
function getAccoladeLabel(accolade) {
    const labels = {
        'legend': '🏆🏆 Legend',
        'champion': '🏆 Champion',
        'contender': '🥈 Finalist',
        'competitor': '⚔️ Competitor'
    };
    return labels[accolade] || '⚔️ Competitor';
}

function getCategoryLabel(category) {
    const labels = {
        'worlds-anthem': 'Worlds Anthem',
        'virtual-group': 'Virtual Group',
        'cinematic': 'Cinematic',
        'champion-theme': 'Champion Theme',
        'esports': 'Esports Event'
    };
    return labels[category] || category;
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

function getChampionIcon(count) {
    if (count >= 2) return '🏆';
    if (count === 1) return '🏆';
    return '⭐';
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ========================================
// FILTER FUNCTIONALITY
// ========================================
function filterMusicVideos() {
    const filterInputs = document.querySelectorAll('.filter-input');
    const musicCards = document.querySelectorAll('.character-card');
    
    // Get all checked filters
    const activeFilters = {
        category: [],
        year: [],
        artist: [],
        accolade: []
    };

    filterInputs.forEach(input => {
        if (input.checked) {
            const filterType = input.dataset.filter;
            activeFilters[filterType].push(input.value);
        }
    });

    // Get search term
    const searchTerm = searchInput.value.toLowerCase();

    // Filter cards
    let visibleCount = 0;

    musicCards.forEach(card => {
        const cardCategory = card.dataset.category;
        const cardYear = card.dataset.year;
        const cardArtist = card.dataset.artist;
        const cardAccolade = card.dataset.accolade;
        const cardName = card.dataset.name.toLowerCase();

        // Check if card matches all filter criteria
        const matchesCategory = activeFilters.category.length === 0 || activeFilters.category.includes(cardCategory);
        const matchesYear = activeFilters.year.length === 0 || activeFilters.year.includes(cardYear);
        const matchesArtist = activeFilters.artist.length === 0 || activeFilters.artist.includes(cardArtist);
        const matchesAccolade = activeFilters.accolade.length === 0 || activeFilters.accolade.includes(cardAccolade);
        const matchesSearch = searchTerm === '' || cardName.includes(searchTerm);

        // Show or hide card
        if (matchesCategory && matchesYear && matchesArtist && matchesAccolade && matchesSearch) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    // Update count
    musicCount.textContent = visibleCount;

    // Show/hide no results message
    if (visibleCount === 0) {
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
    searchInput.addEventListener('input', filterMusicVideos);

    // Reset filters
    resetButton.addEventListener('click', () => {
        filterInputs.forEach(input => {
            input.checked = true;
        });
        searchInput.value = '';
        filterMusicVideos();
    });

    // ✨ NEW: Entire card is clickable for video
    document.querySelectorAll('.character-card').forEach(card => {
        // Make entire card show pointer cursor
        card.style.cursor = 'pointer';
        
        // ✅ UPDATED: Prevent book recommendation area from triggering video
        const bookRec = card.querySelector('.card-book-recommendation');
        if (bookRec) {
            bookRec.addEventListener('click', function(e) {
                e.stopPropagation(); // Stop the card click event
            });
            bookRec.style.cursor = 'default'; // Show normal cursor
        }
        
        // Click anywhere on card opens video
        card.addEventListener('click', function(e) {
            const videoId = this.dataset.videoId;
            const embedAllowed = this.dataset.embedAllowed === 'true';
            
            if (!embedAllowed) {
                // Open directly on YouTube (new tab)
                window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
            } else {
                // Open in modal
                openVideoModal(videoId);
            }
        });
        
        // Show play overlay on hover anywhere on card
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

    // Close video modal
    if (videoModalClose) {
        videoModalClose.addEventListener('click', closeVideoModal);
    }
    
    videoModal.addEventListener('click', function(e) {
        if (e.target === videoModal) {
            closeVideoModal();
        }
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && videoModal.style.display === 'block') {
            closeVideoModal();
        }
    });
}

function openVideoModal(videoId) {
    modalVideoFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    videoModal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent background scroll
}

function closeVideoModal() {
    videoModal.style.display = 'none';
    modalVideoFrame.src = '';
    document.body.style.overflow = ''; // Restore scroll
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
 * @param {string} songSlug - Song identifier
 * @param {string} location - Where the click occurred
 */
function trackBookClick(songSlug, location) {
    console.log(`📊 Book clicked: ${songSlug} from ${location}`);
    // Add analytics tracking here if needed
}

// Make available globally
window.trackBookClick = trackBookClick;

// ========================================
// EXPORT FOR USE IN OTHER PAGES
// ========================================
export { getAllTournamentStats };

console.log('League Music Gallery script loaded');