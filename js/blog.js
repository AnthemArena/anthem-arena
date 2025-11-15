// ========================================
// BLOG INDEX PAGE - JavaScript
// ========================================

import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const POSTS_PER_PAGE = 12;
let allPosts = [];
let filteredPosts = [];
let currentFilter = 'all';
let displayedCount = POSTS_PER_PAGE;

// ========================================
// INITIALIZE
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Blog index page loading...');
    loadBlogPosts();
    initializeFilters();
});

// ========================================
// LOAD BLOG POSTS
// ========================================

async function loadBlogPosts() {
    try {
        console.log('📥 Loading all blog posts...');
        
        const blogRef = collection(db, 'blog');
        
        // Simple query without orderBy (to avoid index requirement)
        const q = query(
            blogRef,
            where('published', '==', true)
        );
        
        const snapshot = await getDocs(q);
        
        allPosts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Sort manually by publishedDate
        allPosts.sort((a, b) => {
            const dateA = new Date(a.publishedDate || 0);
            const dateB = new Date(b.publishedDate || 0);
            return dateB - dateA; // Descending (newest first)
        });
        
        console.log(`✅ Loaded ${allPosts.length} blog posts`, allPosts);
        
        if (allPosts.length === 0) {
            showEmptyState();
            return;
        }
        
        // Show featured post
        const featuredPost = allPosts.find(post => post.featured);
        if (featuredPost) {
            displayFeaturedPost(featuredPost);
        }
        
        // Display all posts
        filteredPosts = allPosts;
        displayPosts();
        
    } catch (error) {
        console.error('❌ Error loading blog posts:', error);
        showError();
    }
}

// ========================================
// DISPLAY FEATURED POST
// ========================================

function displayFeaturedPost(post) {
    const featuredSection = document.getElementById('featuredSection');
    const featuredContainer = document.getElementById('featuredPost');
    
    if (!featuredContainer) return;
    
    const thumbnailUrl = getPostThumbnail(post);
    const excerpt = post.excerpt || (post.content ? post.content.substring(0, 200) + '...' : 'Read more...');
    
    featuredContainer.innerHTML = `
        <div class="featured-post-card" onclick="location.href='/blog/${post.slug}'">
            <div class="featured-post-image">
                <img src="${thumbnailUrl}" 
                     alt="${post.headline}"
                     onerror="this.src='https://via.placeholder.com/800x500/0a0a0a/C8AA6E?text=Anthem+Arena'">
            </div>
            <div class="featured-post-content">
                <span class="featured-post-category">${formatCategory(post.type)}</span>
                <h2>${post.headline}</h2>
                <p class="featured-post-excerpt">${excerpt}</p>
                <div class="featured-post-meta">
                    <span>${formatDate(post.publishedDate)}</span>
                    <span class="meta-divider">•</span>
                    <span>3 min read</span>
                </div>
                <a href="/blog/${post.slug}" class="btn-primary">Read Full Story</a>
            </div>
        </div>
    `;
    
    featuredSection.style.display = 'block';
}

// ========================================
// DISPLAY POSTS
// ========================================

