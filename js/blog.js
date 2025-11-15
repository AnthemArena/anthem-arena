// ========================================
// BLOG POST PAGE - JavaScript
// ========================================

import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentPost = null;

// ========================================
// INITIALIZE
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    const slug = getSlugFromURL();
    
    if (!slug) {
        showError('No blog post specified');
        return;
    }
    
    loadBlogPost(slug);
    initializeShareButtons();
});

// ========================================
// LOAD BLOG POST
// ========================================

async function loadBlogPost(slug) {
    try {
        console.log(`📥 Loading blog post: ${slug}`);
        
        const blogRef = collection(db, 'blog');
        const q = query(
            blogRef,
            where('slug', '==', slug),
            where('published', '==', true),
            limit(1)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            showError('Post not found');
            return;
        }
        
        currentPost = {
            id: snapshot.docs[0].id,
            ...snapshot.docs[0].data()
        };
        
        console.log('✅ Post loaded:', currentPost);
        
        displayPost(currentPost);
        loadRelatedPosts(currentPost);
        
    } catch (error) {
        console.error('❌ Error loading blog post:', error);
        showError('Failed to load post');
    }
}

// ========================================
// DISPLAY POST
// ========================================

function displayPost(post) {
    // Hide loading, show content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('postContent').style.display = 'block';
    
    // Update page title and meta
    document.title = `${post.headline} - Anthem Arena`;
    document.getElementById('pageTitle').textContent = `${post.headline} - Anthem Arena`;
    document.getElementById('pageDescription').content = post.lede || post.headline;
    document.getElementById('ogTitle').content = post.headline;
    document.getElementById('ogDescription').content = post.lede || post.headline;
    
    // Hero image
    const thumbnailUrl = getPostThumbnail(post);
    document.getElementById('postHeroImage').innerHTML = `
        <img src="${thumbnailUrl}" 
             alt="${post.headline}"
             onerror="this.src='https://via.placeholder.com/1200x600/1a1a2e/0ea5e9?text=Anthem+Arena'">
    `;
    document.getElementById('ogImage').content = thumbnailUrl;
    
    // Category
    document.getElementById('postCategory').textContent = formatCategory(post.type);
    
    // Headline
    document.getElementById('postHeadline').textContent = post.headline;
    
    // Meta
    document.getElementById('postDate').textContent = formatDate(post.publishedDate);
    document.getElementById('postReadTime').textContent = post.readTime || '3 min read';
    
    // Lede
    document.getElementById('postLede').textContent = post.lede || '';
    
    // Match stats widget (if match recap)
    if (post.type === 'match-recap' && post.matchData) {
        displayMatchStats(post.matchData);
    }
    
    // Post sections
    displaySections(post.sections || []);
    
    // Tags
    displayTags(post.tags || []);
}

// ========================================
// DISPLAY MATCH STATS
// ========================================

function displayMatchStats(matchData) {
    const widget = document.getElementById('matchStatsWidget');
    if (!widget) return;
    
    const { song1, song2, winnerId } = matchData;
    
    widget.innerHTML = `
        <h3>⚔️ Match Result</h3>
        <div class="match-stats-grid">
            <div class="match-stats-song ${song1.id === winnerId ? 'winner' : ''}">
                <div class="match-stats-song-title">${song1.shortTitle || song1.title}</div>
                <div class="match-stats-song-artist">${song1.artist}</div>
                <div class="match-stats-votes">${song1.votes.toLocaleString()}</div>
                ${song1.id === winnerId ? '<div class="match-stats-winner">🏆 Winner</div>' : ''}
            </div>
            
            <div class="match-stats-vs">VS</div>
            
            <div class="match-stats-song ${song2.id === winnerId ? 'winner' : ''}">
                <div class="match-stats-song-title">${song2.shortTitle || song2.title}</div>
                <div class="match-stats-song-artist">${song2.artist}</div>
                <div class="match-stats-votes">${song2.votes.toLocaleString()}</div>
                ${song2.id === winnerId ? '<div class="match-stats-winner">🏆 Winner</div>' : ''}
            </div>
        </div>
    `;
    
    widget.style.display = 'block';
}

