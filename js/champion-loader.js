console.log('🎭 champion-loader.js loaded');

// ========================================
// CHAMPION PACK LOADER
// ========================================

let currentChampionPack = null;
let championManifest = null;

// Cache loaded packs to avoid re-fetching
const packCache = new Map();

// ========================================
// LOAD CHAMPION MANIFEST
// ========================================

async function loadChampionManifest() {
    if (championManifest) return championManifest;
    
    try {
const response = await fetch('../champion-packs/champion-manifest.json');
        if (!response.ok) throw new Error('Manifest not found');
        
        championManifest = await response.json();
        console.log(`✅ Loaded champion manifest: ${championManifest.packs.length} packs available`);
        return championManifest;
        
    } catch (error) {
        console.error('❌ Failed to load champion manifest:', error);
        // Return default-only manifest
        return {
            version: '1.0.0',
            packs: [
                {
                    id: 'default',
                    name: 'Standard',
                    displayName: 'Standard Notifications',
                    emoji: '📢',
                    description: 'Professional, straightforward notifications'
                }
            ]
        };
    }
}

// ========================================
// LOAD CHAMPION PACK
// ========================================

async function loadChampionPack(championId = 'default') {
    // Check cache first
    if (packCache.has(championId)) {
        currentChampionPack = packCache.get(championId);
        console.log(`✅ Loaded ${currentChampionPack.name} from cache`);
        return currentChampionPack;
    }
    
    try {
        console.log(`📦 Loading champion pack: ${championId}`);
        
const response = await fetch(`../champion-packs/${championId}.json`);
        
        if (!response.ok) {
            throw new Error(`Pack not found: ${championId}`);
        }
        
        const pack = await response.json();
        
        // Validate pack structure
        if (!pack.id || !pack.alerts) {
            throw new Error('Invalid pack structure');
        }
        
        // Cache it
        packCache.set(championId, pack);
        currentChampionPack = pack;
        
        console.log(`✅ Loaded ${pack.name} pack (${pack.displayName})`);
        console.log(`   Alert types: ${Object.keys(pack.alerts).length}`);
        console.log(`   Unique alerts: ${pack.uniqueAlerts ? Object.keys(pack.uniqueAlerts).length : 0}`);
        
        return pack;
        
    } catch (error) {
        console.error(`❌ Failed to load champion pack "${championId}":`, error);
        
        // Fallback to default if not already trying default
        if (championId !== 'default') {
            console.log('🔄 Falling back to default pack');
            return loadChampionPack('default');
        }
        
        // If default also fails, return minimal pack
        return createEmergencyPack();
    }
}



// ========================================
// EMERGENCY FALLBACK PACK
// ========================================

function createEmergencyPack() {
    console.warn('⚠️ Using emergency fallback pack');
    return {
        id: 'emergency',
        name: 'Emergency',
        displayName: 'Standard',
        emoji: '📢',
        alerts: {
            danger: {
                messages: ['🚨 Your pick "{songTitle}" is in danger!'],
                details: ['Behind by {voteDiff} votes ({userPct}% vs {opponentPct}%)'],
                buttons: ['View Match']
            },
            nailbiter: {
                messages: ['🔥 "{songTitle}" is too close!'],
                details: ['Separated by just {voteDiff} vote{voteDiffPlural}!'],
                buttons: ['View Match']
            },
            winning: {
                messages: ['🎯 Your pick "{songTitle}" is dominating!'],
                details: ['Leading {userPct}% to {opponentPct}%'],
                buttons: ['View Match']
            },
            comeback: {
                messages: ['🎉 "{songTitle}" completed comeback!'],
                details: ['Now leading {userPct}% to {opponentPct}%!'],
                buttons: ['View Match']
            },
            ally: {
                messages: ['🤝 {username} also voted for "{songTitle}"!'],
                details: ['Standing with you'],
                buttons: ['Send Thanks!']
            },
            rival: {
                messages: ['⚔️ {username} voted against you!'],
                details: ['The battle continues'],
                buttons: ['View Match']
            }
        }
    };
}

