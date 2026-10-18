// ========================================
// SETTINGS MODAL - PROFILE MANAGEMENT
// ========================================

import { getUserXPFromStorage, getUserRank } from './rank-system.js';
import { readPackXp } from './xp-ledger.js';
import { ddragonUrl } from './arcane-config.js';
import { CHAMPIONS, championSearchText } from './champion-list.js';
import { buildChampionsView, avatarKeyOf, skinAvatar, yourChampionHtml, plainChampionHtml } from './champions-tab-model.js';
import { lookSkin, readLooks, saveLook } from './companion-look.js';
import { announcePendingChampion, markChampionSelected } from './champion-selected.js';
import { buildPreview } from './champion-preview.js';
import { fixAvatarUrl } from './avatar-url.js';
import { PACK_IDS } from './xp-ledger.js';
import { masteryLevel } from './champion-unlocks.js';
import { readNotificationPrefs } from './notification-prefs.js';
import { EMOTES_ENABLED } from './features.js';
import { db } from './firebase-config.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Champion list (same as username-system.js)


const CHAMPION_CDN = ddragonUrl('img/champion/');

let selectedChampion = null;
let hasChanges = false;
let previewIndex = 0;   // which sample alert the Preview button shows next
let packAtOpen = null;   // the champion they had when the window opened, to tell whether Save changes it
let pendingLooks = {};   // skins chosen in this visit, saved with the rest of the settings: { vi: 29 }
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

    pendingLooks = {};
    previewIndex = 0;
    packAtOpen = window.championLoader?.getCurrentPack?.()?.id || null;

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

                        <!-- Choose your champion: the champions that are finished (levels, skins and a voice). More are added as they are ready. -->
                        <div class="settings-section">
                            <h3><i class="fas fa-user-astronaut"></i> Choose Your Champion</h3>
                            <p class="section-description">
                                Your champion is your profile picture and cover art. They send your alerts, speak in their own voice
                                and earn your XP. More champions are coming.
                            </p>

                            <div class="avatar-grid few" id="avatarGrid">
                                <!-- Champions are inserted here -->
                            </div>
                        </div>

                        <!-- The selected champion, with the skins they have unlocked -->
                        <div class="settings-section">
                            <h3><i class="fas fa-star"></i> Your Champion</h3>
                            <div id="yourChampion"></div>
                        </div>

                        <!-- Bio Section -->
                        <div class="settings-section">
                            <h3><i class="fas fa-pen"></i> Bio</h3>
                            <p class="section-description">Tell others about yourself (optional)</p>

                            <div class="form-group">
                                <textarea
                                    id="bioInput"
                                    placeholder="Arcane fan, edit hunter, proud underdog supporter..."
                                    maxlength="200"
                                    rows="3"
                                    autocomplete="off"
                                ></textarea>
                                <div class="form-hint">
                                    <span id="bioCharCount">0</span>/200 characters
                                </div>
                            </div>
                        </div>


<!-- Social Media Links -->
<div class="setting-group">
    <label>
        <i class="fas fa-share-nodes"></i> Social Media
    </label>
    <small class="setting-hint">Add your social media profiles (optional)</small>

    <div class="social-inputs">
        <div class="social-input-row">
