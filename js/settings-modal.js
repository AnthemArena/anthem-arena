// ========================================
// SETTINGS MODAL - PROFILE MANAGEMENT
// ========================================

import { getUserXPFromStorage, getUserRank } from './rank-system.js';
import { db } from './firebase-config.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
let modalElement = null;

// ========================================
// OPEN SETTINGS MODAL
// ========================================

export function openSettingsModal() {
    console.log('⚙️ Opening settings modal...');
    
    // Create modal if it doesn't exist
    if (!modalElement) {
        createModalHTML();
    }
    
    // Load current profile
    loadCurrentProfile();
    
    // Render champion grid
    renderChampionGrid();
    
    // Setup event listeners
    setupEventListeners();
    
    // Show modal with animation
    setTimeout(() => {
        modalElement.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
    }, 10);
}

// ========================================
// CLOSE SETTINGS MODAL
// ========================================

function closeSettingsModal() {
    if (!modalElement) return;
    
    // Check for unsaved changes
    if (hasChanges) {
        if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
            return;
        }
    }
    
    modalElement.classList.remove('active');
    document.body.style.overflow = ''; // Re-enable scroll
    
    // Reset state
    hasChanges = false;
    selectedChampion = null;
    
    console.log('✅ Settings modal closed');
}

// ========================================
// CREATE MODAL HTML
// ========================================

function createModalHTML() {
    const modalHTML = `
        <div class="settings-modal-overlay" id="settingsModalOverlay">
            <div class="settings-modal-container">
                <div class="settings-modal-header">
                    <h2><i class="fas fa-cog"></i> Profile Settings</h2>
                    <button class="modal-close-btn" id="settingsModalClose">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="settings-modal-body">
                    <!-- Profile Preview -->
                    <div class="profile-preview-card" id="profilePreview">
                        <div class="preview-avatar" id="previewAvatar">🎵</div>
                        <div class="preview-info">
                            <div class="preview-username" id="previewUsername">Guest</div>
                            <div class="preview-rank" id="previewRank">Level 1 - New Voter</div>
                            <div class="preview-stats" id="previewStats">
                                <span><i class="fas fa-trophy"></i> 0 votes</span>
                            </div>
                        </div>
                    </div>

                    <!-- Settings Form -->
                    <form id="settingsForm" class="settings-form">
                        
                        <!-- Username Section -->
                        <div class="settings-section">
                            <h3><i class="fas fa-user"></i> Username</h3>
                            <div class="form-group">
                                <input 
                                    type="text" 
                                    id="usernameInput" 
                                    placeholder="Enter username..." 
                                    maxlength="20"
                                    autocomplete="off"
                                />
                                <div class="form-hint">3-20 characters, letters, numbers, and underscores</div>
                                <div class="form-error" id="usernameError"></div>
                            </div>
                        </div>

                     <!-- Avatar Section -->
<div class="settings-section">
    <h3><i class="fas fa-image"></i> Avatar</h3>
    <p class="section-description">Choose a League champion</p>
    
    <div class="avatar-search-wrapper">
        <input 
            type="text" 
            id="avatarSearch" 
            placeholder="Search champions..." 
            autocomplete="off"
        />
        <span class="search-icon">🔍</span>
    </div>
    
    <div class="selected-avatar-display" id="selectedAvatarDisplay" style="display: none;">
        <img id="selectedAvatarImg" src="" alt="Selected avatar" />
        <span id="selectedAvatarName">No champion selected</span>
        <button type="button" class="clear-avatar-btn" id="clearAvatarBtn">
            <i class="fas fa-times"></i>
        </button>
    </div>
    
    <!-- ✅ PRIVACY TOGGLE MOVED HERE (before avatar grid) -->
    <div style="margin: 1.5rem 0; padding-top: 1rem; border-top: 1px solid rgba(200, 155, 60, 0.2);">
        <label class="toggle-label">
            <input type="checkbox" id="publicToggle" class="toggle-input" />
            <span class="toggle-slider"></span>
            <div class="toggle-info">
                <strong>Make my votes public</strong>
                <p>Appear in Community Activity feed</p>
            </div>
        </label>
    </div>
    
    <div class="avatar-grid" id="avatarGrid">
        <!-- Champion grid will be inserted here -->
    </div>
</div>

                        <!-- Form Actions -->
                        <div class="form-actions">
                            <button type="submit" class="btn-save">
                                <i class="fas fa-save"></i> Save Changes
                            </button>
                            <button type="button" class="btn-cancel" id="cancelBtn">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    // Inject modal into body
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer.firstElementChild);
    
    modalElement = document.getElementById('settingsModalOverlay');
    
    console.log('✅ Settings modal created');
}

// ========================================
// LOAD CURRENT PROFILE
// ========================================

function loadCurrentProfile() {
   const username = localStorage.getItem('username') || '';
const avatarJson = localStorage.getItem('avatar');

// ✅ Default to public if not set
let isPublic = localStorage.getItem('isPublic');
if (isPublic === null) {
    // First time - default to public
    localStorage.setItem('isPublic', 'true');
    isPublic = 'true';
}
isPublic = isPublic === 'true';
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
// ✅ Set toggle (will be true by default for new users)
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
    
    console.log('✅ Profile loaded in modal');
}

// ========================================
// UPDATE PREVIEW CARD
// ========================================

function updatePreviewCard(username, avatar, rank, xp) {
    const previewAvatar = document.getElementById('previewAvatar');
    const previewUsername = document.getElementById('previewUsername');
    const previewRank = document.getElementById('previewRank');
    const previewStats = document.getElementById('previewStats');
    
    if (!previewAvatar || !previewUsername || !previewRank || !previewStats) return;
    
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
        <span><i class="fas fa-trophy"></i> ${totalVotes} votes</span>
        <span><i class="fas fa-star"></i> ${xp.toLocaleString()} XP</span>
    `;
}

