// ========================================
// STATS IMAGE GENERATOR
// Client-side canvas-based image generation
// Zero Firebase reads, Zero cost
// ========================================

console.log('🎨 Stats Image Generator loaded');

// ========================================
// GENERATE STATS IMAGE
// ========================================

async function generateStatsImage(statsData) {
    console.log('🎨 Generating stats image...', statsData);
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    
    // ========================================
    // BACKGROUND
    // ========================================
    
    // Gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, 630);
    bgGradient.addColorStop(0, '#1a1a2e');
    bgGradient.addColorStop(1, '#16213e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1200, 630);
    
    // Decorative corner accents
    ctx.fillStyle = 'rgba(200, 170, 110, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(150, 0);
    ctx.lineTo(0, 150);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(1200, 630);
    ctx.lineTo(1050, 630);
    ctx.lineTo(1200, 480);
    ctx.closePath();
    ctx.fill();
    
    // Gold border
    ctx.strokeStyle = '#C8AA6E';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, 1160, 590);
    
    // Inner shadow effect
    ctx.strokeStyle = 'rgba(200, 170, 110, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 1140, 570);
    
    // ========================================
    // HEADER
    // ========================================
    
    // Title
    ctx.fillStyle = '#C8AA6E';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MY ANTHEM ARENA PROFILE', 600, 85);
    
    // Subtitle line
    ctx.strokeStyle = '#C8AA6E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(350, 100);
    ctx.lineTo(850, 100);
    ctx.stroke();
    
    // ========================================
    // TASTE PROFILE BADGE
    // ========================================
    
    // Badge background
    const badgeGradient = ctx.createLinearGradient(250, 120, 950, 220);
    badgeGradient.addColorStop(0, 'rgba(200, 170, 110, 0.2)');
    badgeGradient.addColorStop(0.5, 'rgba(200, 170, 110, 0.3)');
    badgeGradient.addColorStop(1, 'rgba(200, 170, 110, 0.2)');
    ctx.fillStyle = badgeGradient;
    
    // Rounded rectangle for badge
    roundRect(ctx, 250, 120, 700, 100, 15);
    ctx.fill();
    
    // Badge border
    ctx.strokeStyle = 'rgba(200, 170, 110, 0.6)';
    ctx.lineWidth = 3;
    roundRect(ctx, 250, 120, 700, 100, 15);
    ctx.stroke();
    
    // Taste profile icon and title
    ctx.fillStyle = '#C8AA6E';
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.textAlign = 'center';
    const profileText = `${statsData.tasteProfile.icon} ${statsData.tasteProfile.title}`;
    ctx.fillText(profileText, 600, 180);
    
    // Taste profile description
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '22px Arial, sans-serif';
    ctx.fillText(statsData.tasteProfile.description, 600, 205);
    
    // ========================================
    // STATS GRID
    // ========================================
    
    const statsY = 280;
    const leftCol = 120;
    const rightCol = 620;
    
    ctx.textAlign = 'left';
    ctx.font = '32px Arial, sans-serif';
    
    // Left column stats
    const leftStats = [
        { emoji: '🗳️', label: `${statsData.totalVotes} Votes Cast`, color: '#ffffff' },
        { emoji: '🎭', label: `${statsData.underdogPicks} Underdog Picks`, color: '#ff6b9d' },
        { emoji: '✓', label: `${statsData.songsStillAlive} Songs Still Competing`, color: '#4ade80' }
    ];
    
    leftStats.forEach((stat, index) => {
        const y = statsY + (index * 60);
        
        // Stat background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        roundRect(ctx, leftCol - 10, y - 35, 450, 50, 8);
        ctx.fill();
        
        // Emoji
        ctx.font = '32px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(stat.emoji, leftCol, y);
        
        // Text
        ctx.fillStyle = stat.color;
        ctx.font = '28px Arial, sans-serif';
        ctx.fillText(stat.label, leftCol + 50, y);
    });
    
    // Right column stats
    const rightStats = [
        { emoji: '🎯', label: `${statsData.mainstreamPicks} Mainstream Picks`, color: '#60a5fa' },
        { emoji: '🔥', label: `${statsData.votingStreak} Day Streak`, color: '#fb923c' },
        { emoji: '📊', label: `${statsData.roundsParticipated} Rounds Participated`, color: '#a78bfa' }
    ];
    
    rightStats.forEach((stat, index) => {
        const y = statsY + (index * 60);
        
        // Stat background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        roundRect(ctx, rightCol - 10, y - 35, 450, 50, 8);
        ctx.fill();
        
        // Emoji
        ctx.font = '32px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(stat.emoji, rightCol, y);
        
        // Text
        ctx.fillStyle = stat.color;
        ctx.font = '28px Arial, sans-serif';
        ctx.fillText(stat.label, rightCol + 50, y);
    });
    
    // ========================================
    // FAVORITE SONG SECTION
    // ========================================
    
    if (statsData.favoriteSong) {
        const songY = 470;
        
        // Section title
        ctx.fillStyle = '#C8AA6E';
        ctx.font = 'bold 28px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎵 MOST SUPPORTED SONG', 600, songY);
        
        // Load and draw thumbnail
        try {
            const thumbnail = await loadImage(statsData.favoriteSong.thumbnailUrl);
            
            // Thumbnail background/border
            ctx.fillStyle = 'rgba(200, 170, 110, 0.2)';
            roundRect(ctx, 435, songY + 15, 330, 90, 12);
            ctx.fill();
            
            ctx.strokeStyle = '#C8AA6E';
            ctx.lineWidth = 3;
            roundRect(ctx, 435, songY + 15, 330, 90, 12);
            ctx.stroke();
            
            // Draw thumbnail (clipped to rounded rect)
            ctx.save();
            roundRect(ctx, 440, songY + 20, 160, 80, 8);
            ctx.clip();
            ctx.drawImage(thumbnail, 440, songY + 20, 160, 80);
            ctx.restore();
            
            // Song name
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial, sans-serif';
            ctx.textAlign = 'left';
            
            // Truncate if too long
            let songName = statsData.favoriteSong.name;
            if (songName.length > 20) {
                songName = songName.substring(0, 18) + '...';
            }
            ctx.fillText(songName, 615, songY + 55);
            
            // Vote count
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '18px Arial, sans-serif';
            ctx.fillText(`${statsData.favoriteSong.voteCount} ${statsData.favoriteSong.voteCount === 1 ? 'vote' : 'votes'}`, 615, songY + 80);
            
        } catch (error) {
            console.warn('⚠️ Could not load thumbnail:', error);
            
            // Fallback: Just show song name without thumbnail
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(statsData.favoriteSong.name, 600, songY + 50);
        }
    }
    
    // ========================================
    // FOOTER
    // ========================================
    
    // Footer line
    ctx.strokeStyle = 'rgba(200, 170, 110, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(100, 590);
    ctx.lineTo(1100, 590);
    ctx.stroke();
    
    // Footer text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Vote for your favorite League anthems at anthemarena.com', 600, 615);
    
    console.log('✅ Stats image generated');
    
    return canvas;
}

