// ========================================
// USERNAME SYSTEM WITH CHAMPION AVATAR PICKER
// ========================================

// List of all League champions (using Riot Data Dragon)
const CHAMPIONS = [
    'Aatrox', 'Ahri', 'Akali', 'Akshan', 'Alistar', 'Amumu', 'Anivia', 'Annie', 'Aphelios', 
    'Ashe', 'AurelionSol', 'Azir', 'Bard', 'Belveth', 'Blitzcrank', 'Brand', 'Braum', 'Briar',
    'Caitlyn', 'Camille', 'Cassiopeia', 'Chogath', 'Corki', 'Darius', 'Diana', 'Draven', 
    'DrMundo', 'Ekko', 'Elise', 'Evelynn', 'Ezreal', 'Fiddlesticks', 'Fiora', 'Fizz', 
    'Galio', 'Gangplank', 'Garen', 'Gnar', 'Gragas', 'Graves', 'Gwen', 'Hecarim', 'Heimerdinger',
    'Hwei', 'Illaoi', 'Irelia', 'Ivern', 'Janna', 'JarvanIV', 'Jax', 'Jayce', 'Jhin', 'Jinx',
    'Kaisa', 'Kalista', 'Karma', 'Karthus', 'Kassadin', 'Katarina', 'Kayle', 'Kayn', 'Kennen',
    'Khazix', 'Kindred', 'Kled', 'KogMaw', 'KSante', 'Leblanc', 'LeeSin', 'Leona', 'Lillia',
    'Lissandra', 'Lucian', 'Lulu', 'Lux', 'Malphite', 'Malzahar', 'Maokai', 'MasterYi', 
    'Milio', 'MissFortune', 'Mordekaiser', 'Morgana', 'Naafiri', 'Nami', 'Nasus', 'Nautilus',
    'Neeko', 'Nidalee', 'Nilah', 'Nocturne', 'Nunu', 'Olaf', 'Orianna', 'Ornn', 'Pantheon',
    'Poppy', 'Pyke', 'Qiyana', 'Quinn', 'Rakan', 'Rammus', 'RekSai', 'Rell', 'Renata', 'Renekton',
    'Rengar', 'Riven', 'Rumble', 'Ryze', 'Samira', 'Sejuani', 'Senna', 'Seraphine', 'Sett',
    'Shaco', 'Shen', 'Shyvana', 'Singed', 'Sion', 'Sivir', 'Skarner', 'Smolder', 'Sona', 'Soraka',
    'Swain', 'Sylas', 'Syndra', 'TahmKench', 'Taliyah', 'Talon', 'Taric', 'Teemo', 'Thresh',
    'Tristana', 'Trundle', 'Tryndamere', 'TwistedFate', 'Twitch', 'Udyr', 'Urgot', 'Varus',
    'Vayne', 'Veigar', 'Velkoz', 'Vex', 'Vi', 'Viego', 'Viktor', 'Vladimir', 'Volibear',
    'Warwick', 'Wukong', 'Xayah', 'Xerath', 'XinZhao', 'Yasuo', 'Yone', 'Yorick', 'Yuumi',
    'Zac', 'Zed', 'Zeri', 'Ziggs', 'Zilean', 'Zoe', 'Zyra'
];

const CHAMPION_CDN = 'https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/';

/**
 * Check if user has a username, prompt if not
 */
export function ensureUsername() {
    const username = localStorage.getItem('username');
    
    if (!username) {
        showUsernamePrompt();
    }
    
    return username;
}

/**
 * Show username prompt modal
 */
