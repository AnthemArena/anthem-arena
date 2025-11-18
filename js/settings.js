// ========================================
// SETTINGS PAGE - PROFILE MANAGEMENT
// ========================================

import { getUserXPFromStorage, getUserRank } from './rank-system.js';

// Champion list (same as username-system.js)
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

let selectedChampion = null;
let hasChanges = false;

// ========================================
// INITIALIZE PAGE
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('⚙️ Settings page loaded');
    
    // Load current profile
    loadCurrentProfile();
    
    // Render champion grid
    renderChampionGrid();
    
    // Setup event listeners
    setupEventListeners();
    
    // Hide loading overlay
    hideLoadingOverlay();
});

// ========================================
// LOAD CURRENT PROFILE
// ========================================

function loadCurrentProfile() {
    const username = localStorage.getItem('username') || '';
    const avatarJson = localStorage.getItem('avatar');
    const isPublic = localStorage.getItem('isPublic') === 'true';
    const currentXP = getUserXPFromStorage();
    const rank = getUserRank(currentXP);
    
    // Parse avatar
    let avatar;
    try {
        avatar = JSON.parse(avatarJson);
    } catch {
        avatar = { type: 'emoji', value: '🎵' };
    }
    
    // Update preview card
    updatePreviewCard(username, avatar, rank, currentXP);
    
    // Update form fields
    document.getElementById('usernameInput').value = username;
    document.getElementById('publicToggle').checked = isPublic;
    
    // Show selected avatar if exists
    if (avatar && avatar.type === 'url') {
        selectedChampion = {
            name: avatar.name || 'Unknown',
            displayName: avatar.name || 'Champion',
            url: avatar.value
        };
        showSelectedAvatar();
    }
    
    // Update stats
    updateStatsPreview();
    
    console.log('✅ Profile loaded');
}

// ========================================
// UPDATE PREVIEW CARD
// ========================================

function updatePreviewCard(username, avatar, rank, xp) {
    const previewAvatar = document.getElementById('previewAvatar');
    const previewUsername = document.getElementById('previewUsername');
    const previewRank = document.getElementById('previewRank');
    const previewStats = document.getElementById('previewStats');
    
    // Update avatar
    if (avatar && avatar.type === 'url') {
        previewAvatar.innerHTML = `<img src="${avatar.value}" alt="Avatar" class="preview-avatar-img" />`;
    } else {
        previewAvatar.textContent = avatar?.value || '🎵';
    }
    
    // Update username
    previewUsername.textContent = username || 'Guest';
    
    // Update rank
    const cleanTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
    previewRank.textContent = `Level ${rank.currentLevel.level} - ${cleanTitle}`;
    
    // Update stats
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const totalVotes = Object.keys(userVotes).length;
    previewStats.innerHTML = `
        <span><i class="fas fa-trophy"></i> ${totalVotes} votes cast</span>
        <span><i class="fas fa-star"></i> ${xp.toLocaleString()} XP</span>
    `;
}

// ========================================
// UPDATE STATS PREVIEW
// ========================================

function updateStatsPreview() {
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const totalVotes = Object.keys(userVotes).length;
    const streak = parseInt(localStorage.getItem('votingStreak') || '0');
    const xp = getUserXPFromStorage();
    
    document.getElementById('totalVotesStat').textContent = totalVotes;
    document.getElementById('streakStat').textContent = streak;
    document.getElementById('xpStat').textContent = xp.toLocaleString();
}

// ========================================
// RENDER CHAMPION GRID
// ========================================

function renderChampionGrid() {
    const grid = document.getElementById('avatarGrid');
    
    const html = CHAMPIONS.map(champion => {
        const displayName = champion.replace(/([A-Z])/g, ' $1').trim();
        return `
            <div class="champion-avatar-option" data-champion="${champion}" data-search="${displayName.toLowerCase()}" title="${displayName}">
                <img src="${CHAMPION_CDN}${champion}.png" alt="${displayName}" loading="lazy" />
            </div>
        `;
    }).join('');
    
    grid.innerHTML = html;
}

// ========================================
// SETUP EVENT LISTENERS
// ========================================

