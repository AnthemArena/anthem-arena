// ========================================
// BLOG POST PAGE - JavaScript
// ========================================

import { db } from './firebase-config.js';
import { collection, getDocs, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
    const pageTitle = `${post.headline} - Anthem Arena`;
    const description = post.excerpt || post.lede || post.headline;
    
    document.title = pageTitle;
    document.getElementById('pageTitle').textContent = pageTitle;
    document.getElementById('pageDescription').content = description;
    document.getElementById('ogTitle').content = post.headline;
    document.getElementById('ogDescription').content = description;
    
    // Hero image
    const thumbnailUrl = getPostThumbnail(post);
    document.getElementById('postHeroImage').innerHTML = `
        <img src="${thumbnailUrl}" 
             alt="${post.headline}"
             onerror="this.src='https://via.placeholder.com/1200x600/0a0a0a/C8AA6E?text=Anthem+Arena'">
    `;
    document.getElementById('ogImage').content = thumbnailUrl;
    
    // Category
document.getElementById('postCategory').innerHTML = formatCategory(post.type);
    
    // Headline
    document.getElementById('postHeadline').textContent = post.headline;
    
    // Meta
    document.getElementById('postDate').textContent = formatDate(post.publishedDate);
    document.getElementById('postReadTime').textContent = post.readTime || '3 min read';
    
    // Lede/Excerpt
    const ledeText = post.excerpt || post.lede || '';
    document.getElementById('postLede').textContent = ledeText;
    
    // Match stats widget (if match recap)
    if (post.type === 'match-recap' && post.metadata) {
        displayMatchStats(post.metadata);
    }
    
    // Post content
    displayContent(post.content || '');
    
    // Tags
    displayTags(post.tags || []);
}

// ========================================
// DISPLAY MATCH STATS
// ========================================

function displayMatchStats(metadata) {
    const widget = document.getElementById('matchStatsWidget');
    if (!widget || !metadata.winnerSeed || !metadata.loserSeed) return;
    
    const [winnerPct, loserPct] = metadata.finalScore.split('-');
    
    widget.innerHTML = `
        <h3>⚔️ Match Result</h3>
        <div class="match-stats-grid">
            <div class="match-stats-song winner">
                <div class="match-stats-song-title">Winner</div>
                <div class="match-stats-song-artist">Seed #${metadata.winnerSeed}</div>
                <div class="match-stats-votes">${winnerPct}%</div>
                <div class="match-stats-winner">🏆 Winner</div>
            </div>
            
            <div class="match-stats-vs">VS</div>
            
            <div class="match-stats-song">
                <div class="match-stats-song-title">Runner-Up</div>
                <div class="match-stats-song-artist">Seed #${metadata.loserSeed}</div>
                <div class="match-stats-votes">${loserPct}%</div>
            </div>
        </div>
        <div style="text-align: center; margin-top: 1rem; color: rgba(255,255,255,0.6); font-size: 0.9rem;">
            ${metadata.totalVotes?.toLocaleString() || 0} total votes • ${metadata.margin || 0} vote margin
        </div>
    `;
    
    widget.style.display = 'block';
}

// ========================================
// DISPLAY CONTENT
// ========================================

function displayContent(content) {
    const container = document.getElementById('postSections');
    if (!container) return;
    
    if (!content || content.trim() === '') {
        container.innerHTML = '<div class="post-section"><p>Content coming soon...</p></div>';
        return;
    }
    
    // Convert markdown-style headings and paragraphs to HTML
    const lines = content.split('\n');
    let html = '';
    let inSection = false;
    
    for (let line of lines) {
        line = line.trim();
        
        if (line.startsWith('## ')) {
            if (inSection) html += '</div>';
            html += `<div class="post-section"><h2>${line.substring(3)}</h2>`;
            inSection = true;
        } else if (line.startsWith('### ')) {
            html += `<h3>${line.substring(4)}</h3>`;
        } else if (line.startsWith('- ')) {
            html += `<p>${line.substring(2)}</p>`;
        } else if (line.startsWith('**') && line.endsWith('**')) {
            html += `<p><strong>${line.substring(2, line.length - 2)}</strong></p>`;
        } else if (line.length > 0 && line !== '---') {
            html += `<p>${line}</p>`;
        }
    }
    
    if (inSection) html += '</div>';
    
    // If no content was generated, add wrapper
    if (!html) {
        html = '<div class="post-section"><p>Content coming soon...</p></div>';
    }
    
    container.innerHTML = html;
}

// ========================================
// DISPLAY TAGS
// ========================================

function displayTags(tags) {
    const container = document.getElementById('postTags');
    if (!container) return;
    
    if (!tags || tags.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.innerHTML = tags.map(tag => 
        `<span class="tag">#${tag}</span>`
    ).join('');
    container.style.display = 'flex';
}

// ========================================
// LOAD RELATED POSTS
// ========================================

async function loadRelatedPosts(currentPost) {
    try {
        const blogRef = collection(db, 'blog');
        
        // Simple query without orderBy
        const q = query(
            blogRef,
            where('published', '==', true),
            where('type', '==', currentPost.type),
            limit(10)
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
                         onerror="this.src='https://via.placeholder.com/80x80/0a0a0a/C8AA6E?text=AA'">
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
    const pathParts = window.location.pathname.split('/').filter(p => p);
    return pathParts[pathParts.length - 1] || '';
}

function getPostThumbnail(post) {
    // Priority 1: Use images.hero if available
    if (post.images?.hero) {
        return post.images.hero;
    }
    
    // Priority 2: Use metadata video ID
    if (post.metadata?.winnerVideoId) {
        return `https://img.youtube.com/vi/${post.metadata.winnerVideoId}/maxresdefault.jpg`;
    }
    
    // Priority 3: Try matchData (from blog-generator)
    if (post.matchData?.song1?.videoId) {
        return `https://img.youtube.com/vi/${post.matchData.song1.videoId}/maxresdefault.jpg`;
    }
    
    // Fallback: Placeholder
    return 'https://via.placeholder.com/1200x600/0a0a0a/C8AA6E?text=Anthem+Arena';
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
    return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
    });
}

function showError(message) {
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    
    if (loadingState) loadingState.style.display = 'none';
    if (errorState) errorState.style.display = 'block';
    
    console.error('❌', message);
}