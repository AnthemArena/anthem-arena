document.addEventListener('DOMContentLoaded', function() {
    const navHTML = `
    <nav class="main-nav">
        <div class="nav-container">
            <a href="/index.html" class="logo-link">
                <img src="/images/logo-header.png" alt="Anthem Arena" class="site-logo">
            </a>
            <ul class="nav-links">
                <li><a href="/index.html">Home</a></li>
                <li><a href="/my-votes.html">My Votes</a></li>
                <li><a href="/brackets.html">Brackets</a></li>
                <li><a href="/music-gallery.html">Music Gallery</a></li>
                <li><a href="/matches.html">Matches</a></li>
                <li><a href="/stats.html">Stats</a></li>
                <li><a href="/about.html">About</a></li>
            </ul>
            <button class="mobile-menu-toggle" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
        </div>
    </nav>
    `;
    
    document.getElementById('nav-placeholder').innerHTML = navHTML;
    
    // Auto-highlight current page
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-links a').forEach(link => {
        const linkPath = link.getAttribute('href');
        
        // Check if current page matches link
        if (currentPath === linkPath || 
            currentPath.endsWith(linkPath) ||
            (linkPath === '/brackets.html' && currentPath.includes('/brackets')) ||
            (linkPath === '/matches.html' && currentPath.includes('/matches')) ||
            (linkPath === '/music-gallery.html' && currentPath.includes('/music-gallery')) ||
            (linkPath === '/stats.html' && currentPath.includes('/stats')) ||
            (linkPath === '/index.html' && (currentPath === '/' || currentPath === '/index.html'))) {
            link.classList.add('active');
        }
    });
    
    // Mobile menu toggle
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileToggle) {
        mobileToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            mobileToggle.classList.toggle('active');
            document.body.classList.toggle('menu-open');
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.main-nav')) {
                navLinks.classList.remove('active');
                mobileToggle.classList.remove('active');
                document.body.classList.remove('menu-open');
            }
        });
        
        // Close menu when clicking a link
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', function() {
                navLinks.classList.remove('active');
                mobileToggle.classList.remove('active');
                document.body.classList.remove('menu-open');
            });
        });
    }
});