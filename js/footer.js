document.addEventListener('DOMContentLoaded', function() {
    const footerHTML = `
<!-- ========================================
     SHARE CTA BANNER (Global - All Pages)
     ======================================== -->
<section class="footer-cta-banner">
    <div class="container">
        <div class="cta-content">
            <span class="cta-icon">🎤</span>
            <div class="cta-text">
                <h3>Think your friends will agree with your picks?</h3>
                <p>Share your favorite matches and see if they vote the same way!</p>
            </div>
            <div class="cta-actions">
                <button class="btn-primary share-twitter" id="shareTwitterBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
                    </svg>
                    Share on X
                </button>
                <button class="btn-secondary share-reddit" id="shareRedditBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                    </svg>
                    Share on Reddit
                </button>
                <button class="btn-secondary share-discord" id="shareDiscordBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                    Share on Discord
                </button>
                <button class="btn-secondary copy-link" id="copyLinkBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    Copy Link
                </button>
            </div>
            
            <!-- ✅ NEW: Support Section -->
            <div class="cta-divider" style="margin: 1.5rem 0; border-top: 1px solid rgba(255, 255, 255, 0.1);"></div>
            
            <div class="cta-support">
                <span class="support-icon">☕</span>
                <div class="support-text">
                    <h4>Enjoying the tournament?</h4>
                    <p>Help keep Anthem Arena running!</p>
                </div>
                <a href="https://buymeacoffee.com/anthemarena" 
                   target="_blank" 
                   rel="noopener noreferrer" 
                   class="btn-support">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 01-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 01-4.743.295 37.059 37.059 0 01-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0011.343.376.483.483 0 01.535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 01.39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 01-.169.364zm-6.159 3.9c-.862.37-1.84.788-3.109.788a5.884 5.884 0 01-1.569-.217l.877 9.004c.065.78.717 1.38 1.5 1.38 0 0 1.243.065 1.658.065.447 0 1.786-.065 1.786-.065.783 0 1.434-.6 1.499-1.38l.94-9.95a3.996 3.996 0 00-1.322-.238c-.826 0-1.491.284-2.26.613z"/>
                    </svg>
                    Buy Me a Coffee
                </a>
            </div>
        </div>
    </div>
</section>

<footer class="main-footer">
    <div class="footer-container">
        <div class="footer-grid">
            <!-- About Column with Logo -->
            <div class="footer-column">
                <a href="/" class="footer-logo-link">
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
                    <li><a href="/">Home</a></li>
                    <li><a href="/brackets">Brackets</a></li>
                    <li><a href="/music-gallery">Music Gallery</a></li>
                    <li><a href="/matches">Matches</a></li>
                    <li><a href="/stats">Stats</a></li>
                    <li><a href="/about">About</a></li>
                    <li><a href="https://amzn.to/4ozvEDP" target="_blank" rel="noopener noreferrer nofollow">Ambessa: Chosen of the Wolf</a></li>
                </ul>
            </div>
            
            <!-- Current Tournament Column -->
            <div class="footer-column">
                <h4 class="footer-heading">Anthems Arena Championship</h4>
                <ul class="footer-links">
                    <li><a href="/matches?status=completed">View Results</a></li>
                    <li><a href="/brackets">Full Bracket</a></li>
                    <li><a href="/matches?tournament=worlds-anthems-2025">Cast Your Votes</a></li>
                    <li><a href="/stats">Tournament Statistics</a></li>
                </ul>
            </div>
            
            <!-- Connect Column -->
            <div class="footer-column">
                <h4 class="footer-heading">Community</h4>
                <p class="footer-text footer-small">
                    Join fellow League fans in celebrating the most memorable music videos. Follow us for tournament updates and share your favorite anthems.
                </p>

</div>

                <div class="footer-contact">
                    <a href="mailto:anthemarena@outlook.com" class="footer-email-link">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                        <span>anthemarena@outlook.com</span>
                    </a>
                </div>

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
                    
                    <a href="https://www.instagram.com/anthemarena/" class="social-link" aria-label="Instagram" target="_blank" rel="noopener noreferrer">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                    </a>
                    
                    <a href="https://www.facebook.com/anthemarena/" class="social-link" aria-label="Facebook" target="_blank" rel="noopener noreferrer">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
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
                    © 2025 Anthems Arena. All rights reserved.
            </p>
            <div class="footer-legal-links">
                <a href="/about">About</a>
                <span class="separator">•</span>
                <a href="/legal/privacy">Privacy</a>
                <span class="separator">•</span>
                <a href="/legal/terms">Terms</a>
                <span class="separator">•</span>
                <a href="/legal/disclosure">Affiliate Disclosure</a>
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

<!-- Global Notification Bulletin (Toast-Style) -->
<div id="global-bulletin" class="global-bulletin" style="display: none;">
    <div class="bulletin-content">
        <div class="bulletin-icon"></div>
        <div class="bulletin-text">
            <div class="bulletin-title"></div>
            <div class="bulletin-message"></div>
        </div>
        <div class="bulletin-actions">
            <button class="bulletin-dismiss">Dismiss</button>
            <button class="bulletin-cta"></button>
        </div>
    </div>
</div>

    `;
    
    // Insert footer into the page
    document.getElementById('footer-placeholder').innerHTML = footerHTML;
    
    // ========================================
    // ATTACH EVENT LISTENERS (After HTML is inserted)
    // ========================================
    
    // Share to Twitter
    document.getElementById('shareTwitterBtn')?.addEventListener('click', function() {
        const tweetText = `🎵 Just voted in the League Music Tournament!

Which anthem reigns supreme? Cast your vote:

anthemarena.com

#LeagueOfLegends #Worlds`;
        
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
        window.open(twitterUrl, '_blank', 'width=550,height=420');
        
        console.log('🐦 Twitter share opened');
    });
    
    // Share to Reddit
    document.getElementById('shareRedditBtn')?.addEventListener('click', function() {
        const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent('https://anthemarena.com')}&title=${encodeURIComponent('🎵 League Music Tournament - Vote for the Ultimate Anthem!')}`;
        window.open(redditUrl, '_blank', 'width=800,height=600');
        
        console.log('🔴 Reddit share opened');
    });
    
    // Share to Discord
    document.getElementById('shareDiscordBtn')?.addEventListener('click', function() {
        const discordMessage = `🎵 **League Music Tournament**

Vote for the most iconic League anthem!
🎮 GODS vs RISE - Who wins?

Cast your vote: https://anthemarena.com`;
        
        navigator.clipboard.writeText(discordMessage).then(() => {
            showCopySuccessToast('Discord message copied! Paste it in your server 💬');
            console.log('💬 Discord message copied');
        }).catch(err => {
            alert(`Copy this message:\n\n${discordMessage}`);
        });
    });
    
    // Copy Link
    document.getElementById('copyLinkBtn')?.addEventListener('click', function() {
        const shareUrl = 'https://anthemarena.com';
        
        navigator.clipboard.writeText(shareUrl).then(() => {
            showCopySuccessToast('✅ Link copied to clipboard!');
            console.log('📋 Link copied');
        }).catch(err => {
            alert(`Copy this link: ${shareUrl}`);
        });
    });
    
    console.log('✅ Footer loaded and event listeners attached');
});

// ========================================
// SHOW COPY SUCCESS TOAST
// ========================================

function showCopySuccessToast(message) {
    const toast = document.createElement('div');
    toast.className = 'copy-success-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}