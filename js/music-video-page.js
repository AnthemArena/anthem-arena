// ========================================
// MUSIC VIDEO PAGE FUNCTIONALITY
// ========================================

// Page data (would come from a database in production)
const pageData = {
    title: "Warriors",
    artist: "Imagine Dragons",
    videoId: "fmI_Ndrxy14",
    url: window.location.href
};

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    console.log('Music video page loaded:', pageData.title);
    
    // Initialize share functionality
    setupShareButtons();
    
    // Track page view (for analytics)
    trackPageView();
});

// ========================================
// SHARE FUNCTIONS
// ========================================

function shareVideo() {
    if (navigator.share) {
        // Use native share API if available (mobile)
        navigator.share({
            title: `${pageData.title} - ${pageData.artist}`,
            text: `Check out ${pageData.title} by ${pageData.artist} on League Music Tournament!`,
            url: pageData.url
        }).then(() => {
            showNotification('Shared successfully!', 'success');
        }).catch((error) => {
            console.log('Share cancelled or failed:', error);
        });
    } else {
        // Fallback to copy link
        copyLink();
    }
}

function shareOnTwitter() {
    const text = `🎵 ${pageData.title} by ${pageData.artist} - One of the greatest League of Legends music videos! Check it out:`;
    const url = pageData.url;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    
    window.open(twitterUrl, '_blank', 'width=600,height=400');
    showNotification('Opening Twitter...', 'info');
}

function shareOnReddit() {
    const title = `${pageData.title} by ${pageData.artist} - League Music Tournament`;
    const url = pageData.url;
    const redditUrl = `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
    
    window.open(redditUrl, '_blank', 'width=800,height=600');
    showNotification('Opening Reddit...', 'info');
}

function copyLink() {
    const url = pageData.url;
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showNotification('Link copied to clipboard!', 'success');
        }).catch(() => {
            fallbackCopyLink(url);
        });
    } else {
        fallbackCopyLink(url);
    }
}

// Fallback copy method for older browsers
function fallbackCopyLink(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
        document.execCommand('copy');
        showNotification('Link copied to clipboard!', 'success');
    } catch (err) {
        showNotification('Failed to copy link', 'error');
    }
    
    document.body.removeChild(textArea);
}

// Setup share button listeners
function setupShareButtons() {
    // Share buttons are handled by onclick attributes in HTML
    console.log('Share functionality initialized');
}

// ========================================
// NOTIFICATION HELPER
// ========================================

function showNotification(message, type = 'success') {
    // Remove any existing notifications
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const bgColor = {
        'success': 'linear-gradient(135deg, rgba(0, 200, 150, 0.95), rgba(0, 180, 130, 0.95))',
        'error': 'linear-gradient(135deg, rgba(220, 50, 50, 0.95), rgba(200, 30, 30, 0.95))',
        'info': 'linear-gradient(135deg, rgba(20, 120, 200, 0.95), rgba(10, 100, 180, 0.95))'
    }[type];
    
    notification.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: ${bgColor};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-family: 'Inter', sans-serif;
        font-size: 0.95rem;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ========================================
// ANALYTICS (Optional)
// ========================================

function trackPageView() {
    // In production, send to Google Analytics or similar
    console.log('Page view tracked:', {
        page: pageData.title,
        url: pageData.url,
        videoId: pageData.videoId
    });
    
    // Example Google Analytics tracking:
    /*
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
            page_title: pageData.title,
            page_location: pageData.url,
            page_path: window.location.pathname
        });
    }
    */
}

// Export functions for HTML onclick handlers
window.shareVideo = shareVideo;
window.shareOnTwitter = shareOnTwitter;
window.shareOnReddit = shareOnReddit;
window.copyLink = copyLink;

console.log('Music video page script initialized');