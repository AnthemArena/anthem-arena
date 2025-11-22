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
    
    // ✅ NEW: Setup banner preview
    setupBannerPreview();
    
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
                            
                            <div class="avatar-grid" id="avatarGrid">
                                <!-- Champion grid will be inserted here -->
                            </div>
                        </div>

                        <!-- Bio Section -->
                        <div class="settings-section">
                            <h3><i class="fas fa-pen"></i> Bio</h3>
                            <p class="section-description">Tell others about yourself (optional)</p>
                            
                            <div class="form-group">
                                <textarea 
                                    id="bioInput" 
                                    placeholder="Music enthusiast, League fan, proud underdog supporter..." 
                                    maxlength="200"
                                    rows="3"
                                    autocomplete="off"
                                ></textarea>
                                <div class="form-hint">
                                    <span id="bioCharCount">0</span>/200 characters
                                </div>
                            </div>
                        </div>

                        // ========================================
// ADD THIS: Banner Selection Field
// ========================================

<div class="setting-group">
    <label for="bannerSelect">
        <i class="fas fa-image"></i> Profile Banner
    </label>
    <select id="bannerSelect" class="setting-input">
        <option value="auto">Auto (Match Avatar)</option>
        <option value="default">Default (Gold Gradient)</option>
        <optgroup label="Champions">
            <option value="Ahri">Ahri</option>
            <option value="Akali">Akali</option>
            <option value="Akshan">Akshan</option>
            <option value="Ashe">Ashe</option>
            <option value="Ekko">Ekko</option>
            <option value="Ezreal">Ezreal</option>
            <option value="Jhin">Jhin</option>
            <option value="Jinx">Jinx</option>
            <option value="Kaisa">Kai'Sa</option>
            <option value="KSante">K'Sante</option>
            <option value="Katarina">Katarina</option>
            <option value="LeeSin">Lee Sin</option>
            <option value="Lux">Lux</option>
            <option value="MissFortune">Miss Fortune</option>
            <option value="Pyke">Pyke</option>
            <option value="Seraphine">Seraphine</option>
            <option value="Sett">Sett</option>
            <option value="Sona">Sona</option>
            <option value="Thresh">Thresh</option>
            <option value="Yasuo">Yasuo</option>
            <option value="Yone">Yone</option>
            <option value="Zed">Zed</option>
        </optgroup>
    </select>
    <small class="setting-hint">Choose a champion splash art for your profile banner</small>
</div>

<!-- ✅ OPTIONAL: Banner Preview -->
<div class="setting-group">
    <div id="bannerPreview" class="banner-preview">
        <div class="banner-preview-overlay">
            <span>Banner Preview</span>
        </div>
    </div>
</div>

                        <!-- Privacy & Social Settings -->
<div class="settings-section">
    <h3><i class="fas fa-shield-alt"></i> Privacy & Social</h3>
    <p class="section-description">Control who can interact with you</p>
    
    <div class="privacy-settings">
        <!-- Public Profile -->
        <label class="toggle-label">
            <input type="checkbox" id="publicToggle" class="toggle-input" />
            <span class="toggle-slider"></span>
            <div class="toggle-info">
                <strong>🌐 Public Profile</strong>
                <p>Show your votes in Community Activity feed</p>
            </div>
        </label>
        
        <!-- Message Privacy -->
        <div class="toggle-label select-wrapper">
            <div class="toggle-info" style="flex: 1;">
                <strong>💬 Who Can Message You?</strong>
                <select id="messagePrivacySelect" class="privacy-select">
                    <option value="everyone">Everyone</option>
                    <option value="followers">People You Follow</option>
                    <option value="nobody">Nobody</option>
                </select>
            </div>
        </div>
        
        <!-- Show Online Status -->
        <label class="toggle-label">
            <input type="checkbox" id="showOnlineStatusToggle" class="toggle-input" />
            <span class="toggle-slider"></span>
            <div class="toggle-info">
                <strong>🟢 Show Online Status</strong>
                <p>Let others see when you're active</p>
            </div>
        </label>
        
        <!-- Emote Privacy -->
        <div class="toggle-label select-wrapper">
            <div class="toggle-info" style="flex: 1;">
                <strong>🎭 Who Can Send You Emotes?</strong>
                <select id="emotePrivacySelect" class="privacy-select">
                    <option value="everyone">Everyone</option>
                    <option value="followers">People You Follow</option>
                    <option value="nobody">Nobody</option>
                </select>
            </div>
        </div>
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
        const bio = localStorage.getItem('bio') || ''; // ✅ ADD THIS

    
    // ✅ Load privacy settings with defaults
    const privacyDefaults = {
        isPublic: 'true',
    allowFollows: 'true',  // ✅ Changed from allowFriendRequests
        messagePrivacy: 'everyone',
        showOnlineStatus: 'true',
        emotePrivacy: 'everyone'
    };
    
    // Load or set defaults
    Object.keys(privacyDefaults).forEach(key => {
        if (localStorage.getItem(key) === null) {
            localStorage.setItem(key, privacyDefaults[key]);
        }
    });
    
    const isPublic = localStorage.getItem('isPublic') === 'true';
