document.addEventListener('DOMContentLoaded', function() {
    const navHTML = `
    <nav class="main-nav">
        <div class="nav-container">
            <a href="/index.html" class="logo-link">
                <img src="/images/logo-header.png" alt="Anthem Arena" class="site-logo">
            </a>
       <ul class="nav-links">
    <li><a href="/">Home</a></li>
    <li><a href="/my-votes">My Votes</a></li>
    <li><a href="/brackets">Brackets</a></li>
    <li><a href="/music-gallery">Music Gallery</a></li>
    <li><a href="/matches">Matches</a></li>
    <li><a href="/stats">Stats</a></li>
    <li><a href="/about">About</a></li>
</ul>
            <button class="mobile-menu-toggle" aria-label="Toggle menu">
                <span class="hamburger"></span>
            </button>
        </div>
    </nav>
    `;
    
    document.getElementById('nav-placeholder').innerHTML = navHTML;
    
   // Auto-highlight current page
const currentPath = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
document.querySelectorAll('.nav-links a').forEach(link => {
    const linkPath = link.getAttribute('href').replace(/\/$/, '') || '/';
    
    // Normalize paths for comparison
    const normalizedCurrent = currentPath === '' ? '/' : currentPath;
    const normalizedLink = linkPath === '' ? '/' : linkPath;
    
    // Check if current page matches link
    if (normalizedCurrent === normalizedLink || 
        normalizedCurrent.startsWith(normalizedLink + '/') ||
        (normalizedLink === '/' && (normalizedCurrent === '/' || normalizedCurrent === '/index'))) {
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