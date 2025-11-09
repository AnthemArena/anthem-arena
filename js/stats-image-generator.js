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
    // STATS GRID (3 COLUMNS)
    // ========================================
    
    const statsY = 280;
    const leftCol = 80;
    const centerCol = 420;
    const rightCol = 760;
    
    ctx.textAlign = 'left';
    
    // Left column stats
    const leftStats = [
        { emoji: '🗳️', label: `${statsData.totalVotes} Votes Cast`, color: '#ffffff' },
        { emoji: '🎭', label: `${statsData.underdogPicks} Underdog Picks`, color: '#ff6b9d' },
        { emoji: '✓', label: `${statsData.songsStillAlive} Songs Still Alive`, color: '#4ade80' }
    ];
    
    leftStats.forEach((stat, index) => {
        const y = statsY + (index * 65);
        
        // Stat background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        roundRect(ctx, leftCol - 10, y - 35, 310, 50, 8);
        ctx.fill();
        
        // Emoji
        ctx.font = '32px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(stat.emoji, leftCol, y);
        
        // Text
        ctx.fillStyle = stat.color;
        ctx.font = 'bold 24px Arial, sans-serif';
        ctx.fillText(stat.label, leftCol + 50, y);
    });
    
    // Center column stats
    const centerStats = [
        { emoji: '🎯', label: `${statsData.mainstreamPicks} Mainstream`, color: '#60a5fa' },
        { emoji: '🔥', label: `${statsData.votingStreak} Day Streak`, color: '#fb923c' },
        { emoji: '📊', label: `${statsData.roundsParticipated} Rounds`, color: '#a78bfa' }
    ];
    
    centerStats.forEach((stat, index) => {
        const y = statsY + (index * 65);
        
        // Stat background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        roundRect(ctx, centerCol - 10, y - 35, 310, 50, 8);
        ctx.fill();
        
        // Emoji
        ctx.font = '32px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(stat.emoji, centerCol, y);
        
        // Text
        ctx.fillStyle = stat.color;
        ctx.font = 'bold 24px Arial, sans-serif';
        ctx.fillText(stat.label, centerCol + 50, y);
    });
    
    // Right column - FAVORITE SONG (larger card)
    if (statsData.favoriteSong) {
        const songCardY = statsY - 35;
        
        // Song card background
        const songGradient = ctx.createLinearGradient(rightCol - 10, songCardY, rightCol + 400, songCardY + 240);
        songGradient.addColorStop(0, 'rgba(200, 170, 110, 0.15)');
        songGradient.addColorStop(1, 'rgba(200, 170, 110, 0.05)');
        ctx.fillStyle = songGradient;
        roundRect(ctx, rightCol - 10, songCardY, 380, 240, 12);
        ctx.fill();
        
        // Song card border
        ctx.strokeStyle = 'rgba(200, 170, 110, 0.5)';
        ctx.lineWidth = 3;
        roundRect(ctx, rightCol - 10, songCardY, 380, 240, 12);
        ctx.stroke();
        
        // Section title
        ctx.fillStyle = '#C8AA6E';
        ctx.font = 'bold 22px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎵 MOST SUPPORTED', rightCol + 180, songCardY + 35);
        
        // Load and draw thumbnail
        try {
            const thumbnail = await loadImage(statsData.favoriteSong.thumbnailUrl);
            
            // Draw thumbnail (clipped to rounded rect)
            const thumbX = rightCol + 90;
            const thumbY = songCardY + 55;
            const thumbWidth = 200;
            const thumbHeight = 100;
            
            ctx.save();
            roundRect(ctx, thumbX, thumbY, thumbWidth, thumbHeight, 8);
            ctx.clip();
            ctx.drawImage(thumbnail, thumbX, thumbY, thumbWidth, thumbHeight);
            ctx.restore();
            
            // Thumbnail border
            ctx.strokeStyle = 'rgba(200, 170, 110, 0.4)';
            ctx.lineWidth = 2;
            roundRect(ctx, thumbX, thumbY, thumbWidth, thumbHeight, 8);
            ctx.stroke();
            
            // Song name
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Arial, sans-serif';
            ctx.textAlign = 'center';
            
            // Truncate if too long
            let songName = statsData.favoriteSong.name;
            if (songName.length > 24) {
                songName = songName.substring(0, 22) + '...';
            }
            ctx.fillText(songName, rightCol + 180, songCardY + 180);
            
            // Vote count with icon
            ctx.fillStyle = '#C8AA6E';
            ctx.font = 'bold 18px Arial, sans-serif';
            const voteText = `${statsData.favoriteSong.voteCount} ${statsData.favoriteSong.voteCount === 1 ? 'vote' : 'votes'}`;
            ctx.fillText(`💗 ${voteText}`, rightCol + 180, songCardY + 210);
            
        } catch (error) {
            console.warn('⚠️ Could not load thumbnail:', error);
            
            // Fallback: Just show song name
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial, sans-serif';
            ctx.textAlign = 'center';
            
            let songName = statsData.favoriteSong.name;
            if (songName.length > 20) {
                songName = songName.substring(0, 18) + '...';
            }
            ctx.fillText(songName, rightCol + 180, songCardY + 130);
            
            ctx.fillStyle = '#C8AA6E';
            ctx.font = 'bold 18px Arial, sans-serif';
            ctx.fillText(`${statsData.favoriteSong.voteCount} votes`, rightCol + 180, songCardY + 160);
        }
    }
    
    // ========================================
    // FOOTER
    // ========================================
    
    // Footer line
    ctx.strokeStyle = 'rgba(200, 170, 110, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(100, 565);
    ctx.lineTo(1100, 565);
    ctx.stroke();
    
    // Footer text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Vote for your favorite League anthems at anthemarena.com', 600, 595);
    
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
// SHARE TO SOCIAL MEDIA (SIMPLIFIED)
// ========================================

