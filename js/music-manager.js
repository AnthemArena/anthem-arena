// ======================================
// YOUTUBE MUSIC MANAGER
// Background ambience for champion themes
// ======================================

class YouTubeMusicManager {
    constructor() {
        this.player = null;
        this.currentVideoId = null;
        this.isReady = false;
        this.defaultVolume = 15; // Low volume for ambience (0-100)
        
        // Load YouTube IFrame API
        this.loadAPI();
    }
    
    loadAPI() {
        // Check if API already loaded
        if (window.YT && window.YT.Player) {
            this.initPlayer();
            return;
        }
        
        // Load API script
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        
        // API will call this when ready
        window.onYouTubeIframeAPIReady = () => this.initPlayer();
    }
    
    initPlayer() {
        this.player = new YT.Player('youtube-player', {
            height: '0',
            width: '0',
            videoId: '',
            playerVars: {
                autoplay: 0,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                playsinline: 1,
                rel: 0,
                showinfo: 0
            },
            events: {
                onReady: () => {
                    this.isReady = true;
                    this.player.setVolume(this.defaultVolume);
                    console.log('🎵 Music system ready');
                },
                onStateChange: (event) => this.handleStateChange(event)
            }
        });
    }
    
    playTheme(videoId, themeName) {
        if (!this.isReady) {
            console.log('⏳ Music system not ready yet');
            return;
        }
        
        if (this.currentVideoId === videoId) {
            // Same theme - just ensure it's playing
            if (this.player.getPlayerState() !== YT.PlayerState.PLAYING) {
                this.player.playVideo();
            }
            return;
        }
        
        // Load new theme
        this.currentVideoId = videoId;
        this.player.loadVideoById({
            videoId: videoId,
            startSeconds: 0
        });
        
        // Show music indicator
        this.showNowPlaying(themeName);
        
        console.log(`🎵 Playing theme: ${themeName}`);
    }
    
    handleStateChange(event) {
        // Loop seamlessly when video ends
        if (event.data === YT.PlayerState.ENDED) {
            this.player.seekTo(0);
            this.player.playVideo();
        }
    }
    
    setVolume(volume) {
        // volume: 0-100
        if (this.isReady) {
            this.player.setVolume(volume);
            this.defaultVolume = volume;
        }
    }
    
    pause() {
        if (this.isReady) {
            this.player.pauseVideo();
        }
    }
    
    resume() {
        if (this.isReady) {
            this.player.playVideo();
        }
    }
    
    fadeVolume(targetVolume, duration = 1000) {
        if (!this.isReady) return;
        
        const startVolume = this.player.getVolume();
        const volumeChange = targetVolume - startVolume;
        const steps = 20;
        const stepDuration = duration / steps;
        let currentStep = 0;
        
        const interval = setInterval(() => {
            currentStep++;
            const newVolume = startVolume + (volumeChange * (currentStep / steps));
            this.player.setVolume(Math.round(newVolume));
            
            if (currentStep >= steps) {
                clearInterval(interval);
                this.defaultVolume = targetVolume;
            }
        }, stepDuration);
    }
    
    showNowPlaying(themeName) {
        const indicator = document.getElementById('music-indicator');
        if (indicator) {
            const nameEl = indicator.querySelector('.theme-name');
            if (nameEl) {
                nameEl.textContent = themeName;
            }
            indicator.classList.add('visible');
        }
    }
}

// ======================================
// CHAMPION THEME CONFIGURATION
// ======================================

const championThemes = {
    caitlyn: {
        videoId: 'itK7gvvxxDs',
        name: 'Caitlyn Theme'
    },
    jinx: {
        videoId: 'JoHRzfKrdtk',
        name: 'Jinx Theme'
    }
};

// Initialize music manager
const musicManager = new YouTubeMusicManager();

// ✅ EXPORT for use in battleship-ui.js
export { musicManager, championThemes };

console.log('🎵 Music Manager loaded');