<i class="fab fa-twitter"></i>
            <input
                type="text"
                id="socialTwitter"
                class="setting-input"
                placeholder="@username"
                maxlength="50"
            >
        </div>

        <div class="social-input-row">
            <i class="fab fa-instagram"></i>
            <input
                type="text"
                id="socialInstagram"
                class="setting-input"
                placeholder="@username"
                maxlength="50"
            >
        </div>

        <div class="social-input-row">
            <i class="fab fa-twitch"></i>
            <input
                type="text"
                id="socialTwitch"
                class="setting-input"
                placeholder="username"
                maxlength="50"
            >
        </div>

        <div class="social-input-row">
            <i class="fab fa-youtube"></i>
            <input
                type="text"
                id="socialYoutube"
                class="setting-input"
                placeholder="@channelname"
                maxlength="50"
            >
        </div>

        <div class="social-input-row">
            <i class="fab fa-discord"></i>
            <input
                type="text"
                id="socialDiscord"
                class="setting-input"
                placeholder="username#0000"
                maxlength="50"
            >
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

        <!-- Show Online Status -->
        <label class="toggle-label">
            <input type="checkbox" id="showOnlineStatusToggle" class="toggle-input" />
            <span class="toggle-slider"></span>
            <div class="toggle-info">
                <strong>🟢 Show Online Status</strong>
                <p>Let others see when you're active</p>
            </div>
        </label>

        <!-- Emote Privacy (hidden while emotes are switched off, see js/features.js) -->
        <div class="toggle-label select-wrapper" ${EMOTES_ENABLED ? '' : 'style="display:none"'}>
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

<!-- Notification preferences (js/notification-prefs.js; saved on this browser) -->
<div class="settings-section">
    <h3><i class="fas fa-bell"></i> Notifications</h3>
    <p class="section-description">Choose which alerts you get (saved on this browser)</p>
    <div class="privacy-settings">
        <div class="toggle-label select-wrapper">
            <div class="toggle-info" style="flex: 1;">
                <strong>🗳️ Votes in my matches</strong>
                <p>Alerts when someone votes with you or against you in a match you voted in</p>
                <select id="notifyFromSelect" class="privacy-select">
                    <option value="everyone">From everyone</option>
                    <option value="following">Only people I follow</option>
                    <option value="nobody">Off</option>
                </select>
            </div>
        </div>
        <div class="toggle-label select-wrapper">
            <div class="toggle-info" style="flex: 1;">
                <strong>💬 Pop-up alerts</strong>
                <p>Which of those also pop up while you're on the site (the rest wait in your bell)</p>
                <select id="toastFromSelect" class="privacy-select">
                    <option value="everyone">From everyone</option>
                    <option value="following">Only people I follow</option>
                    <option value="off">Off</option>
                </select>
            </div>
        </div>
        <label class="toggle-label">
            <input type="checkbox" id="matchAlertsToggle" class="toggle-input" checked />
            <span class="toggle-slider"></span>
            <div class="toggle-info">
                <strong>🎯 Match alerts</strong>
                <p>"You're behind", nail-biter and comeback alerts for matches you voted in</p>
            </div>
        </label>
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

    // ✅ NEW: Load social links
const socialLinksJson = localStorage.getItem('socialLinks');
if (socialLinksJson) {
    try {
        const socialLinks = JSON.parse(socialLinksJson);

        if (socialLinks.twitter) document.getElementById('socialTwitter').value = socialLinks.twitter;
        if (socialLinks.instagram) document.getElementById('socialInstagram').value = socialLinks.instagram;
        if (socialLinks.twitch) document.getElementById('socialTwitch').value = socialLinks.twitch;
        if (socialLinks.youtube) document.getElementById('socialYoutube').value = socialLinks.youtube;
        if (socialLinks.discord) document.getElementById('socialDiscord').value = socialLinks.discord;

        console.log('✅ Social links loaded');
    } catch (e) {
        console.warn('Could not load social links:', e);
    }
}

  // ✅ Set all privacy toggles