// ========================================
// GET RANDOM MESSAGE FROM PACK
// ========================================

function getChampionMessage(alertType, data) {
    if (!currentChampionPack) {
        console.error('❌ No champion pack loaded!');
        return null;
    }
    
    const alert = currentChampionPack.alerts[alertType];
    
    if (!alert) {
        console.warn(`⚠️ Alert type "${alertType}" not found in pack "${currentChampionPack.id}"`);
        return null;
    }
    
    // Pick random message, detail, and button
    const message = alert.messages[Math.floor(Math.random() * alert.messages.length)];
    const detail = alert.details[Math.floor(Math.random() * alert.details.length)];
    const button = alert.buttons[Math.floor(Math.random() * alert.buttons.length)];
    
    // Replace placeholders
    return {
        message: replacePlaceholders(message, data),
        detail: replacePlaceholders(detail, data),
        cta: button,
        emoji: currentChampionPack.emoji
    };
}


/**
 * Get champion-voiced achievement message
 */
function getAchievementMessage(achievementId, data) {
    if (!currentChampionPack) {
        console.error('❌ No champion pack loaded!');
        return null;
    }
    
    const achievements = currentChampionPack.achievements;
    
    if (!achievements) {
        console.warn(`⚠️ No achievements in pack "${currentChampionPack.id}"`);
        return null;
    }
    
    // Try specific achievement first, then fall back to default
    const achievement = achievements[achievementId] || achievements['default'];
    
    if (!achievement) {
        console.warn(`⚠️ Achievement "${achievementId}" not found in pack`);
        return null;
    }
    
    // Pick random variations
    const message = achievement.messages[Math.floor(Math.random() * achievement.messages.length)];
    const detail = achievement.details[Math.floor(Math.random() * achievement.details.length)];
    const button = achievement.buttons[Math.floor(Math.random() * achievement.buttons.length)];
    
    // Replace placeholders
    return {
        message: replacePlaceholders(message, data),
        detail: replacePlaceholders(detail, data),
        cta: button,
        emoji: currentChampionPack.emoji
    };
}
// ========================================
// REPLACE PLACEHOLDERS
// ========================================

function replacePlaceholders(text, data) {
    if (!text || !data) return text;
    
    let result = text;
    
    // Song titles
    if (data.songTitle) {
        result = result.replace(/\{songTitle\}/g, data.songTitle);
    }
    if (data.song) {
        result = result.replace(/\{song\}/g, data.song);
    }
    if (data.song1) {
        result = result.replace(/\{song1\}/g, data.song1);
    }
    if (data.song2) {
        result = result.replace(/\{song2\}/g, data.song2);
    }
    if (data.yourSong) {
        result = result.replace(/\{yourSong\}/g, data.yourSong);
    }
    if (data.theirSong) {
        result = result.replace(/\{theirSong\}/g, data.theirSong);
    }
    
    // Vote data
    if (data.voteDiff !== undefined) {
        result = result.replace(/\{voteDiff\}/g, data.voteDiff);
        // Handle plural
        result = result.replace(/\{voteDiffPlural\}/g, data.voteDiff === 1 ? '' : 's');
    }
    if (data.userPct !== undefined) {
        result = result.replace(/\{userPct\}/g, data.userPct);
    }
    if (data.opponentPct !== undefined) {
        result = result.replace(/\{opponentPct\}/g, data.opponentPct);
    }
    if (data.totalVotes !== undefined) {
        result = result.replace(/\{totalVotes\}/g, data.totalVotes);
        result = result.replace(/\{votesPlural\}/g, data.totalVotes === 1 ? '' : 's');
    }
    
    // User data
    if (data.username) {
        result = result.replace(/\{username\}/g, data.username);
    }
    if (data.streakCount !== undefined) {
        result = result.replace(/\{streakCount\}/g, data.streakCount);
    }
    
    // Time data
    if (data.hoursLeft !== undefined) {
        result = result.replace(/\{hoursLeft\}/g, data.hoursLeft);
    }
    if (data.liveCount !== undefined) {
        result = result.replace(/\{liveCount\}/g, data.liveCount);
    }
    
    return result;
}