// ========================================
// HELPER: ROUNDED RECTANGLE
// ========================================

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// ========================================
// HELPER: LOAD IMAGE
// ========================================

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// ========================================
// DOWNLOAD IMAGE
// ========================================

function downloadCanvas(canvas, filename = 'anthem-arena-stats.png') {
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        console.log('📥 Image downloaded:', filename);
    }, 'image/png');
}

// ========================================
// SHARE TO SOCIAL MEDIA
// ========================================

async function shareStatsImage(canvas, statsData) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(async blob => {
            const file = new File([blob], 'anthem-arena-stats.png', { type: 'image/png' });
            
            // Check if Web Share API is available (mobile)
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: 'My Anthem Arena Profile',
                        text: `🎵 My League Music Voting Stats!\n\n🗳️ ${statsData.totalVotes} votes cast\n${statsData.tasteProfile.icon} ${statsData.tasteProfile.title}\n\nVote at anthemarena.com`,
                        files: [file]
                    });
                    console.log('✅ Shared via Web Share API');
                    resolve();
                } catch (error) {
                    console.log('❌ Web Share cancelled or failed');
                    reject(error);
                }
            } else {
                // Desktop: Download image and open Twitter
                downloadCanvas(canvas);
                
                // Open Twitter with pre-filled text
                const tweetText = `🎵 My Anthem Arena Profile!\n\n🗳️ ${statsData.totalVotes} votes cast\n${statsData.tasteProfile.icon} ${statsData.tasteProfile.title}\n✓ ${statsData.songsStillAlive} songs still competing\n\nVote for your favorite League anthems: anthemarena.com\n\n#LeagueOfLegends #AnthemArena`;
                
                setTimeout(() => {
                    window.open(
                        `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`,
                        '_blank',
                        'width=550,height=420'
                    );
                }, 500);
                
                console.log('✅ Image downloaded, Twitter opened');
                resolve();
            }
        }, 'image/png');
    });
}

// ========================================
// MAIN EXPORT FUNCTION
// ========================================

window.generateAndShareStats = async function(statsData) {
    try {
        console.log('🚀 Starting stats image generation...');
        
        // Show loading state
        const loadingToast = showLoadingToast('Generating your stats image...');
        
        // Generate canvas
        const canvas = await generateStatsImage(statsData);
        
        // Hide loading
        loadingToast.remove();
        
        // Share or download
        await shareStatsImage(canvas, statsData);
        
        console.log('🎉 Stats image shared successfully!');
        
    } catch (error) {
        console.error('❌ Error generating stats image:', error);
        alert('Failed to generate stats image. Please try again.');
    }
};

// ========================================
// LOADING TOAST
// ========================================

function showLoadingToast(message) {
    const toast = document.createElement('div');
    toast.className = 'loading-toast';
    toast.innerHTML = `
        <div class="loading-spinner"></div>
        <span>${message}</span>
    `;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(20, 20, 35, 0.95));
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        border: 2px solid rgba(200, 170, 110, 0.3);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 1rem;
        font-family: 'Lora', serif;
        font-weight: 600;
        animation: slideInRight 0.3s ease;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        .loading-spinner {
            width: 20px;
            height: 20px;
            border: 3px solid rgba(200, 170, 110, 0.3);
            border-top-color: #C8AA6E;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        @keyframes slideInRight {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(toast);
    return toast;
}

console.log('✅ Stats Image Generator ready');