document.getElementById('publicToggle').checked = isPublic;
document.getElementById('showOnlineStatusToggle').checked = showOnlineStatus;
document.getElementById('emotePrivacySelect').value = emotePrivacy;
    {   // notification preferences
        const np = readNotificationPrefs();
        document.getElementById('notifyFromSelect').value = np.notifyFrom;
        document.getElementById('toastFromSelect').value = np.toastFrom;
        document.getElementById('matchAlertsToggle').checked = np.matchAlerts;
    }

    // Show selected avatar if exists
    if (avatar && avatar.type === 'url') {
        selectedChampion = {
            name: avatar.name || 'Unknown',
            displayName: avatar.name || 'Champion',
            url: avatar.value
        };
        markSelectedInGrid();
    }

    renderYourChampion();

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
        previewAvatar.innerHTML = `<img src="${fixAvatarUrl(avatar.value)}" alt="Avatar" class="preview-avatar-img" />`;
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

    // Only the champions that are finished (they have levels, skins and a voice): PACK_IDS, the same list the XP and unlock
    // tables use. Adding a champion there adds them here.
    const finished = PACK_IDS.map(id => CHAMPIONS.find(c => c.toLowerCase() === id)).filter(Boolean);
    const html = finished.map(champion => {
        const displayName = champion.replace(/([A-Z])/g, ' $1').trim();
        return `
            <div class="champion-avatar-option" data-champion="${champion}" data-search="${championSearchText(champion)}" title="${displayName}" role="button" tabindex="0">
                <img src="${CHAMPION_CDN}${champion}.png" alt="${displayName}" loading="lazy" />
                <span class="cao-name">${displayName}</span>
            </div>
        `;
    }).join('');

    grid.innerHTML = html;
    markSelectedInGrid();
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
        avatarGrid.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.champion-avatar-option')) { e.preventDefault(); e.target.closest('.champion-avatar-option').click(); } };
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
        'showOnlineStatusToggle',
        'emotePrivacySelect',
        'notifyFromSelect',
        'toastFromSelect',
        'matchAlertsToggle'
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
    markSelectedInGrid();

    // Jinx, Vi and Caitlyn have levels: they become your champion (and wear your chosen skin). Anyone else is just your picture.
    const packId = champion.toLowerCase();
    if (PACK_IDS.includes(packId)) selectChampionPack(packId);
    else renderYourChampion();
}

