document.addEventListener('DOMContentLoaded', function() {
    const footerHTML = `
<footer class="main-footer">
    <div class="footer-container">
        <div class="footer-grid">
            <!-- About Column with Logo -->
        <div class="footer-column">
    <a href="/index.html" class="footer-logo-link">
        <img src="/images/logo-header.png" alt="Anthem Arena" class="footer-logo">
    </a>
    <p class="footer-text">
        Vote for the most iconic League of Legends music videos. From legendary Worlds anthems to virtual pop sensations, help crown the ultimate League music video in our community-driven tournament.
    </p>
</div>
            
            <!-- Quick Links Column -->
            <div class="footer-column">
                <h4 class="footer-heading">Navigate</h4>
                <ul class="footer-links">
                    <li><a href="/index.html">Home</a></li>
                    <li><a href="/brackets.html">Brackets</a></li>
                    <li><a href="/music-gallery.html">Music Gallery</a></li>
                    <li><a href="/matches.html">Matches</a></li>
                    <li><a href="/about.html">About</a></li>
                    <li><a href="https://amzn.to/4ozvEDP" target="_blank" rel="noopener noreferrer nofollow">Ambessa: Chosen of the Wolf</a></li>
                </ul>
            </div>
            
            <!-- Current Tournament Column -->
            <div class="footer-column">
                <h4 class="footer-heading">Worlds Anthems 2025</h4>
                <ul class="footer-links">
                    <li><a href="/matches.html?status=completed">View Results</a></li>
                    <li><a href="/brackets.html">Full Bracket</a></li>
                    <li><a href="/matches.html?tournament=worlds-anthems-2025">Cast Your Votes</a></li>
                </ul>
            </div>
            
<!-- Connect Column -->
<div class="footer-column">
    <h4 class="footer-heading">Community</h4>
    <p class="footer-text footer-small">
        Join fellow League fans in celebrating the most memorable music videos. Follow us for tournament updates and share your favorite anthems.
    </p>
    <div class="footer-social">
        <a href="https://x.com/AnthemArena" class="social-link" aria-label="X" target="_blank" rel="noopener noreferrer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
            </svg>
        </a>
        
        <a href="https://youtube.com/@anthemarena" class="social-link" aria-label="YouTube" target="_blank" rel="noopener noreferrer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
        </a>
        
        <a href="https://www.tiktok.com/@anthemarena" class="social-link" aria-label="TikTok" target="_blank" rel="noopener noreferrer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
        </a>
        
        <a href="https://anthemarena.tumblr.com" class="social-link" aria-label="Tumblr" target="_blank" rel="noopener noreferrer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.563 24c-5.093 0-7.031-3.756-7.031-6.411V9.747H5.116V6.648c3.63-1.313 4.512-4.596 4.71-6.469C9.84.051 9.941 0 9.999 0h3.517v6.114h4.801v3.633h-4.82v7.47c.016 1.001.375 2.371 2.207 2.371h.09c.631-.02 1.486-.205 1.936-.419l1.156 3.425c-.436.636-2.4 1.374-4.156 1.404h-.178l.011.002z"/>
            </svg>
        </a>
    </div>
</div>
        </div>
        
        <div class="footer-bottom">
            <p class="footer-copyright">
                © 2025 Anthem Arena. A fan-made community project.
            </p>
            <div class="footer-legal-links">
                <a href="/about.html">About</a>
                <span class="separator">•</span>
                <a href="/legal/privacy.html">Privacy</a>
                <span class="separator">•</span>
                <a href="/legal/terms.html">Terms</a>
                <span class="separator">•</span>
                <a href="/legal/disclosure.html">Affiliate Disclosure</a>
            </div>
            
            <!-- Riot Games Disclaimer -->
            <p class="footer-disclaimer">
                Anthem Arena was created under Riot Games' "Legal Jibber Jabber" 
                policy using assets owned by Riot Games. Riot Games does not endorse or 
                sponsor this project.
            </p>
            <p class="footer-disclaimer">
                League of Legends® and all related logos, characters, music, and content 
                are trademarks and copyrights of Riot Games, Inc.
            </p>
            
            <!-- Amazon Affiliate Disclosure -->
            <p class="footer-disclaimer footer-affiliate">
                As an Amazon Associate, we earn from qualifying purchases made through 
                book recommendation links on this site. This helps support the tournament 
                at no extra cost to you.
            </p>
        </div>
    </div>
</footer>
    `;
    
    // Insert footer into the page
    document.getElementById('footer-placeholder').innerHTML = footerHTML;
});