// ========================================
// DISPLAY SECTIONS
// ========================================

function displaySections(sections) {
    const container = document.getElementById('postSections');
    if (!container) return;
    
    container.innerHTML = sections.map(section => `
        <div class="post-section">
            ${section.heading ? `<h2>${section.heading}</h2>` : ''}
            ${section.content.split('\n\n').map(para => `<p>${para}</p>`).join('')}
        </div>
    `).join('');
}

// ========================================
// DISPLAY TAGS
// ========================================

function displayTags(tags) {
    const container = document.getElementById('postTags');
    if (!container) return;
    
    if (tags.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.innerHTML = tags.map(tag => 
        `<span class="tag">#${tag}</span>`
    ).join('');
}

// ========================================
// LOAD RELATED POSTS
// ========================================

async function loadRelatedPosts(currentPost) {
    try {
        const blogRef = collection(db, 'blog');
        const q = query(
            blogRef,
            where('published', '==', true),
            where('type', '==', currentPost.type),
            orderBy('publishedDate', 'desc'),
            limit(4)
        );
        
        const snapshot = await getDocs(q);
        const relatedPosts = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(post => post.id !== currentPost.id)
            .slice(0, 3);
        
        if (relatedPosts.length === 0) return;
        
        const container = document.getElementById('relatedPosts');
        const section = document.getElementById('relatedPostsSection');
        
        container.innerHTML = relatedPosts.map(post => `
            <a href="/blog/${post.slug}" class="related-post-item">
                <div class="related-post-image">
                    <img src="${getPostThumbnail(post)}" 
                         alt="${post.headline}"
                         onerror="this.src='https://via.placeholder.com/80x80/1a1a2e/0ea5e9?text=AA'">
                </div>
                <div class="related-post-content">
                    <h5>${post.headline}</h5>
                    <p>${formatDate(post.publishedDate)}</p>
                </div>
            </a>
        `).join('');
        
        section.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading related posts:', error);
    }
}

// ========================================
// SHARE FUNCTIONALITY
// ========================================

function initializeShareButtons() {
    document.getElementById('shareTwitter')?.addEventListener('click', () => {
        const url = window.location.href;
        const text = currentPost ? currentPost.headline : 'Check out this post';
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    });
    
    document.getElementById('shareReddit')?.addEventListener('click', () => {
        const url = window.location.href;
        const title = currentPost ? currentPost.headline : 'Anthem Arena Blog Post';
        window.open(`https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, '_blank');
    });
    
    document.getElementById('shareCopy')?.addEventListener('click', async () => {
        const btn = document.getElementById('shareCopy');
        try {
            await navigator.clipboard.writeText(window.location.href);
            btn.textContent = '✓ Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy Link
                `;
                btn.classList.remove('copied');
            }, 2000);
        } catch (error) {
            alert('Failed to copy link');
        }
    });
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function getSlugFromURL() {
    const pathParts = window.location.pathname.split('/');
    return pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
}

function getPostThumbnail(post) {
    if (post.matchData?.song1?.videoId) {
        return `https://img.youtube.com/vi/${post.matchData.song1.videoId}/maxresdefault.jpg`;
    }
    if (post.winningSongVideoId) {
        return `https://img.youtube.com/vi/${post.winningSongVideoId}/maxresdefault.jpg`;
    }
    return 'https://via.placeholder.com/1200x600/1a1a2e/0ea5e9?text=Anthem+Arena';
}

function formatCategory(type) {
    const categories = {
        'match-recap': '📊 Match Recap',
        'round-recap': '🏆 Round Recap',
        'upset-alert': '🚨 Upset Alert',
        'preview': '🔮 Preview',
        'analysis': '📈 Analysis'
    };
    return categories[type] || '📰 News';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
    });
}

function showError(message) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    console.error('❌', message);
}