const allowFollows = localStorage.getItem('allowFollows') === 'true';  // ✅ Changed
    const messagePrivacy = localStorage.getItem('messagePrivacy') || 'everyone';
    const showOnlineStatus = localStorage.getItem('showOnlineStatus') === 'true';
    const emotePrivacy = localStorage.getItem('emotePrivacy') || 'everyone';
    
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

     
    // ✅ ADD BIO LOADING
    const bioInput = document.getElementById('bioInput');
    if (bioInput) {
        bioInput.value = bio;
        updateBioCharCount(); // Update character count
    }
    
  // ✅ Set all privacy toggles
document.getElementById('publicToggle').checked = isPublic;
document.getElementById('messagePrivacySelect').value = messagePrivacy;
document.getElementById('showOnlineStatusToggle').checked = showOnlineStatus;
document.getElementById('emotePrivacySelect').value = emotePrivacy;
    
    // Show selected avatar if exists
    if (avatar && avatar.type === 'url') {
        selectedChampion = {
            name: avatar.name || 'Unknown',
            displayName: avatar.name || 'Champion',
            url: avatar.value
        };
        showSelectedAvatar();
    }
    
    console.log('✅ Profile loaded with privacy settings');
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

// In settings-modal.js, add this function near setupEventListeners()

function updateBioCharCount() {
    const bioInput = document.getElementById('bioInput');
    const charCount = document.getElementById('bioCharCount');
    
    if (bioInput && charCount) {
        charCount.textContent = bioInput.value.length;
    }
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

       // ✅ ADD BIO INPUT TRACKING
    const bioInput = document.getElementById('bioInput');
    if (bioInput) {
        bioInput.removeEventListener('input', handleBioInput);
        bioInput.addEventListener('input', handleBioInput);
    }
    
   // Track changes on all inputs
    const trackableInputs = [
        'usernameInput',
        'publicToggle',
        'messagePrivacySelect',
        'showOnlineStatusToggle',
        'emotePrivacySelect'
    ];
    
    trackableInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const eventType = element.tagName === 'SELECT' ? 'change' : 
                             element.type === 'checkbox' ? 'change' : 'input';
            element.removeEventListener(eventType, trackChanges);
            element.addEventListener(eventType, trackChanges);
        }
    });
    
    // ESC key to close
    document.removeEventListener('keydown', handleEscapeKey);
    document.addEventListener('keydown', handleEscapeKey);
}