async function shareStatsImage(canvas, statsData) {
    // ✅ NO WEB SHARE API - Just show toast
    // This prevents the native share dialog from appearing
    return new Promise((resolve) => {
        showShareToast(statsData, canvas);
        console.log('✅ Share toast displayed');
        resolve();
    });
}

// ========================================
// SHOW SHARE TOAST (SIMPLIFIED)
// ========================================

function showShareToast(statsData, canvas) {
    const toast = document.createElement('div');
    toast.className = 'share-success-toast';
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-icon">✅</div>
            <div class="toast-text">
                <strong>Stats Image Ready!</strong>
                <p>Your profile image has been generated</p>
            </div>
        </div>
        <div class="toast-actions">
            <button class="toast-btn download-btn" onclick="downloadStatsImage()">
                📥 Download Image
            </button>
            <button class="toast-btn copy-link-btn" onclick="copyShareLink()">
                📋 Copy Site Link
            </button>
        </div>
        <p class="toast-hint">💡 Share the image on your favorite social platform!</p>
    `;
    
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, rgba(26, 26, 46, 0.98), rgba(20, 20, 35, 0.98));
        color: white;
        padding: 1.5rem;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        border: 2px solid rgba(200, 170, 110, 0.3);
        z-index: 10001;
        min-width: 380px;
        animation: slideInUp 0.4s ease;
    `;
    
    // Store canvas globally so download button can access it
    window._statsCanvas = canvas;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 12 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOutDown 0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, 12000);
}

// ========================================
// DOWNLOAD STATS IMAGE
// ========================================

window.downloadStatsImage = function() {
    if (window._statsCanvas) {
        downloadCanvas(window._statsCanvas);
        
        // Show quick confirmation
        const confirmToast = document.createElement('div');
        confirmToast.textContent = '✅ Image downloaded!';
        confirmToast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4ade80;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            font-family: 'Lora', serif;
            font-weight: 600;
            z-index: 10002;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.3s ease;
        `;
        document.body.appendChild(confirmToast);
        setTimeout(() => confirmToast.remove(), 3000);
    }
};

// ========================================
// COPY SITE LINK
// ========================================

window.copyShareLink = function() {
    const siteUrl = 'https://anthemarena.com';
    
    navigator.clipboard.writeText(siteUrl).then(() => {
        // Show confirmation
        const confirmToast = document.createElement('div');
        confirmToast.textContent = '✅ Site link copied to clipboard!';
        confirmToast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4ade80;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            font-family: 'Lora', serif;
            font-weight: 600;
            z-index: 10002;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.3s ease;
        `;
        document.body.appendChild(confirmToast);
        setTimeout(() => confirmToast.remove(), 3000);
    }).catch(err => {
        alert('Failed to copy link. Please try manually: https://anthemarena.com');
        console.error('Copy failed:', err);
    });
};

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
        
        // Show toast (no native share dialog)
        await shareStatsImage(canvas, statsData);
        
        console.log('🎉 Stats image generated successfully!');
        
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
    
    // Add styles to document if not already present
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
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
            
            @keyframes slideInUp {
                from {
                    transform: translateY(100px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOutDown {
                from {
                    transform: translateY(0);
                    opacity: 1;
                }
                to {
                    transform: translateY(100px);
                    opacity: 0;
                }
            }
            
            .toast-content {
                display: flex;
                align-items: center;
                gap: 1rem;
                margin-bottom: 1rem;
            }
            
            .toast-icon {
                font-size: 2rem;
            }
            
            .toast-text strong {
                display: block;
                font-family: 'Cinzel', serif;
                font-size: 1.1rem;
                color: #C8AA6E;
                margin-bottom: 0.25rem;
            }
            
            .toast-text p {
                margin: 0;
                font-size: 0.9rem;
                color: rgba(255, 255, 255, 0.7);
            }
            
            .toast-actions {
                display: flex;
                gap: 0.75rem;
            }
            
            .toast-btn {
                flex: 1;
                padding: 0.75rem 1rem;
                border: none;
                border-radius: 8px;
                font-family: 'Lora', serif;
                font-size: 0.9rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .download-btn {
                background: linear-gradient(135deg, #C8AA6E, #B89A5E);
                color: #0a0a0a;
                font-weight: 700;
            }
            
            .download-btn:hover {
                background: linear-gradient(135deg, #D4B876, #C8AA6E);
                transform: translateY(-1px);
            }
            
            .copy-link-btn {
                background: rgba(255, 255, 255, 0.1);
                color: white;
                border: 1px solid rgba(200, 170, 110, 0.3);
            }
            
            .copy-link-btn:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(200, 170, 110, 0.5);
            }
            
            .toast-hint {
                margin-top: 1rem;
                font-size: 0.85rem;
                color: rgba(255, 255, 255, 0.5);
                font-style: italic;
                text-align: center;
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    return toast;
}

console.log('✅ Stats Image Generator ready');