function showUsernamePrompt() {
    const modal = document.createElement('div');
    modal.id = 'username-modal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content username-modal-content">
            <div class="username-prompt-header">
                <span class="prompt-icon">👤</span>
                <h2>Choose Your Username</h2>
                <p>Track your votes and appear on leaderboards!</p>
            </div>
            
            <div class="username-input-wrapper">
                <label for="username-input" class="input-label">Username</label>
                <input 
                    type="text" 
                    id="username-input" 
                    placeholder="Enter username..." 
                    maxlength="20"
                    autocomplete="off"
                />
                <div class="username-hint">3-20 characters, letters and numbers only</div>
                <div class="username-error" id="username-error"></div>
            </div>
            
            <div class="avatar-picker-wrapper">
                <label class="input-label">Choose Your Champion Avatar</label>
                <div class="avatar-search-wrapper">
                    <input 
                        type="text" 
                        id="avatar-search" 
                        placeholder="Search champions..." 
                        autocomplete="off"
                    />
                    <span class="search-icon">🔍</span>
                </div>
                <div class="selected-avatar-preview" id="selected-avatar-preview" style="display: none;">
                    <img id="selected-avatar-img" src="" alt="Selected avatar" />
                    <span id="selected-avatar-name">No champion selected</span>
                    <button class="clear-avatar-btn" onclick="window.clearSelectedAvatar()">✕</button>
                </div>
                <div class="avatar-grid" id="avatar-grid">
                    ${renderChampionGrid(CHAMPIONS)}
                </div>
            </div>
            
            <div class="username-privacy">
                <label class="checkbox-label">
                    <input type="checkbox" id="make-public-checkbox" checked />
                    <span>Make my votes public (appear on leaderboards)</span>
                </label>
                <p class="privacy-note">You can change this later in My Votes</p>
            </div>
            
            <div class="modal-actions">
                <button class="modal-btn primary" onclick="window.saveUsername()">
                    Continue
                </button>
                <button class="modal-btn secondary" onclick="window.skipUsername()">
                    Skip for Now
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Focus input
    setTimeout(() => {
        document.getElementById('username-input')?.focus();
    }, 100);
    
    // Enter key support
    document.getElementById('username-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            window.saveUsername();
        }
    });
    
    // Setup avatar search
    setupAvatarSearch();
    
    // Setup champion selection
    setupChampionSelection();
}

/**
 * Render champion grid
 */
function renderChampionGrid(champions) {
    return champions.map(champion => {
        const cleanName = champion.replace(/[^a-zA-Z0-9]/g, '');
        const displayName = champion.replace(/([A-Z])/g, ' $1').trim();
        return `
            <div class="champion-avatar-option" data-champion="${champion}" data-search="${displayName.toLowerCase()}" title="${displayName}">
                <img src="${CHAMPION_CDN}${champion}.png" alt="${displayName}" />
            </div>
        `;
    }).join('');
}

/**
 * Setup avatar search functionality
 */
function setupAvatarSearch() {
    const searchInput = document.getElementById('avatar-search');
    const avatarGrid = document.getElementById('avatar-grid');
    
    searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const champions = avatarGrid.querySelectorAll('.champion-avatar-option');
        
        champions.forEach(champ => {
            const searchText = champ.dataset.search;
            if (searchText.includes(query)) {
                champ.style.display = 'block';
            } else {
                champ.style.display = 'none';
            }
        });
    });
}

/**
 * Setup champion selection
 */