// ✅ ADD THIS NEW FUNCTION
function handleBioInput() {
    hasChanges = true;
    updateBioCharCount();
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
    const bioInput = document.getElementById('bioInput');
    const errorEl = document.getElementById('usernameError');
    const saveBtn = e.target.querySelector('button[type="submit"]') || e.submitter;
    
    if (!usernameInput || !errorEl) return;
    
    const username = usernameInput.value.trim();
    const bio = bioInput?.value.trim() || '';
    
    // ✅ Get all privacy settings
    const privacySettings = {
        isPublic: document.getElementById('publicToggle')?.checked ?? true,
        messagePrivacy: document.getElementById('messagePrivacySelect')?.value ?? 'everyone',
        showOnlineStatus: document.getElementById('showOnlineStatusToggle')?.checked ?? true,
        emotePrivacy: document.getElementById('emotePrivacySelect')?.value ?? 'everyone'
    };
    
    // ✅ NEW: Get banner selection
    const bannerSelect = document.getElementById('bannerSelect')?.value || 'auto';
    let banner;
    
    if (bannerSelect === 'auto') {
        banner = { type: 'auto' };
    } else if (bannerSelect === 'default') {
        banner = { type: 'default' };
    } else {
        // Specific champion splash
        banner = {
            type: 'champion',
            championId: bannerSelect,
            skinNumber: 0
        };
    }
    
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
    
    // ========================================
    // SAVE WITH LOADING STATES
    // ========================================
    const originalBtnText = saveBtn ? saveBtn.innerHTML : '';
    
    try {
        // Disable button and show loading
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner"></span> Saving...';
        }
        
        // Save to localStorage (backward compatible)
        localStorage.setItem('username', username);
        localStorage.setItem('avatar', JSON.stringify(avatar));
        localStorage.setItem('bio', bio);
        localStorage.setItem('banner', JSON.stringify(banner)); // ✅ NEW: Save banner
        
        // Save all privacy settings
        Object.keys(privacySettings).forEach(key => {
            const value = privacySettings[key];
            if (typeof value === 'boolean') {
                localStorage.setItem(key, value ? 'true' : 'false');
            } else {
                localStorage.setItem(key, value);
            }
        });
        
        // Save to Firebase profiles collection
        const userId = localStorage.getItem('tournamentUserId');
        if (userId) {
            await setDoc(doc(db, 'profiles', userId), {
                username: username,
                avatar: avatar,
                banner: banner,  // ✅ NEW: Save banner to Firebase
                bio: bio,
                privacy: privacySettings,
                updatedAt: Date.now()
            });
            console.log('✅ Profile saved to Firebase with banner and privacy settings');
            
            // Show updating history state
            if (saveBtn) {
                saveBtn.innerHTML = '<span class="spinner"></span> Updating history...';
            }
            
            // Automatically backfill old votes/activity (batched)
            await backfillUserHistory(userId, username, avatar, privacySettings.isPublic);
            
            // Invalidate profile cache after save
            invalidateProfileCache(username);
            console.log('🗑️ Profile cache invalidated');
        }
        
        hasChanges = false;
        
        console.log('✅ Settings saved:', { username, avatar, banner, privacy: privacySettings });
        
        // Update navigation
        if (window.updateNavProfile) {
            window.updateNavProfile();
        }
        
        // Show success state
        if (saveBtn) {
            saveBtn.innerHTML = '✅ Saved!';
            saveBtn.style.background = '#4caf50';
        }
        
        // Show success notification
        showNotification('✅ Profile updated successfully!', 'success');
        
        // Reload preview
        loadCurrentProfile();
        
        // Close modal after short delay
        setTimeout(() => {
            closeSettingsModal();
            if (saveBtn) {
                saveBtn.innerHTML = originalBtnText;
                saveBtn.style.background = '';
                saveBtn.disabled = false;
            }
        }, 1500);
        
        return true;
        
    } catch (error) {
        console.error('❌ Error saving settings:', error);
        
        // Show error state
        if (saveBtn) {
            saveBtn.innerHTML = '❌ Error';
            saveBtn.style.background = '#f44336';
        }
        
        showNotification('❌ Failed to save profile', 'error');
        
        // Reset button after delay
        setTimeout(() => {
            if (saveBtn) {
                saveBtn.innerHTML = originalBtnText;
                saveBtn.style.background = '';
                saveBtn.disabled = false;
            }
        }, 2000);
        
        return false;
    }
}

// ========================================
// BANNER PREVIEW
// ========================================

function setupBannerPreview() {
    const bannerSelect = document.getElementById('bannerSelect');
    const bannerPreview = document.getElementById('bannerPreview');
    
    if (!bannerSelect || !bannerPreview) return;
    
    // Update preview when selection changes
    bannerSelect.addEventListener('change', () => {
        updateBannerPreview(bannerSelect.value);
    });
    
    // Initial preview
    updateBannerPreview(bannerSelect.value);
}

function updateBannerPreview(selection) {
    const bannerPreview = document.getElementById('bannerPreview');
    if (!bannerPreview) return;
    
    if (selection === 'default') {
        // Gold gradient
        bannerPreview.style.background = `
            linear-gradient(135deg, 
                rgba(200, 170, 110, 0.9) 0%, 
                rgba(26, 26, 46, 0.95) 50%,
                rgba(10, 10, 10, 0.98) 100%
            )
        `;
        bannerPreview.style.backgroundImage = '';
        
    } else if (selection === 'auto') {
        // Show current avatar's champion (if champion avatar)
        const currentAvatar = getCurrentAvatarSelection();
        
        if (currentAvatar.type === 'champion') {
            const splashUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${currentAvatar.championId}_0.jpg`;
            bannerPreview.style.backgroundImage = `
                linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(10,10,10,0.9)),
                url('${splashUrl}')
            `;
        } else {
            // Fallback to gradient if avatar is emoji
            bannerPreview.style.background = `
                linear-gradient(135deg, 
                    rgba(200, 170, 110, 0.9) 0%, 
                    rgba(26, 26, 46, 0.95) 50%,
                    rgba(10, 10, 10, 0.98) 100%
                )
            `;
            bannerPreview.style.backgroundImage = '';
        }
        
    } else {
        // Specific champion
        const splashUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${selection}_0.jpg`;
        bannerPreview.style.backgroundImage = `
            linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(10,10,10,0.9)),
            url('${splashUrl}')
        `;
    }
    
    bannerPreview.style.backgroundSize = 'cover';
    bannerPreview.style.backgroundPosition = 'center 30%';
}