function displayPosts() {
    const gridContainer = document.getElementById('blogGrid');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    
    if (!gridContainer) return;
    
    // Filter out featured post from grid
    const postsToDisplay = filteredPosts
        .filter(post => !post.featured)
        .slice(0, displayedCount);
    
    if (postsToDisplay.length === 0 && filteredPosts.length === 0) {
        gridContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>No posts found</h3>
                <p>Try selecting a different filter</p>
            </div>
        `;
        loadMoreContainer.style.display = 'none';
        return;
    }
    
    gridContainer.innerHTML = postsToDisplay.map(post => createPostCard(post)).join('');


    // Render icons
    renderCategoryIcons();
    
    // Show/hide load more button
    const hasMore = filteredPosts.filter(p => !p.featured).length > displayedCount;
    loadMoreContainer.style.display = hasMore ? 'block' : 'none';
}

// ========================================
// CREATE POST CARD
// ========================================

function createPostCard(post) {
    const thumbnailUrl = getPostThumbnail(post);
    const excerpt = post.excerpt || (post.content ? post.content.substring(0, 120) + '...' : 'Read more...');
    
    return `
        <div class="blog-card" onclick="location.href='/blog/${post.slug}'">
            <div class="blog-card-image">
                <img src="${thumbnailUrl}" 
                     alt="${post.headline}"
                     onerror="this.src='https://via.placeholder.com/400x250/0a0a0a/C8AA6E?text=Anthem+Arena'">
<span class="blog-card-category" data-category="${post.type}"></span>            </div>
            <div class="blog-card-content">
                <h3>${post.headline}</h3>
                <p class="blog-card-excerpt">${excerpt}</p>
                <div class="blog-card-footer">
                    <span class="blog-card-date">${formatDate(post.publishedDate)}</span>
                    <span class="blog-card-read-more">Read More</span>
                </div>
            </div>
        </div>
    `;
}

// ========================================
// FILTERS
// ========================================

function initializeFilters() {
    console.log('🔧 Initializing filters...');
    
    const filterButtons = document.querySelectorAll('.filter-btn');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    console.log(`📋 Found ${filterButtons.length} filter buttons`);
    
    if (filterButtons.length === 0) {
        console.error('❌ No filter buttons found!');
        return;
    }
    
    filterButtons.forEach((btn, index) => {
        console.log(`Button ${index}:`, btn.textContent.trim(), 'filter:', btn.dataset.filter);
        
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;
            
            console.log('🎯 Filter clicked:', filter);
            console.log('📊 All posts:', allPosts.length, allPosts.map(p => `${p.headline} (${p.type})`));
            
            // Update active state
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Apply filter
            currentFilter = filter;
            displayedCount = POSTS_PER_PAGE;
            
            if (filter === 'all') {
                filteredPosts = allPosts;
            } else {
                filteredPosts = allPosts.filter(post => post.type === filter);
            }
            
            console.log('✅ Filtered posts:', filteredPosts.length, filteredPosts.map(p => `${p.headline} (${p.type})`));
            
            displayPosts();
        });
    });
    
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            displayedCount += POSTS_PER_PAGE;
            displayPosts();
        });
    }
    
    console.log('✅ Filters initialized successfully');
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function getPostThumbnail(post) {
    // Priority 1: Use images.hero if available
    if (post.images?.hero) {
        return post.images.hero;
    }
    
    // Priority 2: Use metadata video ID
    if (post.metadata?.winnerVideoId) {
        return `https://img.youtube.com/vi/${post.metadata.winnerVideoId}/maxresdefault.jpg`;
    }
    
    // Fallback: Placeholder
    return 'https://via.placeholder.com/800x450/0a0a0a/C8AA6E?text=Anthem+Arena';
}

function formatCategory(type) {
    const categories = {
        'match-recap': '<i class="fas fa-chart-bar"></i> Match Recap',
        'round-recap': '<i class="fas fa-trophy"></i> Round Recap',
        'upset-alert': '<i class="fas fa-bolt"></i> Upset Alert',
        'preview': '<i class="fas fa-crystal-ball"></i> Preview',
        'round-preview': '<i class="fas fa-crystal-ball"></i> Round Preview',
        'analysis': '<i class="fas fa-chart-line"></i> Analysis'
    };
    return categories[type] || '<i class="fas fa-newspaper"></i> News';
}

function formatDate(dateString) {
    if (!dateString) return 'Recent';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 24) {
        if (diffHours < 1) return 'Just now';
        return `${diffHours}h ago`;
    } else if (diffDays < 7) {
        return `${diffDays}d ago`;
    } else {
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
}

function showEmptyState() {
    document.getElementById('featuredSection').style.display = 'none';
    document.getElementById('blogGrid').innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
}

function showError() {
    const gridContainer = document.getElementById('blogGrid');
    if (!gridContainer) return;
    
    gridContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">❌</div>
            <h3>Error Loading Posts</h3>
            <p>Something went wrong. Please try again later.</p>
            <button onclick="location.reload()" class="btn-primary">Retry</button>
        </div>
    `;
}
// Render category icons after DOM is ready
function renderCategoryIcons() {
    document.querySelectorAll('[data-category]').forEach(el => {
        el.innerHTML = formatCategory(el.dataset.category);
    });
}