function setupChampionSelection() {
    const avatarGrid = document.getElementById('avatar-grid');
    
    avatarGrid?.addEventListener('click', (e) => {
        const option = e.target.closest('.champion-avatar-option');
        if (!option) return;
        
        const champion = option.dataset.champion;
        const displayName = option.title;
        const imageUrl = `${CHAMPION_CDN}${champion}.png`;
        
        // Update selected preview
        const preview = document.getElementById('selected-avatar-preview');
        const previewImg = document.getElementById('selected-avatar-img');
        const previewName = document.getElementById('selected-avatar-name');
        
        previewImg.src = imageUrl;
        previewName.textContent = displayName;
        preview.style.display = 'flex';
        
        // Store selected champion temporarily
        window.selectedChampion = {
            name: champion,
            displayName: displayName,
            url: imageUrl
        };
        
        // Remove previous selection styling
        avatarGrid.querySelectorAll('.champion-avatar-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        
        // Add selection styling
        option.classList.add('selected');
        
        console.log('✅ Champion selected:', displayName);
    });
}

/**
 * Clear selected avatar
 */
window.clearSelectedAvatar = function() {
    const preview = document.getElementById('selected-avatar-preview');
    preview.style.display = 'none';
    
    window.selectedChampion = null;
    
    // Remove selection styling
    document.querySelectorAll('.champion-avatar-option').forEach(opt => {
        opt.classList.remove('selected');
    });
};

/**
 * Validate username
 */
function validateUsername(username) {
    if (!username || username.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters' };
    }
    
    if (username.length > 20) {
        return { valid: false, error: 'Username must be 20 characters or less' };
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    
    return { valid: true };
}

/**
 * Get random avatar emoji
 */
function getRandomAvatar() {
    const avatars = ['🎵', '🎸', '🎤', '🎹', '🎺', '🎻', '🥁', '🎧', '🎶', '🔥', '⚡', '🌟', '💫', '👑', '🏆'];
    return avatars[Math.floor(Math.random() * avatars.length)];
}

/**
 * Save username
 */
window.saveUsername = async function() {
    const usernameInput = document.getElementById('username-input');
    const errorEl = document.getElementById('username-error');
    const makePublic = document.getElementById('make-public-checkbox')?.checked;
    
    const username = usernameInput?.value.trim();
    
    // Validate username
    const validation = validateUsername(username);
    if (!validation.valid) {
        errorEl.textContent = validation.error;
        errorEl.style.display = 'block';
        usernameInput?.focus();
        return;
    }
    
    // Determine avatar (selected champion or random emoji)
    let avatar;
    if (window.selectedChampion) {
        avatar = {
            type: 'url',
            value: window.selectedChampion.url,
            name: window.selectedChampion.displayName
        };
    } else {
        avatar = {
            type: 'emoji',
            value: getRandomAvatar()
        };
    }
    
    // Save to localStorage
localStorage.setItem('username', username);
localStorage.setItem('tournamentUsername', username); // ✅ Keep in sync
localStorage.setItem('isPublic', makePublic ? 'true' : 'false');
localStorage.setItem('avatar', JSON.stringify(avatar));
    
    console.log(`✅ Username set: ${username} (public: ${makePublic})`);
    console.log(`✅ Avatar:`, avatar);
    
    // Backfill past votes if user chose public
    if (makePublic) {
        await backfillUserActivity(username, avatar, makePublic);
    }
    
    // Close modal
    closeUsernameModal();
    
    // Show success notification
    if (window.showNotification) {
        window.showNotification(`Welcome, ${username}! 🎉`, 'success');
    }
};

/**
 * Skip username setup
 */
window.skipUsername = function() {
    localStorage.setItem('usernamePromptShown', 'true');
    closeUsernameModal();
};

/**
 * Close username modal
 */
function closeUsernameModal() {
    const modal = document.getElementById('username-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 200);
    }
}

/**
 * Backfill past votes to activity collection
 */
async function backfillUserActivity(username, avatar, isPublic) {
    if (!isPublic) return;
    
    try {
        console.log('🔄 Backfilling past votes to activity feed...');
        
        const { db } = await import('./firebase-config.js');
        const { doc, setDoc } = await import(
            'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
        );
        
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        const userId = localStorage.getItem('tournamentUserId');
        
        if (!userId) {
            console.warn('⚠️ No user ID found');
            return;
        }
        
        const voteIds = Object.keys(userVotes);
        
        if (voteIds.length === 0) {
            console.log('📭 No past votes to backfill');
            return;
        }
        
        console.log(`📦 Backfilling ${voteIds.length} past votes...`);
        
        const { getAllMatches } = await import('./api-client.js');
        const allMatches = await getAllMatches();
        const matchMap = new Map(allMatches.map(m => [m.id || m.matchId, m]));
        
        let backfilled = 0;
        
        for (const matchId of voteIds) {
            const voteData = userVotes[matchId];
            const matchData = matchMap.get(matchId);
            
            if (!matchData) {
                console.warn(`⚠️ Match ${matchId} not found, skipping`);
                continue;
            }
            
            const votedSong = voteData.songId === 'song1' ? matchData.song1 : matchData.song2;
            
            const activityId = `${userId}_${matchId}`;
            
            await setDoc(doc(db, 'activity', activityId), {
                activityId: activityId,
                userId: userId,
                username: username,
                avatar: avatar,
                matchId: matchId,
                matchTitle: `${matchData.song1?.shortTitle || 'Song 1'} vs ${matchData.song2?.shortTitle || 'Song 2'}`,
                songId: voteData.songId,
                songTitle: votedSong?.shortTitle || voteData.songTitle,
                timestamp: voteData.timestamp || Date.now(),
                round: matchData.round || 1,
                tournamentId: '2025-worlds-anthems',
                backfilled: true
            });
            
            backfilled++;
        }
        
        console.log(`✅ Successfully backfilled ${backfilled} votes!`);
        
        if (window.showNotification) {
            window.showNotification(`✨ ${backfilled} past votes added to activity feed!`, 'success');
        }
        
    } catch (error) {
        console.error('❌ Error backfilling activity:', error);
    }
}

console.log('✅ Username system loaded');