function getCurrentAvatarSelection() {
    const avatarType = document.querySelector('input[name="avatarType"]:checked')?.value;
    
    if (avatarType === 'champion') {
        const selectedChampion = document.querySelector('.avatar-option.selected[data-type="champion"]');
        return {
            type: 'champion',
            championId: selectedChampion?.dataset.champion
        };
    }
    
    return { type: 'emoji' };
}

// ✅ Call this when settings modal opens
// Add to your existing openSettingsModal() or init function:
// setupBannerPreview();

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
// AUTO-BACKFILL USER HISTORY
// ========================================

// ========================================
// AUTO-BACKFILL USER HISTORY
// ========================================

/**
 * Automatically update all old votes/activity when user updates profile
 */
/**
 * Automatically update all old votes/activity when user updates profile
 * Uses batched writes for better performance
 */
async function backfillUserHistory(userId, username, avatar, isPublic) {
    console.log('🔄 Updating all votes/activity with new profile...');
    
    try {
        const { collection, query, where, getDocs, writeBatch } = 
            await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const updates = {
            username,
            avatar,
            isPublic,
            updatedAt: Date.now()
        };
        
        let totalUpdated = 0;
        
        // ========================================
        // 1. UPDATE VOTES (batched)
        // ========================================
        const votesQuery = query(collection(db, 'votes'), where('userId', '==', userId));
        const votesSnapshot = await getDocs(votesQuery);
        
        if (votesSnapshot.size > 0) {
            // Firebase batch limit is 500 operations
            const BATCH_SIZE = 500;
            let batch = writeBatch(db);
            let batchCount = 0;
            
            for (const voteDoc of votesSnapshot.docs) {
                batch.update(voteDoc.ref, updates);
                batchCount++;
                totalUpdated++;
                
                // Commit batch if we hit the limit
                if (batchCount === BATCH_SIZE) {
                    await batch.commit();
                    batch = writeBatch(db);
                    batchCount = 0;
                }
            }
            
            // Commit remaining updates
            if (batchCount > 0) {
                await batch.commit();
            }
            
            console.log(`✅ Updated ${votesSnapshot.size} votes`);
        }
        
        // ========================================
        // 2. UPDATE ACTIVITY (batched)
        // ========================================
        const activityQuery = query(collection(db, 'activity'), where('userId', '==', userId));
        const activitySnapshot = await getDocs(activityQuery);
        
        if (activitySnapshot.size > 0) {
            const BATCH_SIZE = 500;
            let batch = writeBatch(db);
            let batchCount = 0;
            
            for (const activityDoc of activitySnapshot.docs) {
                batch.update(activityDoc.ref, updates);
                batchCount++;
                totalUpdated++;
                
                if (batchCount === BATCH_SIZE) {
                    await batch.commit();
                    batch = writeBatch(db);
                    batchCount = 0;
                }
            }
            
            if (batchCount > 0) {
                await batch.commit();
            }
            
            console.log(`✅ Updated ${activitySnapshot.size} activity records`);
        }
        
        console.log(`\n🎉 Profile backfill complete! Updated ${totalUpdated} total records`);
        
    } catch (error) {
        console.error('❌ Backfill error:', error);
        // Don't throw - profile save succeeded even if backfill fails
    }
}

// ========================================
// CACHE INVALIDATION HELPER
// ========================================

/**
 * Invalidate profile cache after editing
 */
function invalidateProfileCache(username) {
    if (!username) return;
    
    const cacheKey = `profile-${username}`;
    
    try {
        localStorage.removeItem(cacheKey);
        console.log(`🗑️ Invalidated cache for ${username}`);
    } catch (e) {
        console.warn('Could not invalidate cache:', e);
    }
}

// ========================================
// EXPORT AND GLOBAL ACCESS
// ========================================

export { closeSettingsModal };

// Make globally accessible
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;

console.log('✅ Settings modal module loaded');