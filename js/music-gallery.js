// music-gallery.js - League of Legends Music Tournament
import { getAllMatches } from './api-client.js';
import { getBookForSong } from './bookMappings.js';

// Keep Firebase imports for backward compatibility if needed elsewhere
import { db } from './firebase-config.js';

// Use shared cache if available (set by vote.js)
window.pageLoadMatchesCache = window.pageLoadMatchesCache || null;

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
export async function getAllTournamentStats() {
    try {
        console.log('📊 Loading tournament stats from edge cache...');
        
        // Check if matches cache exists from vote.js
        const allMatches = window.pageLoadMatchesCache || await getAllMatches();  // ✅ NEW
        
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
    card.dataset.series = video.seriesCollection;
    card.dataset.name = video.title;
    card.dataset.videoId = video.videoId;
    card.dataset.embedAllowed = video.embedAllowed !== false;
    card.dataset.views = video.views;
    
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
    <span class="stat-icon"><i class="fa-solid fa-eye"></i></span>
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

function getAccomplishmentIcon(video) {
    if (video.stats.championships >= 2) return '<i class="fa-solid fa-trophy"></i><i class="fa-solid fa-trophy"></i>';
    if (video.stats.championships === 1) return '<i class="fa-solid fa-trophy"></i>';
    if (video.tournamentStatus === 'eliminated') return '<i class="fa-solid fa-xmark"></i>';
    return '<i class="fa-solid fa-bolt"></i>';
}

function getAccomplishmentText(video) {
    if (video.stats.championships >= 2) return `${video.stats.championships}x Champion`;
    if (video.stats.championships === 1) return 'Champion';
    if (video.tournamentStatus === 'eliminated') return 'Eliminated';
    return 'Competing';
}

function getStatusBadge(video) {
    let badges = '';
    
    // Championship status
    if (video.stats.championships >= 2) {
        badges += '<span class="tag tag-champion">Legend</span>';
    } else if (video.stats.championships === 1) {
        badges += '<span class="tag tag-champion">Champion</span>';
    } else if (video.tournamentStatus === 'eliminated') {
        badges += '<span class="tag tag-eliminated">Eliminated</span>';
    } else {
        badges += '<span class="tag tag-competing">Competing</span>';
    }
    
    // Multi-category indicator
    if (video.additionalCategories && video.additionalCategories.length > 0) {
        const extraCount = video.additionalCategories.length;
        badges += ` <span class="tag tag-multi" title="Also in: ${video.additionalCategories.join(', ')}">+${extraCount} Series</span>`;
    }
    
    return badges;
}

function getPerformanceStatHTML(video) {
    if (video.stats.winRecord && video.stats.winRecord !== '0-0') {
        return `
            <div class="stat-item">
                <span class="stat-icon"><i class="fa-solid fa-chart-line"></i></span>
                <div class="stat-content">
                    <span class="stat-number">${video.stats.winRecord}</span>
                    <span class="stat-desc">${video.stats.winRate} Win Rate</span>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="stat-item">
            <span class="stat-icon"><i class="fa-regular fa-calendar"></i></span>
            <div class="stat-content">
                <span class="stat-number">${video.year}</span>
                <span class="stat-desc">Released</span>
            </div>
        </div>
    `;
}

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
// SORTING FUNCTIONALITY
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
            sorted.sort((a, b) => a.seed - b.seed);
    }
    
    return sorted;
}

// ========================================
// FILTER FUNCTIONALITY (ENHANCED FOR MULTI-CATEGORY)
// ========================================
function filterMusicVideos() {
    const filterInputs = document.querySelectorAll('.filter-input');
    
    // Get all checked filters
    const activeFilters = {
        series: [], 
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
        const additionalCats = video.additionalCategories || [];
        const cardYear = getYearRange(video.year);
        const cardName = video.title.toLowerCase();
        const cardArtist = video.artist.toLowerCase();

        // ✅ FIXED LOGIC:
        // If NO filters are checked in a category, show NOTHING
        // If ALL filters are checked in a category, show EVERYTHING
        // If SOME filters are checked, show only matching items
        
        const seriesInputs = document.querySelectorAll('input[data-filter="series"]');
        const yearInputs = document.querySelectorAll('input[data-filter="year"]');
        
        const allSeriesChecked = Array.from(seriesInputs).every(input => input.checked);
        const allYearsChecked = Array.from(yearInputs).every(input => input.checked);
        
        const noSeriesChecked = activeFilters.series.length === 0;
        const noYearsChecked = activeFilters.year.length === 0;

        // Series filter logic
        let matchesSeries;
        if (noSeriesChecked) {
            matchesSeries = false; // No filters selected = show nothing
        } else if (allSeriesChecked) {
            matchesSeries = true; // All filters selected = show everything
        } else {
            // Some filters selected = check if video matches
            matchesSeries = activeFilters.series.includes(cardSeries) ||
                           activeFilters.series.some(filter => additionalCats.includes(filter));
        }
        
        // Year filter logic
        let matchesYear;
        if (noYearsChecked) {
            matchesYear = false; // No filters selected = show nothing
        } else if (allYearsChecked) {
            matchesYear = true; // All filters selected = show everything
        } else {
            // Some filters selected = check if video matches
            matchesYear = activeFilters.year.includes(cardYear);
        }
        
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

    // Prevent jarring scroll on filter change
    if (window.scrollY > 300) {
        window.scrollTo({
            top: Math.min(window.scrollY, 300),
            behavior: 'smooth'
        });
    }
    
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
// HELPER: UPDATE TOGGLE BUTTON TEXT
// ========================================
function updateToggleButtonText(filterType) {
    const button = document.querySelector(`.filter-toggle[data-target="${filterType}"]`);
    const inputs = document.querySelectorAll(`input[data-filter="${filterType}"]`);
    const allChecked = Array.from(inputs).every(input => input.checked);
    
    if (button) {
        button.textContent = allChecked ? 'Deselect All' : 'Select All';
    }
}

// ========================================
// EVENT LISTENERS SETUP (ENHANCED WITH TOGGLE + SHIFT-CLICK + SCROLL FIX)
// ========================================
function setupEventListeners() {
    const filterInputs = document.querySelectorAll('.filter-input');
    
    // ✅ FIXED: Toggle buttons for Select/Deselect All
    const filterToggles = document.querySelectorAll('.filter-toggle');
    filterToggles.forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.target.dataset.target; // 'series' or 'year'
            const inputs = document.querySelectorAll(`input[data-filter="${target}"]`);
            
            // Check if all are currently checked
            const allChecked = Array.from(inputs).every(input => input.checked);
            
            // Toggle all
            inputs.forEach(input => {
                input.checked = !allChecked;
            });
            
            // Update button text
            e.target.textContent = allChecked ? 'Select All' : 'Deselect All';
            
            // ✅ FIX: Force re-filter after toggling
            filterMusicVideos();
        });
    });

    // ✅ Shift+Click to isolate single filter
    filterInputs.forEach(input => {
        input.addEventListener('click', (e) => {
            // If shift-clicking, deselect all others in that category
            if (e.shiftKey) {
                const filterType = input.dataset.filter;
                
                filterInputs.forEach(otherInput => {
                    if (otherInput.dataset.filter === filterType && otherInput !== input) {
                        otherInput.checked = false;
                    }
                });
                
                // Ensure the clicked item stays checked
                input.checked = true;
                
                // Update toggle button text
                updateToggleButtonText(filterType);
                
                // Trigger filter
                filterMusicVideos();
                
                // ✅ FIX: Prevent normal change event from firing
                e.preventDefault();
                return;
            }
        });
        
        // Regular change event (no shift key)
        input.addEventListener('change', (e) => {
            // ✅ FIX: Only update if not a shift-click (already handled above)
            if (!e.shiftKey) {
                const filterType = input.dataset.filter;
                updateToggleButtonText(filterType);
                filterMusicVideos();
            }
        });
    });

    // ✅ Smooth filter panel scrolling (prevent scroll hijacking)
    const filterPanel = document.querySelector('.filter-panel');
    if (filterPanel) {
        filterPanel.addEventListener('wheel', (e) => {
            const { scrollTop, scrollHeight, clientHeight } = filterPanel;
            const atTop = scrollTop === 0;
            const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
            
            // Allow scroll within panel, prevent propagation to page
            if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
                e.stopPropagation();
            }
        }, { passive: false });
    }

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
            
            // Reset toggle button texts
            filterToggles.forEach(button => {
                button.textContent = 'Deselect All';
            });
            
            if (searchInput) searchInput.value = '';
            if (sortSelect) sortSelect.value = 'seed';
            
            // ✅ FIX: Ensure filter runs after reset
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

// (getAllTournamentStats already exported at line 28)

console.log('League Music Gallery script loaded');