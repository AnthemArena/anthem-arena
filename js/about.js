// ========================================
// ABOUT PAGE FUNCTIONALITY
// ========================================

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    console.log('About page loaded successfully');
    
    // Setup smooth scrolling for anchor links
    setupSmoothScrolling();
    
    // Track page view
    trackPageView();
});

// ========================================
// NEWSLETTER SUBSCRIPTION
// ========================================

function subscribeNewsletter(event) {
    event.preventDefault();
    
    const form = event.target;
    const input = form.querySelector('.newsletter-input');
    const button = form.querySelector('.newsletter-btn');
    const email = input.value;
    
    // Validate email
    if (!email || !email.includes('@')) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }
    
    // Disable form
    button.disabled = true;
    button.textContent = 'Subscribing...';
    
    // Simulate API call (replace with actual subscription logic)
    setTimeout(() => {
        // Success
        showNotification('Successfully subscribed! Check your email for confirmation.', 'success');
        input.value = '';
        button.disabled = false;
        button.textContent = 'Subscribe';
        
        // Store email in localStorage (or send to backend)
        const subscribers = JSON.parse(localStorage.getItem('subscribers') || '[]');
        subscribers.push({ 
            email, 
            date: new Date().toISOString(),
            source: 'about_page'
        });
        localStorage.setItem('subscribers', JSON.stringify(subscribers));
        
        // Track subscription event
        trackEvent('newsletter_subscribe', { source: 'about_page' });
        
    }, 1000);
}

// ========================================
// SMOOTH SCROLLING
// ========================================

function setupSmoothScrolling() {
    // Handle anchor links with smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            
            // Skip if it's just "#" (no target)
            if (href === '#') {
                e.preventDefault();
                return;
            }
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                
                // Update URL without jumping
                history.pushState(null, null, href);
            }
        });
    });
    
    // Handle initial hash on page load
    if (window.location.hash) {
        setTimeout(() => {
            const target = document.querySelector(window.location.hash);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }, 100);
    }
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
    console.log('About page view tracked');
    
    // Example Google Analytics tracking:
    /*
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
            page_title: 'About',
            page_location: window.location.href,
            page_path: '/about.html'
        });
    }
    */
}

function trackEvent(eventName, params = {}) {
    console.log('Event tracked:', eventName, params);
    
    // Example Google Analytics event tracking:
    /*
    if (typeof gtag !== 'undefined') {
        gtag('event', eventName, params);
    }
    */
}

// Export functions for HTML onclick handlers
window.subscribeNewsletter = subscribeNewsletter;

console.log('About page script initialized');