// ========================================
// CHECK UNIQUE ALERTS
// ========================================

function checkUniqueAlerts(data) {
    if (!currentChampionPack || !currentChampionPack.uniqueAlerts) {
        return null;
    }
    
    const uniqueAlerts = currentChampionPack.uniqueAlerts;
    
    for (const [key, alert] of Object.entries(uniqueAlerts)) {
        // Check cooldown
        const cooldownKey = `unique-${currentChampionPack.id}-${key}`;
        const lastShown = parseInt(localStorage.getItem(cooldownKey) || '0');
        const cooldownMs = (alert.cooldown || 60) * 60000; // Default 60 min
        
        if (Date.now() - lastShown < cooldownMs) {
            continue; // Still on cooldown
        }
        
        // Evaluate trigger condition
        try {
            // Create safe evaluation context
            const condition = alert.triggerCondition;
            const shouldTrigger = evaluateCondition(condition, data);
            
            if (shouldTrigger) {
                // Mark cooldown
                localStorage.setItem(cooldownKey, Date.now().toString());
                
                console.log(`✨ Unique alert triggered: ${key} (${currentChampionPack.name})`);
                
                return {
                    priority: alert.priority,
                    type: alert.type,
                    message: replacePlaceholders(alert.message, data),
                    detail: replacePlaceholders(alert.detail, data),
                    cta: alert.cta,
                    emoji: currentChampionPack.emoji,
                    matchId: data.matchId
                };
            }
        } catch (error) {
            console.error(`Error evaluating unique alert "${key}":`, error);
        }
    }
    
    return null;
}

// ========================================
// SAFELY EVALUATE CONDITION
// ========================================

function evaluateCondition(condition, data) {
    // Simple string-based evaluation for safety
    // Supports basic comparisons
    
    try {
        // Extract variables from data
        const {
            songTitle,
            totalVotes,
            userPct,
            opponentPct,
            song1Pct,
            song2Pct,
            voteDiff
        } = data;
        
        // Use Function constructor for safer eval
        const func = new Function(
            'songTitle', 'totalVotes', 'userPct', 'opponentPct', 
            'song1Pct', 'song2Pct', 'voteDiff', 'Math',
            `return ${condition}`
        );
        
        return func(
            songTitle, totalVotes, userPct, opponentPct,
            song1Pct, song2Pct, voteDiff, Math
        );
        
    } catch (error) {
        console.error('Condition evaluation error:', error);
        return false;
    }
}

// ========================================
// GET AVAILABLE CHAMPION PACKS
// ========================================

async function getAvailableChampionPacks() {
    const manifest = await loadChampionManifest();
    return manifest.packs;
}

// ========================================
// SET USER'S CHAMPION PREFERENCE
// ========================================

async function setUserChampionPack(championId) {
    try {
        // Load the pack
        await loadChampionPack(championId);
        
        // Save to localStorage
        localStorage.setItem('championPack', championId);
        
        console.log(`✅ User champion pack set to: ${championId}`);
        
        return true;
    } catch (error) {
        console.error('Failed to set champion pack:', error);
        return false;
    }
}

// ========================================
// GET USER'S CHAMPION PREFERENCE
// ========================================

function getUserChampionPack() {
    return localStorage.getItem('championPack') || 'default';
}

// ========================================
// INITIALIZE ON PAGE LOAD
// ========================================

async function initializeChampionPack() {
    const userChoice = getUserChampionPack();
    console.log(`🎭 Initializing champion pack: ${userChoice}`);
    
    await loadChampionPack(userChoice);
    
    return currentChampionPack;
}


// ========================================
// EXPORT FUNCTIONS
// ========================================

window.championLoader = {
    loadChampionPack,
    getChampionMessage,
        getAchievementMessage,  // ✅ ADD THIS

    checkUniqueAlerts,
    getAvailableChampionPacks,
    setUserChampionPack,
    getUserChampionPack,
    initializeChampionPack,
    getCurrentPack: () => currentChampionPack,
    getManifest: loadChampionManifest  // ✅ Use existing function
};

console.log('✅ Champion loader ready');