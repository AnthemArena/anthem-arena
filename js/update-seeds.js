// ========================================
// AUTO-UPDATE SEEDS FROM YOUTUBE DATA
// ========================================

// ✅ PASTE YOUR API KEY HERE
const YOUTUBE_API_KEY = 'AIzaSyBD-Akzsa0ujYuDFa-WhfNPER56z2sQKZ0';

// Path to your songs JSON file
const SONGS_FILE_PATH = './data/music-videos.json'; // Example if in 'data' folder

// ========================================
// FETCH YOUTUBE STATS FOR A VIDEO
// ========================================

async function getYouTubeStats(videoId) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            const stats = data.items[0].statistics;
            return {
                views: parseInt(stats.viewCount),
                likes: parseInt(stats.likeCount),
                comments: parseInt(stats.commentCount) || 0
            };
        }
        
        console.error(`❌ No data found for video ID: ${videoId}`);
        return null;
    } catch (error) {
        console.error(`❌ Error fetching stats for ${videoId}:`, error.message);
        return null;
    }
}

// ========================================
// UPDATE ALL SONGS WITH FRESH DATA
// ========================================

async function updateAllSongs() {
    console.log('🔄 Starting seed update process...\n');
    
    // Load Node.js file system module
    const fs = await import('fs');
    
    // Load current songs data
    let songs;
    try {
        const fileContent = fs.readFileSync(SONGS_FILE_PATH, 'utf8');
        songs = JSON.parse(fileContent);
        console.log(`✅ Loaded ${songs.length} songs from ${SONGS_FILE_PATH}\n`);
    } catch (error) {
        console.error('❌ Error reading songs file:', error.message);
        return;
    }
    
    // Update each song
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        console.log(`[${i + 1}/${songs.length}] Fetching: ${song.shortTitle}...`);
        
        const stats = await getYouTubeStats(song.videoId);
        
        if (stats) {
            // Update stats
            song.views = stats.views;
            song.likes = stats.likes;
            
            // Calculate seed score: (views × 0.7) + (likes × 0.3)
            song.seedScore = (stats.views * 0.7) + (stats.likes * 0.3);
            
            console.log(`   ✅ Views: ${stats.views.toLocaleString()}, Likes: ${stats.likes.toLocaleString()}, Score: ${Math.round(song.seedScore).toLocaleString()}`);
            successCount++;
        } else {
            console.log(`   ⚠️ Failed to fetch stats`);
            errorCount++;
        }
        
        // Rate limit: Wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n📊 Stats Update Complete:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    
    // ========================================
    // SORT BY SEED SCORE AND ASSIGN SEEDS
    // ========================================
    
    console.log('\n🎯 Calculating new seed rankings...');
    
    // Sort by seedScore (highest first)
    songs.sort((a, b) => b.seedScore - a.seedScore);
    
    // Assign new seed numbers
    songs.forEach((song, index) => {
        song.seed = index + 1;
    });
    
    // ========================================
    // SAVE UPDATED DATA
    // ========================================
    
    try {
        // Create backup of old file
        const backupPath = SONGS_FILE_PATH.replace('.json', `-backup-${Date.now()}.json`);
        fs.copyFileSync(SONGS_FILE_PATH, backupPath);
        console.log(`\n💾 Backup created: ${backupPath}`);
        
        // Save updated data
        fs.writeFileSync(SONGS_FILE_PATH, JSON.stringify(songs, null, 2));
        console.log(`✅ Updated data saved to ${SONGS_FILE_PATH}`);
        
        // Show top 10
        console.log('\n🏆 NEW TOP 10 SEEDS:');
        songs.slice(0, 10).forEach((song, index) => {
            console.log(`   ${index + 1}. ${song.shortTitle} - ${song.views.toLocaleString()} views, ${song.likes.toLocaleString()} likes`);
        });
        
        console.log('\n✅ Seed update complete! 🎉');
        
    } catch (error) {
        console.error('❌ Error saving file:', error.message);
    }
}

// ========================================
// RUN THE UPDATE
// ========================================

updateAllSongs();