// Highlights the chosen champion in the grid.
function markSelectedInGrid() {
    const chosen = String(selectedChampion?.name || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    document.querySelectorAll('.champion-avatar-option').forEach(opt => opt.classList.toggle('selected', !!chosen && opt.dataset.champion.toLowerCase() === chosen));
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
        showOnlineStatus: document.getElementById('showOnlineStatusToggle')?.checked ?? true,
        emotePrivacy: document.getElementById('emotePrivacySelect')?.value ?? 'everyone'
    };

    // ✅ NEW: Get social media links
const socialLinks = {
    twitter: document.getElementById('socialTwitter')?.value.trim() || '',
    instagram: document.getElementById('socialInstagram')?.value.trim() || '',
    twitch: document.getElementById('socialTwitch')?.value.trim() || '',
    youtube: document.getElementById('socialYoutube')?.value.trim() || '',
    discord: document.getElementById('socialDiscord')?.value.trim() || ''
};

// Clean up handles (remove @ if user added it)
if (socialLinks.twitter) socialLinks.twitter = socialLinks.twitter.replace(/^@/, '');
if (socialLinks.instagram) socialLinks.instagram = socialLinks.instagram.replace(/^@/, '');
if (socialLinks.youtube) socialLinks.youtube = socialLinks.youtube.replace(/^@/, '');


    // The cover follows your champion (and the skin they wear); there is no separate banner choice any more
    const banner = { type: 'auto' };

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

        // a different champion than when the window opened is announced once the save has gone through (see below)
        const chosenPack = selectedPackId();
        const announce = chosenPack && chosenPack !== packAtOpen ? { packId: chosenPack, skinNum: currentSkinNum(chosenPack) } : null;
        Object.entries(pendingLooks).forEach(([packId, num]) => saveLook(packId, num));
        pendingLooks = {};

        // Save to localStorage (backward compatible)
        localStorage.setItem('username', username);
        localStorage.setItem('avatar', JSON.stringify(avatar));
        localStorage.setItem('bio', bio);
        localStorage.setItem('banner', JSON.stringify(banner)); // ✅ NEW: Save banner
        // ✅ NEW: Save social links to localStorage
localStorage.setItem('socialLinks', JSON.stringify(socialLinks));

        // Notification preferences: this browser only (not part of the public profile document)
        try {
            localStorage.setItem('notifyFrom', document.getElementById('notifyFromSelect')?.value ?? 'everyone');
            localStorage.setItem('toastFrom', document.getElementById('toastFromSelect')?.value ?? 'everyone');
            localStorage.setItem('matchAlerts', document.getElementById('matchAlertsToggle')?.checked === false ? 'false' : 'true');
        } catch (e) { console.warn('Could not save notification preferences', e); }

        // Save all privacy settings
        Object.keys(privacySettings).forEach(key => {
            const value = privacySettings[key];
            if (typeof value === 'boolean') {
                localStorage.setItem(key, value ? 'true' : 'false');
            } else {
                localStorage.setItem(key, value);
            }
        });

     // Around line 753 in handleSaveSettings()
// Save to Firebase profiles collection
const userId = localStorage.getItem('tournamentUserId');
if (userId) {
   const companionId =
    window.championLoader?.getUserCompanionPack?.() ||
    window.championLoader?.getCurrentPack?.()?.id ||
    'jinx';

await setDoc(doc(db, 'profiles', userId), {
    username: username,
    avatar: avatar,

    // New canonical field
    companionId: companionId,

    // Temporary compatibility field for legacy modules
    championPackId: companionId,
    // true only when they picked a companion themselves; otherwise they follow the cup's champion
    companionChosen: !!window.championLoader?.hasChosenCompanion?.(),
    banner: banner,
    companionSkins: readLooks(),
    bio: bio,
    socialLinks: socialLinks,
    privacy: privacySettings,
    updatedAt: Date.now()
}, { merge: true });

console.log('✅ Profile saved to Firebase with Arcane companion:', companionId);


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

// ✅ Invalidate profile cache
if (window.invalidateProfileCache) {
    window.invalidateProfileCache(username);
    console.log('🗑️ Profile cache invalidated');
}

// Update navigation
if (window.updateNavProfile) {
    window.updateNavProfile();
}
window.dispatchEvent(new CustomEvent('profile-settings-saved'));   // pages with their own profile card (the feed) redraw it

// Show success state
if (saveBtn) {
    saveBtn.innerHTML = '✅ Saved!';
    saveBtn.style.background = '#4caf50';
}

// Show success notification
showNotification('✅ Profile updated successfully!', 'success');

// Close modal after short delay
if (announce) markChampionSelected(announce.packId, announce.skinNum);
setTimeout(() => {
    closeSettingsModal();
    if (saveBtn) {
        saveBtn.innerHTML = originalBtnText;
        saveBtn.style.background = '';
        saveBtn.disabled = false;
    }

    // ✅ Hard reload if on profile page (force fresh data)
    if (window.location.pathname.includes('profile')) {
        console.log('🔄 Reloading profile page with fresh data...');
        window.location.reload(true);
    } else if (announce) {
        announcePendingChampion();   // no reload on this page: show the card now
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
// YOUR CHAMPION (the selected champion and the skins they have unlocked)
// ========================================

// Which pack (jinx / vi / caitlyn) the selected champion is, or null for a plain picture.
function selectedPackId() {
    const id = String(selectedChampion?.name || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    return PACK_IDS.includes(id) ? id : null;
}

function currentSkinNum(packId) {
    return pendingLooks[packId] ?? lookSkin({ id: packId }, localStorage);
}

function renderYourChampion() {
    const host = document.getElementById('yourChampion');
    if (!host) return;
    if (!host.dataset.bound) {
        host.dataset.bound = '1';
        host.addEventListener('click', e => {
            const skinBtn = e.target.closest('.yc-skin');
            const packId = selectedPackId();
            if (skinBtn && packId) {
                const num = Number(skinBtn.dataset.skin);
                pendingLooks[packId] = num;
                const art = skinAvatar(packId, num);
                selectedChampion = { name: art.name, displayName: selectedChampion?.displayName || art.name, url: art.value };
                hasChanges = true;
                renderYourChampion();
            } else if (e.target.closest('[data-action="preview"]') && packId) {
                previewChampion(packId, e.target.closest('[data-action="preview"]'));
            }
        });
    }
    if (!selectedChampion) { host.innerHTML = '<p class="section-description">Pick a champion above.</p>'; return; }
    const packId = selectedPackId();
    if (!packId) {
        const xpFor = window.championLoader?.getCurrentPack?.()?.name || 'your last champion';
        host.innerHTML = plainChampionHtml({ name: selectedChampion.displayName || selectedChampion.name, url: selectedChampion.url, xpFor });
        return;
    }
    let achievements = [];
    try { achievements = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]'); } catch { /* none */ }
    const view = buildChampionsView({
        packXp: readPackXp(), achievements, activePack: packId,
        avatarKey: avatarKeyOf({ type: 'url', value: skinAvatar(packId, currentSkinNum(packId)).value }),
        looks: { ...readLooks(), ...pendingLooks }
    });
    host.innerHTML = yourChampionHtml(view.rows.find(r => r.packId === packId));
}

// Picks Jinx, Vi or Caitlyn: the companion pack (voice, XP) and the picture both follow.
async function selectChampionPack(packId) {
    console.log(`🎭 User selected: ${packId}`);
    await window.championLoader.setUserCompanionPack(packId);

    // ✅ Update Firebase profile with championPackId
    const userId = localStorage.getItem('tournamentUserId') || localStorage.getItem('userId');
    if (userId) {
        try {
            const { db } = await import('./firebase-config.js');
            const { doc, updateDoc } = await import(
                'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
            );

            await updateDoc(doc(db, 'profiles', userId), {
                championPackId: packId,
                updatedAt: Date.now()
            });

            console.log(`✅ Updated Firebase profile with championPackId: ${packId}`);
        } catch (error) {
            console.warn('⚠️ Could not update Firebase profile:', error);
        }
    }

    const pack = await window.championLoader.loadChampionPack(packId);

    // Your champion is also your picture: wear the skin chosen for them (saved with the rest of the settings)
    const skin = skinAvatar(packId, currentSkinNum(packId));
    selectedChampion = { name: skin.name, displayName: pack.name, url: skin.value };
    markSelectedInGrid();
    renderYourChampion();
    hasChanges = true;

    console.log(`✅ Arcane companion set to: ${packId}`);
}

// Each press shows the next sample alert in the champion's voice (nail-biter, winning, comeback, welcome, achievement, level up,
// mastery up). The button only closes a card, so a preview never opens another page.
function previewChampion(packId, button) {
    const loader = window.championLoader;
    if (!window.showBulletin || !loader) { showNotification('Alerts are not available on this page', 'info'); return; }
    const voice = {
        alert: (type, data) => loader.getChampionMessage?.(type, data),
        achievement: (id, data) => loader.getAchievementMessage?.(id, data),
        custom: type => loader.getCustomMessage?.(type)
    };
    const { bulletin, number, total } = buildPreview(previewIndex, { voice, packId, dismiss: () => window.dismissBulletin?.() });
    window.showBulletin(bulletin);
    previewIndex = (previewIndex + 1) % total;
    const next = buildPreview(previewIndex, { voice, packId, dismiss: () => {} });
    if (button) button.innerHTML = `<i class="fas fa-play"></i> Next alert: ${next.step.label} (${next.number}/${total})`;
}

// Make functions global so onclick can access them
window.selectChampionPack = selectChampionPack;
// ========================================
// EXPORT AND GLOBAL ACCESS
// ========================================

export { closeSettingsModal };

// Make globally accessible
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;

console.log('✅ Settings modal module loaded');