// ========================================
// RENDER CHAMPION GRID
// ========================================

function renderChampionGrid() {
    const grid = document.getElementById('avatarGrid');
    if (!grid) return;
    
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
    const form = document.getElementById('settingsForm');
    if (form) {
        form.removeEventListener('submit', handleSaveSettings); // Remove old listener
        form.addEventListener('submit', handleSaveSettings);
    }
    
    // Close buttons
    const closeBtn = document.getElementById('settingsModalClose');
    const cancelBtn = document.getElementById('cancelBtn');
    const overlay = document.getElementById('settingsModalOverlay');
    
    if (closeBtn) {
        closeBtn.removeEventListener('click', closeSettingsModal);
        closeBtn.addEventListener('click', closeSettingsModal);
    }
    
    if (cancelBtn) {
        cancelBtn.removeEventListener('click', closeSettingsModal);
        cancelBtn.addEventListener('click', closeSettingsModal);
    }
    
    // Click outside to close
    if (overlay) {
        overlay.removeEventListener('click', handleOverlayClick);
        overlay.addEventListener('click', handleOverlayClick);
    }
    
    // Avatar search
    const searchInput = document.getElementById('avatarSearch');
    if (searchInput) {
        searchInput.removeEventListener('input', handleAvatarSearch);
        searchInput.addEventListener('input', handleAvatarSearch);
    }
    
    // Champion selection
    const avatarGrid = document.getElementById('avatarGrid');
    if (avatarGrid) {
        avatarGrid.removeEventListener('click', handleChampionClick);
        avatarGrid.addEventListener('click', handleChampionClick);
    }
    
    // Clear avatar button
    const clearBtn = document.getElementById('clearAvatarBtn');
    if (clearBtn) {
        clearBtn.removeEventListener('click', clearSelectedAvatar);
        clearBtn.addEventListener('click', clearSelectedAvatar);
    }
    
    // Track changes
    const usernameInput = document.getElementById('usernameInput');
    const publicToggle = document.getElementById('publicToggle');
    
    if (usernameInput) {
        usernameInput.removeEventListener('input', trackChanges);
        usernameInput.addEventListener('input', trackChanges);
    }
    
    if (publicToggle) {
        publicToggle.removeEventListener('change', trackChanges);
        publicToggle.addEventListener('change', trackChanges);
    }
    
    // ESC key to close
    document.removeEventListener('keydown', handleEscapeKey);
    document.addEventListener('keydown', handleEscapeKey);
}

function trackChanges() {
    hasChanges = true;
}

function handleEscapeKey(e) {
    if (e.key === 'Escape' && modalElement && modalElement.classList.contains('active')) {
        closeSettingsModal();
    }
}

function handleOverlayClick(e) {
    if (e.target.id === 'settingsModalOverlay') {
        closeSettingsModal();
    }
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
    
    if (display && img && name) {
        img.src = selectedChampion.url;
        name.textContent = selectedChampion.displayName;
        display.style.display = 'flex';
    }
}

// ========================================
// CLEAR SELECTED AVATAR
// ========================================

function clearSelectedAvatar() {
    selectedChampion = null;
    hasChanges = true;
    
    const display = document.getElementById('selectedAvatarDisplay');
    if (display) {
        display.style.display = 'none';
    }
    
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
    
    if (!usernameInput || !errorEl || !publicToggle) return;
    
    const username = usernameInput.value.trim();
    const isPublic = publicToggle.checked;
    
    // Validate username
    const validation = validateUsername(username);
    if (!validation.valid) {
        errorEl.textContent = validation.error;
        errorEl.style.display = 'block';
        usernameInput.focus();
        return false;
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
    
    // ✅ NEW: Save to Firebase profiles collection
    try {
        const userId = localStorage.getItem('userId');
        if (userId) {
            await setDoc(doc(db, 'profiles', userId), {
                username: username,
                avatar: avatar,
                isPublic: isPublic,
                updatedAt: Date.now()
            });
            console.log('✅ Profile saved to Firebase');
        }
    } catch (error) {
        console.warn('⚠️ Could not save profile to Firebase:', error);
        // Don't block the save if Firebase fails
    }
    
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
    
    // Close modal after short delay
    setTimeout(() => {
        closeSettingsModal();
    }, 1000);
    
    return true;
}

// ========================================
// NOTIFICATION SYSTEM
// ========================================

function showNotification(message, type = 'success') {
    // Use global notification if available
    if (window.showNotification) {
        window.showNotification(message, type);
        return;
    }
    
    // Fallback notification
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
        z-index: 100000;
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
// EXPORT AND GLOBAL ACCESS
// ========================================

export { closeSettingsModal };

// Make globally accessible
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;

console.log('✅ Settings modal module loaded');