function setupEventListeners() {
    // Form submission
    document.getElementById('settingsForm').addEventListener('submit', handleSaveSettings);
    
    // Avatar search
    document.getElementById('avatarSearch').addEventListener('input', handleAvatarSearch);
    
    // Champion selection
    document.getElementById('avatarGrid').addEventListener('click', handleChampionClick);
    
    // Clear avatar button
    document.getElementById('clearAvatarBtn').addEventListener('click', clearSelectedAvatar);
    
    // Clear profile button
    document.getElementById('clearProfileBtn').addEventListener('click', handleClearProfile);
    
    // Track changes
    document.getElementById('usernameInput').addEventListener('input', () => hasChanges = true);
    document.getElementById('publicToggle').addEventListener('change', () => hasChanges = true);
    
    // Warn before leaving if unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (hasChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// ========================================
// HANDLE AVATAR SEARCH
// ========================================

function handleAvatarSearch(e) {
    const query = e.target.value.toLowerCase();
    const champions = document.querySelectorAll('.champion-avatar-option');
    
    champions.forEach(champ => {
        const searchText = champ.dataset.search;
        if (searchText.includes(query)) {
            champ.style.display = 'block';
        } else {
            champ.style.display = 'none';
        }
    });
}

// ========================================
// HANDLE CHAMPION CLICK
// ========================================

function handleChampionClick(e) {
    const option = e.target.closest('.champion-avatar-option');
    if (!option) return;
    
    const champion = option.dataset.champion;
    const displayName = option.title;
    const imageUrl = `${CHAMPION_CDN}${champion}.png`;
    
    selectedChampion = {
        name: champion,
        displayName: displayName,
        url: imageUrl
    };
    
    hasChanges = true;
    showSelectedAvatar();
    
    // Remove previous selection styling
    document.querySelectorAll('.champion-avatar-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    // Add selection styling
    option.classList.add('selected');
    
    console.log('✅ Champion selected:', displayName);
}

// ========================================
// SHOW SELECTED AVATAR
// ========================================

function showSelectedAvatar() {
    if (!selectedChampion) return;
    
    const display = document.getElementById('selectedAvatarDisplay');
    const img = document.getElementById('selectedAvatarImg');
    const name = document.getElementById('selectedAvatarName');
    
    img.src = selectedChampion.url;
    name.textContent = selectedChampion.displayName;
    display.style.display = 'flex';
}

// ========================================
// CLEAR SELECTED AVATAR
// ========================================

function clearSelectedAvatar() {
    selectedChampion = null;
    hasChanges = true;
    
    const display = document.getElementById('selectedAvatarDisplay');
    display.style.display = 'none';
    
    // Remove selection styling
    document.querySelectorAll('.champion-avatar-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    console.log('🗑️ Avatar cleared');
}

// ========================================
// VALIDATE USERNAME
// ========================================

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

// ========================================
// HANDLE SAVE SETTINGS
// ========================================

async function handleSaveSettings(e) {
    e.preventDefault();
    
    const usernameInput = document.getElementById('usernameInput');
    const errorEl = document.getElementById('usernameError');
    const publicToggle = document.getElementById('publicToggle');
    
    const username = usernameInput.value.trim();
    const isPublic = publicToggle.checked;
    
    // Validate username
    const validation = validateUsername(username);
    if (!validation.valid) {
        errorEl.textContent = validation.error;
        errorEl.style.display = 'block';
        usernameInput.focus();
        return;
    }
    
    // Hide error
    errorEl.style.display = 'none';
    
    // Determine avatar
    let avatar;
    if (selectedChampion) {
        avatar = {
            type: 'url',
            value: selectedChampion.url,
            name: selectedChampion.displayName
        };
    } else {
        // Keep existing emoji or default
        const current = localStorage.getItem('avatar');
        try {
            avatar = JSON.parse(current);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
    }
    
    // Save to localStorage
    localStorage.setItem('username', username);
    localStorage.setItem('isPublic', isPublic ? 'true' : 'false');
    localStorage.setItem('avatar', JSON.stringify(avatar));
    
    hasChanges = false;
    
    console.log('✅ Settings saved:', { username, isPublic, avatar });
    
    // Update navigation
    if (window.updateNavProfile) {
        window.updateNavProfile();
    }
    
    // Show success notification
    showNotification('✅ Profile updated successfully!', 'success');
    
    // Reload preview
    loadCurrentProfile();
}

// ========================================
// HANDLE CLEAR PROFILE
// ========================================

function handleClearProfile() {
    if (!confirm('⚠️ Are you sure you want to clear your profile data? This will remove your username, avatar, and privacy settings. Your vote history will remain.')) {
        return;
    }
    
    // Clear profile data
    localStorage.removeItem('username');
    localStorage.removeItem('avatar');
    localStorage.removeItem('isPublic');
    localStorage.removeItem('profileTipShown');
    
    console.log('🗑️ Profile data cleared');
    
    // Show notification
    showNotification('Profile data cleared. Reloading...', 'info');
    
    // Reload page
    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

// ========================================
// NOTIFICATION SYSTEM
// ========================================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const bgColor = {
        'success': 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))',
        'error': 'linear-gradient(135deg, rgba(220, 50, 50, 0.95), rgba(200, 30, 30, 0.95))',
        'info': 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))',
    }[type] || 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))';
    
    notification.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: ${bgColor};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-family: 'Lora', serif;
        font-size: 0.95rem;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ========================================
// HIDE LOADING OVERLAY
// ========================================

function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

console.log('✅ Settings.js loaded');