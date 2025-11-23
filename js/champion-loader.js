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
// GET RANDOM MESSAGE FROM PACK (UPDATED)
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
    
    // ✅ NEW: Check if messages is an array of conditional objects
    if (Array.isArray(alert.messages) && alert.messages.length > 0 && typeof alert.messages[0] === 'object' && alert.messages[0].condition) {
        // Handle conditional messages (danger, nailbiter, winning, comeback)
        let selectedMessage = null;
        
        // Find first message that matches conditions
        for (const msgObj of alert.messages) {
            if (msgObj.condition === 'default') continue; // Skip default for now
            
            if (matchesCondition(msgObj.condition, data)) {
                selectedMessage = msgObj;
                break;
            }
        }
        
        // If no match, use default
        if (!selectedMessage) {
            selectedMessage = alert.messages.find(m => m.condition === 'default') || alert.messages[0];
        }
        
        return {
            message: replacePlaceholders(selectedMessage.message, data),
            detail: replacePlaceholders(selectedMessage.detail, data),
            cta: selectedMessage.cta,
            emoji: currentChampionPack.emoji
        };
    }
    
    // ✅ EXISTING: Handle random arrays (ally, rival, etc.)
    const message = getRandomItem(alert.messages);
    const detail = getRandomItem(alert.details);
    const button = getRandomItem(alert.buttons);
    
    return {
        message: replacePlaceholders(message, data),
        detail: replacePlaceholders(detail, data),
        cta: button,
        emoji: currentChampionPack.emoji
    };
}

// ========================================
// HELPER: CHECK IF CONTEXT MATCHES CONDITION
// ========================================

function matchesCondition(condition, context) {
    if (!condition || typeof condition !== 'object') return false;
    
    for (const [key, rule] of Object.entries(condition)) {
        const value = context[key];
        
        if (value === undefined) return false;
        
        // Handle comparison operators
        if (typeof rule === 'object') {
            if (rule.gte !== undefined && value < rule.gte) return false;
            if (rule.lte !== undefined && value > rule.lte) return false;
            if (rule.gt !== undefined && value <= rule.gt) return false;
            if (rule.lt !== undefined && value >= rule.lt) return false;
            if (rule.eq !== undefined && value !== rule.eq) return false;
        } else {
            // Direct equality check
            if (value !== rule) return false;
        }
    }
    
    return true;
}

// ========================================
// HELPER: GET RANDOM ITEM FROM ARRAY
// ========================================

function getRandomItem(array) {
    if (!array || !Array.isArray(array) || array.length === 0) return '';
    return array[Math.floor(Math.random() * array.length)];
}

// ========================================
// GET CHAMPION-VOICED ACHIEVEMENT MESSAGE
// ========================================

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
    const message = getRandomItem(achievement.messages);
    const detail = getRandomItem(achievement.details);
    const button = getRandomItem(achievement.buttons);
    
    return {
        message: replacePlaceholders(message, data),
        detail: replacePlaceholders(detail, data),
        cta: button,
        emoji: currentChampionPack.emoji
    };
}

// ========================================
// GET CUSTOM WELCOME MESSAGE
// ========================================

function getCustomMessage(messageType) {
    if (!currentChampionPack) {
        console.error('❌ No champion pack loaded!');
        return null;
    }
    
    // Check if pack has welcomeDialogs
    const welcomeDialogs = currentChampionPack.welcomeDialogs;
    
    if (!welcomeDialogs) {
        console.warn(`⚠️ No welcome dialogs in pack "${currentChampionPack.id}"`);
        return null;
    }
    
    // Get the specific dialog type
    const dialog = welcomeDialogs[messageType];
    
    if (!dialog) {
        console.warn(`⚠️ Welcome message type "${messageType}" not found in pack "${currentChampionPack.id}"`);
        return null;
    }
    
    // Pick random variations
    const message = getRandomItem(dialog.messages);
    const detail = getRandomItem(dialog.details);
    const cta = getRandomItem(dialog.buttons);
    
    return { message, detail, cta };
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
    if (data.opponentTitle) {
        result = result.replace(/\{opponentTitle\}/g, data.opponentTitle);
    }
    if (data.matchTitle) {
        result = result.replace(/\{matchTitle\}/g, data.matchTitle);
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
    
    // Round data
    if (data.round !== undefined) {
        result = result.replace(/\{round\}/g, data.round);
    }
    if (data.matchCount !== undefined) {
        result = result.replace(/\{matchCount\}/g, data.matchCount);
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
    try {
        const {
            songTitle,
            totalVotes,
            userPct,
            opponentPct,
            song1Pct,
            song2Pct,
            voteDiff
        } = data;
        
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
        await loadChampionPack(championId);
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

     // ✅ NEW: Set Jinx as default for new users
    if (!userChoice) {
        userChoice = 'jinx';
        localStorage.setItem('championPack', 'jinx');
        console.log('🎪 First visit - setting Jinx as default!');
    }
    
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
    getAchievementMessage,
    getCustomMessage,
    checkUniqueAlerts,
    getAvailableChampionPacks,
    setUserChampionPack,
    getUserChampionPack,
    initializeChampionPack,
    getCurrentPack: () => currentChampionPack,
    getManifest: loadChampionManifest
};

console.log('✅ Champion loader ready');