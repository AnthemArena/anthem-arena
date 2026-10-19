    // ========================================
    // VOTE PAGE FUNCTIONALITY - LEAGUE MUSIC TOURNAMENT
    // ========================================
// ========================================
// IMPORTS
// ========================================

// API Client (uses Netlify Edge cache for reads)
import { getMatch, getAllMatches } from './api-client.js';

// Firebase
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, writeBatch, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Features & Systems
import { getAllTournamentStats } from './music-gallery.js';
import { calculateVoteXP, addXP, getUserRank } from './rank-system.js';
import { updateNavProfile  } from './navigation.js';
import { ensureUsername } from './username-system.js';
import { ensureOwnProfile, waitForAuthUid } from './profile-bootstrap.js';
import { auth } from './firebase-config.js';
// ✅ Import global notification system for achievement/level-up toasts
import './global-notifications.js';
import { createMatchCard } from './match-card-renderer.js';
import { unvotedLiveMatches, nextMatchBarHtml } from './next-match.js';
import { cleanTitle, shortTitle } from './title-clean.js';
import { votingState, closedButton } from './vote-closed.js';
import { renderChampionBubble, loadChampionPack, shortName } from './champion-bubble.js';
import { buildMatchShare, shareKind } from './match-share.js';
import { mountShareBox } from './share-box.js';
import { pickModalKey, chooseModalLine, buildPostVoteModalHtml, buildShareModalHtml, TAG_FOR_KEY } from './champion-modal.js';
import { getChampionImageUrl, getCupChampionId, getCompanionPack, getChampionTileUrl, getChampionSplashUrl } from './arcane-config.js';
import { lookSkin } from './companion-look.js';
import { activePackId, streakFromVotes, readPackXp } from './xp-ledger.js';
import { beginVoteProgress, endVoteProgress, buildProgressSummary } from './vote-progress.js';
import { voteFacts, achievementVote, utcDay } from './vote-facts.js';
import { checkAchievements } from './achievement-tracker.js';
import { awardFoundingMemberBadge, initFoundingMemberTracking, backfillFoundingMemberXP  } from './founding-member-tracker.js';


// Default avatars: Arcane characters, by Data Dragon id (ids with spaces like 'Lee Sin' 404 there).
const CHAMPIONS = ['Jinx', 'Vi', 'Caitlyn', 'Ekko', 'Jayce', 'Viktor', 'Heimerdinger'];

// ========================================
// 🆕 PAGE-LEVEL MATCHES CACHE
// Prevents fetching all matches multiple times per page load
// ========================================

let pageLoadMatchesCache = null;

async function getMatchesForThisPageLoad() {
    if (!pageLoadMatchesCache) {
        console.log('📥 Fetching all matches (first time this page load)');
        pageLoadMatchesCache = await getAllMatches();
    } else {
        console.log('📦 Reusing matches from earlier in page load (saved ~64 reads)');
    }
    return pageLoadMatchesCache;
}

// ========================================
// GET GUARANTEED USER PROFILE (Fast + Reliable + Offline-safe)
// ========================================
// FINAL: 100% BULLETPROOF getGuaranteedProfile()
// ========================================
async function getGuaranteedProfile() {
    // 1. Fast path — localStorage (instant + offline)
    const cachedUsername = localStorage.getItem('username');
    const cachedIsPublic = localStorage.getItem('isPublic');
    const cachedAvatar = localStorage.getItem('avatar');

    if (cachedUsername &&
        cachedUsername !== 'null' &&
        cachedUsername !== 'Anonymous' &&
        cachedIsPublic !== null) {

        return {
            username: cachedUsername,
            isPublic: cachedIsPublic === 'true',
            avatar: cachedAvatar && cachedAvatar !== 'null' ? JSON.parse(cachedAvatar) : null
        };
    }

    // 1b. No usable name yet: create/restore the profile for the signed-in uid (what the security rules allow)
    const restored = await ensureOwnProfile();
    if (restored) {
        return {
            username: localStorage.getItem('username') || restored.username,
            isPublic: localStorage.getItem('isPublic') !== 'false',
            avatar: (() => { try { return JSON.parse(localStorage.getItem('avatar') || 'null'); } catch { return null; } })()
        };
    }

    // 2. Get userId (critical — support both your keys)
    const userId = localStorage.getItem('userId') ||
                   localStorage.getItem('tournamentUserId') ||
                   auth.currentUser?.uid;

    if (!userId) {
        return { username: 'Anonymous', isPublic: false, avatar: null };
    }

    // 3. Try Firestore
    try {
        const profileRef = doc(db, 'profiles', userId);
        const snap = await getDoc(profileRef);

        if (snap.exists()) {
            const data = snap.data();
            const username = data.username || 'Anonymous';
            const isPublic = data.privacy?.isPublic !== false; // default true
            const avatar = data.avatar || null;

            // Sync to localStorage so next call is instant
            localStorage.setItem('username', username);
            localStorage.setItem('isPublic', String(isPublic));
            localStorage.setItem('avatar', JSON.stringify(avatar));

            return { username, isPublic, avatar };
        }
    } catch (err) {
        console.warn('Firestore unavailable or failed:', err);
        // Keep going — we can still create a profile locally
    }

    // 4. Final fallback: create the profile (this also syncs localStorage internally)
    try {
        await createAutoGeneratedProfile(userId);
    } catch (err) {
        console.error('Failed to create auto-profile:', err);
        // Absolute worst case — use Anonymous but still allow voting
        localStorage.setItem('username', 'Anonymous');
        localStorage.setItem('isPublic', 'false');
        localStorage.setItem('avatar', JSON.stringify(null));
    }

    // Always return something valid
    return {
        username: localStorage.getItem('username') || 'Anonymous',
        isPublic: localStorage.getItem('isPublic') === 'true',
        avatar: JSON.parse(localStorage.getItem('avatar') || 'null')
    };
}
// ========================================
// COUNTDOWN TIMER HELPER
// ========================================

function getTimeRemaining(endDate) {
    if (!endDate) return null;

    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;

    if (diff <= 0) {
        return {
            text: '<i class="fa-solid fa-stopwatch"></i> Voting Closed', // ✅ Changed
            color: '#999',
            urgent: false,
            expired: true
        };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    // Critical (< 1 hour)
    if (days === 0 && hours === 0) {
        return {
            text: `<i class="fa-solid fa-triangle-exclamation"></i> ${minutes}m left to vote!`, // ✅ Changed
            color: '#ff4444',
            urgent: true,
            expired: false
        };
    }

    // Urgent (< 6 hours)
    if (days === 0 && hours < 6) {
        return {
            text: `<i class="fa-solid fa-fire"></i> ${hours}h ${minutes}m left`, // ✅ Changed
            color: '#ff4444',
            urgent: true,
            expired: false
        };
    }

    // Moderate (< 24 hours)
    if (days === 0) {
        return {
            text: `<i class="fa-solid fa-clock"></i> ${hours}h ${minutes}m left`, // ✅ Changed
            color: '#ffaa00',
            urgent: false,
            expired: false
        };
    }

    // Calm (1+ days)
    return {
        text: `<i class="fa-solid fa-clock"></i> ${days}d ${hours}h left`, // ✅ Changed
        color: '#667eea',
        urgent: false,
        expired: false
    };
}


    // ✅ ADD THIS LINE:
import { ARCANE_CONFIG } from './arcane-config.js';

// Titles come from YouTube, so never splice them into HTML or inline handlers unescaped.
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ACTIVE_TOURNAMENT = ARCANE_CONFIG.tournamentId;

    // Current match data
    let currentMatch = null;
    let hasVoted = false;
    let userId = null; // ⭐ NEW: Store user ID globally
    // ========================================
    // PAGE INITIALIZATION
    // ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎵 Vote page loaded');

    // ⭐ Get user ID first
    userId = await getUserId();
    console.log('👤 User ID:', userId);

    // ✅ CRITICAL: Pre-warm profile cache
    console.log('🔄 Pre-warming profile cache...');
    try {
        await getGuaranteedProfile();
        console.log('✅ Profile pre-warmed and ready');
    } catch (error) {
        console.error('⚠️ Failed to pre-warm profile:', error);
    }

    // ✅ Sync username on page load
    syncUsernameOnLoad();



    // ✅ ADD THIS: Initialize founding member tracking
    await initFoundingMemberTracking();
      // ✅ One-time XP backfill for existing badge holders
  await backfillFoundingMemberXP();

    // Get match ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('id') || urlParams.get('match');
        if (!matchId) {
            showNotification('No match specified', 'error');
            console.error('❌ No match ID in URL');
            return;
        }

        console.log('📍 Loading match:', matchId);

        // Load match data
        loadMatchData(matchId);
    });

   // ========================================
// FINAL: ROBUST USER IDENTIFICATION + PROFILE GUARANTEE
// ========================================
async function getUserId() {
    // 1. Fast path: return stored ID if we have it
    const stored = localStorage.getItem('tournamentUserId') || localStorage.getItem('userId');
    if (stored) {
        console.log('🆔 Using stored user ID:', stored);
        localStorage.setItem('userId', stored); // unify keys

        // CRITICAL: Pre-warm the profile RIGHT NOW, and await it
        // This runs for EVERY returning user, every page load
        await getGuaranteedProfile();   // ← This is the magic line

        return stored;
    }

    // 2. First-time visitor: the Firebase sign-in id is the only one the security rules let us write a profile for
    console.log('🆔 Waiting for anonymous sign-in...');
    const authUid = await waitForAuthUid(auth);
    if (authUid) {
        localStorage.setItem('userId', authUid);
        localStorage.setItem('tournamentUserId', authUid);
        await ensureOwnProfile();
        console.log('Generated new user ID + profile:', authUid);
        return authUid;
    }

    // Sign-in never finished (offline / blocked): fall back to the old made-up id so voting still works
    let ipAddress = 'unknown';
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ipAddress = data.ip;
    } catch (error) {
        console.warn('Could not get IP address:', error);
    }

    const fingerprint = generateBrowserFingerprint();
    const combined = `${ipAddress}_${fingerprint}_salt2025`;
    const userId = btoa(combined).substring(0, 32);

    localStorage.setItem('userId', userId);
    localStorage.setItem('tournamentUserId', userId);

    await createAutoGeneratedProfile(userId);

    console.log('Generated new user ID + profile:', userId);
    return userId;
}

    /**
     * Generate a browser fingerprint from device characteristics
     */
    function generateBrowserFingerprint() {
        const components = [
            navigator.userAgent,
            navigator.language,
            navigator.platform,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            !!window.sessionStorage,
            !!window.localStorage,
            navigator.hardwareConcurrency || 0
        ].join('|');

        // Simple hash
        return btoa(components).substring(0, 16);
    }

 function getCompetitorData(competitor) {
    if (!competitor) {
        return {
            stats: {
                championships: 0,
                finals: 0,
                semifinals: 0,
                quarterfinals: 0
            },
            liveStats: {
                wins: 0,
                losses: 0,
                winRecord: '0-0',
                winRate: '0%',
                totalMatches: 0
            }
        };
    }

    return {
        id: competitor.id,
        shortTitle: competitor.name,
        title: competitor.name,
        videoId: competitor.videoId,
        artist: 'Arcane',
        year: 2021,

        stats: {
            championships: 0,
            finals: 0,
            semifinals: 0,
            quarterfinals: 0
        },

        liveStats: {
            wins: 0,
            losses: 0,
            winRecord: '0-0',
            winRate: '0%',
            totalMatches: 0
        }
    };
}


// ========================================
// UPDATE COMPETITOR DESCRIPTION (NOW ACCOMPLISHMENTS ONLY)
// ========================================
function updateCompetitorDescription(songData, competitor, currentRound, accomplishmentsSection) {
    if (!accomplishmentsSection) return;

    const accomplishmentsText = accomplishmentsSection.querySelector('.accomplishments-text');
    if (!accomplishmentsText) return;

    const championships = songData.stats?.championships || 0;
    const semifinals = songData.stats?.semifinals || 0;
    const quarterfinals = songData.stats?.quarterfinals || 0;
    const finals = songData.stats?.finals || 0;

    let accomplishments = [];

    // Championships
    if (championships > 1) {
        accomplishments.push(`${championships}x Champion`);
    } else if (championships === 1) {
        accomplishments.push('Champion');
    }

    // Finals (but not champion)
    if (finals > championships && finals > 1) {
        accomplishments.push(`${finals}x Finalist`);
    } else if (finals > championships && finals === 1) {
        accomplishments.push('Finalist');
    }

    // Semifinals
    if (semifinals > 1) {
        accomplishments.push(`${semifinals}x Semifinalist`);
    } else if (semifinals === 1) {
        accomplishments.push('Semifinalist');
    }

    // Quarterfinals
    if (quarterfinals > 1) {
        accomplishments.push(`${quarterfinals}x Quarterfinalist`);
    } else if (quarterfinals === 1) {
        accomplishments.push('Quarterfinalist');
    }

    // Show/hide section based on accomplishments
    if (accomplishments.length > 0) {
        accomplishmentsText.textContent = accomplishments.join(' • ');
        accomplishmentsSection.style.display = 'block';
    } else {
        accomplishmentsSection.style.display = 'none';
    }
}

// ========================================
// ✅ NEW: UPDATE "ABOUT THIS SONG" TEXT
// ========================================
function updateSongAbout(songData, competitorNum) {
    const aboutSection = document.getElementById(`competitor${competitorNum}-about`);
    const aboutText = document.getElementById(`competitor${competitorNum}-about-text`);

    if (!aboutSection || !aboutText) return;

    if (songData.about) {
        aboutText.textContent = songData.about;
        aboutSection.style.display = '';
    } else {
        // No description for this edit: show nothing, rather than the same filler sentence under every edit
        aboutText.textContent = '';
        aboutSection.style.display = 'none';
    }
}

// An edit with no description and no tournament history has nothing under its player except chips that repeat
// the seed badge and the "creator • year" line above. Mark that block so css/vote.css can hide it on a phone.
function markBareDetails() {
    [1, 2].forEach(n => {
        const block = document.querySelector(`#competitor-${n}-column .moment-details`);
        const about = document.getElementById(`competitor${n}-about`);
        const accomplishments = document.getElementById(`competitor${n}-accomplishments`);
        if (!block) return;
        const hidden = el => !el || el.style.display === 'none';
        block.classList.toggle('moment-details--bare', hidden(about) && hidden(accomplishments));
        block.classList.toggle('moment-details--no-about', hidden(about));
    });
}

// ========================================
// UPDATE COMPETITOR INFO (CALL BOTH FUNCTIONS)
// ========================================
async function updateCompetitorInfo(match) {
    try {
        console.log('🎯 Starting updateCompetitorInfo...');

     const comp1Data = getCompetitorData(match.competitor1);
const comp2Data = getCompetitorData(match.competitor2);
const h2hRecord = undefined;

        console.log('H2H Record:', h2hRecord);

        if (!comp1Data || !comp2Data) {
            console.error('❌ Could not load competitor data');
            return;
        }

        // Get elements
        const comp1Accomplishments = document.getElementById('competitor1-accomplishments');
        const comp1Meta = document.getElementById('competitor1-meta');
        const comp2Accomplishments = document.getElementById('competitor2-accomplishments');
        const comp2Meta = document.getElementById('competitor2-meta');

        // Update accomplishments
        updateCompetitorDescription(comp1Data, match.competitor1, match.round, comp1Accomplishments);
        updateCompetitorDescription(comp2Data, match.competitor2, match.round, comp2Accomplishments);

        // Update "about this song" text
        updateSongAbout(comp1Data, 1);
        updateSongAbout(comp2Data, 2);

        // Update meta info
        updateCompetitorMeta(comp1Data, match.competitor1, comp1Meta);
        updateCompetitorMeta(comp2Data, match.competitor2, comp2Meta);
        markBareDetails();

        console.log('✅ Competitor info updated with accomplishments and about text');
    } catch (error) {
        console.error('❌ Error updating competitor info:', error);
    }
}

    // ========================================
    // UPDATE META STATS DISPLAY
    // ========================================
    // ========================================
    // UPDATE META STATS DISPLAY
    // ========================================
    function updateCompetitorMeta(songData, competitor, metaElement) {
    if (!metaElement) return;

    const artist = competitor.source.split('•')[0]?.trim();
    const year = competitor.source.split('•')[1]?.trim();
    const liveStats = songData.liveStats;

    let metaHTML = '';

    // Always show basic info
    metaHTML += `
        <div class="meta-row basic-info">
            ${competitor.seed != null ? `<span class="meta-item seed">
                <i class="fas fa-trophy"></i>
                <span class="meta-label">Seed</span>
                <span class="meta-value">#${competitor.seed}</span>
            </span>` : ''}
            <span class="meta-item year">
                <i class="far fa-calendar"></i>
                <span class="meta-label">Released</span>
                <span class="meta-value">${year}</span>
            </span>
            <span class="meta-item artist">
                <i class="fas fa-microphone"></i>
                <span class="meta-label">Creator</span>
                <span class="meta-value">${artist}</span>
            </span>
        </div>
    `;

    // Show tournament accomplishments if they exist
    if (liveStats.totalMatches > 0) {
        const accolades = [];

        // Add championship badges
        if (songData.stats?.championships >= 2) {
            accolades.push(`
                <span class="meta-item accolade champion">
                    <i class="fas fa-crown"></i>
                    <span class="meta-value">${songData.stats.championships}x Champion</span>
                </span>
            `);
        } else if (songData.stats?.championships === 1) {
            accolades.push(`
                <span class="meta-item accolade champion">
                    <i class="fas fa-crown"></i>
                    <span class="meta-value">Champion</span>
                </span>
            `);
        }

        // Add finalist badge
        if (songData.accolade === 'contender' && songData.stats?.championships === 0) {
            accolades.push(`
                <span class="meta-item accolade finalist">
                    <i class="fas fa-medal"></i>
                    <span class="meta-value">Finalist</span>
                </span>
            `);
        }

        // Only show tournament stats row if there are accolades to display
        if (accolades.length > 0) {
            metaHTML += `
                <div class="meta-row tournament-stats">
                    ${accolades.join('')}
                </div>
            `;
        }
    } else {
        // Tournament debut
        metaHTML += `
            <div class="meta-row tournament-stats">
                <span class="meta-item debut">
                    <i class="fas fa-star"></i>
                    <span class="meta-value">Tournament Debut</span>
                </span>
            </div>
        `;
    }

    metaElement.innerHTML = metaHTML;
}


    // ========================================
    // LOAD MATCH DATA FROM FIREBASE
    // ========================================

    async function loadMatchData(matchId) {
    try {
             // ✅ Show spinner immediately
        showLoadingSpinner('Loading match...');

        console.log('📥 Loading match data from edge cache...');



        // ✅ NEW: Get match from edge-cached API
        const matchData = await getMatch(matchId);

        if (!matchData) {
                        hideLoadingSpinner(); // ✅ Hide spinner on error

            console.error('❌ Match not found:', matchId);
            showNotification('Match not found', 'error');
            return;
        }

        console.log('✅ Match data loaded from edge cache:', matchData);

        // ✅ NEW: Track page view
await trackMatchView(matchData.id || matchId);

            // Convert Firebase format to page format
          // ---- REPLACEMENT (paste over the old block) ----
currentMatch = {
    id: matchData.id || matchData.matchId,
    round: matchData.round || 1,
    winnerId: matchData.winnerId || null,              // video id of the winner on a finished match
    stage: matchData.stage || null,                    // 'group' for group-stage matches
    matchNumber: matchData.matchNumber || null,        // 1-6 within a group
    roundLabel: matchData.roundLabel || null,          // e.g. "Final", "Semi-finals", "Round of 16" (set by the bracket builder)
    tournamentName: matchData.tournamentName || null,  // e.g. "Arcane Test 01"
    status: matchData.status,
    totalVotes: matchData.totalVotes || 0,
        endDate: matchData.endDate || null,  // ✅ Make sure this line exists!


    competitor1: {
        id: 'song1',
        seed: matchData.song1?.seed ?? matchData.competitor1?.seed ?? null,  // null = unseeded (random draw)
        pot: matchData.song1?.pot ?? matchData.competitor1?.pot ?? null,
        name: matchData.song1?.shortTitle ?? matchData.competitor1?.shortTitle,
        source: `${matchData.song1?.artist ?? matchData.competitor1?.artist} • ${matchData.song1?.year ?? matchData.competitor1?.year}`,
        videoId: matchData.song1?.videoId ?? matchData.competitor1?.videoId,
        votes: matchData.song1?.votes ?? 0,  // ✅ FIX: Read from song1
        percentage: matchData.song1?.percentage ?? 50  // ✅ FIX: Use edge-calculated percentage
    },
    competitor2: {
        id: 'song2',
        seed: matchData.song2?.seed ?? matchData.competitor2?.seed ?? null,  // null = unseeded (random draw)
        pot: matchData.song2?.pot ?? matchData.competitor2?.pot ?? null,
        name: matchData.song2?.shortTitle ?? matchData.competitor2?.shortTitle,
        source: `${matchData.song2?.artist ?? matchData.competitor2?.artist} • ${matchData.song2?.year ?? matchData.competitor2?.year}`,
        videoId: matchData.song2?.videoId ?? matchData.competitor2?.videoId,
        votes: matchData.song2?.votes ?? 0,  // ✅ FIX: Read from song2
        percentage: matchData.song2?.percentage ?? 50  // ✅ FIX: Use edge-calculated percentage
    }
};

// Calculate percentages if not provided by edge
if (currentMatch.totalVotes > 0 && !matchData.song1?.percentage) {
    currentMatch.competitor1.percentage = Math.round((currentMatch.competitor1.votes / currentMatch.totalVotes) * 100);
    currentMatch.competitor2.percentage = Math.round((currentMatch.competitor2.votes / currentMatch.totalVotes) * 100);
}

         // ⭐ Check if user already voted (using new system)
await checkVoteStatus();

// Update page content
await updatePageContent();
updateChampionBubble();
updateSharePanel();

// ✅ NEW: Update vote counts UI AFTER page content is set
if (hasVoted) {
    updateVoteCountsUI();
    console.log('✅ Vote counts refreshed after page update');
}

// ✨ Add dynamic stats and descriptions
await updateCompetitorInfo(currentMatch);
applyClosedState();

// Initialize YouTube players
            initializeYouTubePlayers();

            // ✅ NEW: Load other live matches (always, not just after voting)
await loadOtherLiveMatches();

     // ✅ Hide spinner when everything is loaded
        hideLoadingSpinner();

            // ========================================
            // ✨ NEW: START REAL-TIME UPDATES
            // ========================================
        // ✨ Real-time updates will start AFTER user votes (not before)

        } catch (error) {
                    hideLoadingSpinner(); // ✅ Hide spinner on error

            console.error('❌ Error loading match:', error);
            showNotification('Error loading match data', 'error');
        }
    }

// ========================================
// "NEXT MATCH" BAR (shown once the visitor has voted in THIS match)
// ========================================
// With several matches open at once, the quickest way to more votes is to send a voter straight on to the next one.
function updateNextMatchBar(remaining) {
    let bar = document.getElementById('next-match-bar');
    if (!hasVoted) {
        if (bar) bar.remove();
        document.body.classList.remove('has-next-bar');
        return;
    }
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'next-match-bar';
        bar.className = 'next-match-bar';
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'Next match');
        document.body.appendChild(bar);
    }
    bar.innerHTML = nextMatchBarHtml(remaining);
    document.body.classList.add('has-next-bar');
}

/**
// LOAD OTHER LIVE MATCHES
// ========================================

/**
 * Fetch and display other live matches (excluding current match)
 */async function loadOtherLiveMatches() {
    try {
        console.log('📥 Loading other live matches...');

       let allMatches = [];
try {
    allMatches = await getMatchesForThisPageLoad();  // ✅ NEW
} catch (apiError) {
            console.error('⚠️ API call failed:', apiError);
            document.getElementById('other-matches-section').style.display = 'none';
            return;
        }

        // ✅ Safety check
        if (!allMatches || !Array.isArray(allMatches)) {
            console.warn('⚠️ No matches returned from API');
            document.getElementById('other-matches-section').style.display = 'none';
            return;
        }

        // ✅ STEP 1: Get user votes FIRST (before filtering)
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');

        // ✅ STEP 2: Filter - only live matches user HASN'T voted on yet (excluding current match)
        // (matches from the API carry `matchId`, not `id`: the old filter read match.id, so it listed the current match and voted ones too)
        const hasVotedId = id => !!userVotes[id] || !!localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${id}`);
        const otherLiveMatches = unvotedLiveMatches(allMatches, { currentId: currentMatch.id, hasVoted: hasVotedId });

        updateNextMatchBar(otherLiveMatches);

        console.log(`✅ Found ${otherLiveMatches.length} unvoted live matches`);

        if (otherLiveMatches.length === 0) {
            document.getElementById('other-matches-section').style.display = 'none';
            return;
        }

        // ✅ STEP 3: Transform match data (userVotes already declared above)
        const enhancedMatches = otherLiveMatches.map(match => {
            const userVote = userVotes[match.id];
            const hasVoted = !!userVote;
            const userVotedSongId = hasVoted ? userVote.songId : null;

            // Calculate vote percentages
            const totalVotes = match.totalVotes || 0;
            const song1Votes = match.song1?.votes || 0;
            const song2Votes = match.song2?.votes || 0;

            const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
            const song2Percentage = totalVotes > 0 ? 100 - song1Percentage : 50;

            return {
                id: match.matchId || match.id,
                tournament: match.tournament || ACTIVE_TOURNAMENT,
                round: match.round || 'round-1',
                status: match.status || 'live',
                date: match.date || new Date().toISOString(),
                endDate: match.endDate || null,
                totalVotes: totalVotes,
                timeLeft: 'Voting Open',
                hasVoted: hasVoted,
                competitor1: {
                    seed: match.song1?.seed || 1,
                    name: match.song1?.shortTitle || match.song1?.title || 'Unknown edit',
                    source: `${match.song1?.artist || 'Unknown'} • ${match.song1?.year || '2024'}`,
                    videoId: match.song1?.videoId || '',
                    votes: song1Votes,
                    percentage: song1Percentage,
                    winner: false,
                    leading: userVotedSongId === 'song1',
                    userVoted: hasVoted && userVote.songId === 'song1'
                },
                competitor2: {
                    seed: match.song2?.seed || 2,
                    name: match.song2?.shortTitle || match.song2?.title || 'Unknown edit',
                    source: `${match.song2?.artist || 'Unknown'} • ${match.song2?.year || '2024'}`,
                    videoId: match.song2?.videoId || '',
                    votes: song2Votes,
                    percentage: song2Percentage,
                    winner: false,
                    leading: userVotedSongId === 'song2',
                    userVoted: hasVoted && userVote.songId === 'song2'
                }
            };
        });

        // ✅ STEP 4: Render match cards as DOM elements
        const grid = document.getElementById('other-matches-grid');
        grid.innerHTML = '';

        enhancedMatches.forEach(match => {
            const card = createMatchCard(match);
            grid.appendChild(card);
        });

        // ✅ STEP 5: Update section header with count
        const sectionTitle = document.querySelector('#other-matches-section h2');
        if (sectionTitle) {
            sectionTitle.textContent = `🗳️ ${otherLiveMatches.length} More ${otherLiveMatches.length === 1 ? 'Match' : 'Matches'} Need Your Vote`;
        }

        // Show the section
        document.getElementById('other-matches-section').style.display = 'block';

        console.log('✅ Unvoted matches rendered');

    } catch (error) {
        console.error('❌ Error loading other matches:', error);
        document.getElementById('other-matches-section').style.display = 'none';
    }
}
    // ========================================
    // CLOSED / NOT-YET-OPEN MATCH: the big buttons become a result, not a call to action
    // ========================================
    // Visitors who already voted keep the "You voted for this" look from disableVoting(); everyone else sees who won
    // (or "Voting opens soon"), and a finished match shows its percentages.
    function applyClosedState() {
        if (!currentMatch || hasVoted) return;
        const state = votingState(currentMatch);
        if (state === 'open') return;
        document.querySelectorAll('.vote-btn').forEach(btn => {
            const { text, winner } = closedButton(currentMatch, btn.dataset.competitor, state);
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
            btn.classList.add('is-closed');
            btn.classList.toggle('is-winner', winner);
            const label = btn.querySelector('.vote-text');
            if (label) label.textContent = text;
        });
        if (state === 'closed') {
            updateVoteCountsUI();
            document.querySelectorAll('.vote-stats').forEach(el => { el.classList.add('revealed'); el.classList.remove('hidden'); });
        }
    }

    // ========================================
    // ⭐ UPDATED: CHECK VOTE STATUS (FIREBASE)
    // ========================================

async function checkVoteStatus() {
    try {
        // ✅ NEW: Check localStorage FIRST (free, instant)
        const localVote = localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`);

        if (localVote) {
            hasVoted = true;
            console.log('✅ Found vote in localStorage:', localVote);

            // Make sure it's saved in the new format too
            saveVoteForOtherPages(currentMatch.id, localVote);

            // Update UI with current vote counts
            updateVoteCountsUI();

            // Disable voting and show stats
            disableVoting(localVote);



            return; // ← EXIT EARLY - no Firebase call needed!
        }

        // ✅ Only check Firebase if localStorage is empty (new device/cleared cache)
        console.log('🔍 No local vote found, checking Firebase...');

        const voteId = `${currentMatch.id}_${userId}`;
        const voteRef = doc(db, 'votes', voteId);
        const voteDoc = await getDoc(voteRef);

        if (voteDoc.exists()) {
            hasVoted = true;
            const voteData = voteDoc.data();
            console.log('✅ User already voted (found in Firebase):', voteData.choice);

            // Store in localStorage for next time
            localStorage.setItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`, voteData.choice);
            saveVoteForOtherPages(currentMatch.id, voteData.choice);

            updateVoteCountsUI();
            disableVoting(voteData.choice);
            await loadOtherLiveMatches();
        } else {
            hasVoted = false;
            console.log('📝 No vote found - user can vote');
        }
    } catch (error) {
        console.error('⚠️ Error checking vote status:', error);
        // Fallback to localStorage only
        const localVote = localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`);
        if (localVote) {
            hasVoted = true;
            updateVoteCountsUI();
            disableVoting(localVote);
        }
    }
}

    /**
     * ⭐ UPDATED: Disable voting UI after user has voted
     */
    function disableVoting(votedFor) {
        const voteButtons = document.querySelectorAll('.vote-btn');

        voteButtons.forEach(btn => {
            const isVotedButton = btn.dataset.competitor === votedFor;

            // Disable all buttons
            btn.disabled = true;
            btn.style.cursor = 'not-allowed';

            if (isVotedButton) {
                // Button they voted for - show as selected
                btn.style.opacity = '1';
                btn.classList.add('voted');

                // Change button text
                const textSpan = btn.querySelector('.vote-text');
                if (textSpan) {
                    textSpan.textContent = ' You Voted For This';
                }

                // Change icon color
                const iconSpan = btn.querySelector('.vote-icon');
                if (iconSpan) {
                    iconSpan.style.filter = 'brightness(1.2)';
                }

            } else {
                // Button they didn't vote for - dim it
                btn.style.opacity = '0.4';

                // Change button text
                const textSpan = btn.querySelector('.vote-text');
                if (textSpan) {
                    textSpan.textContent = 'Not Selected';
                }
            }
        });

        // Show indicator banner at top
        const songName = votedFor === 'song1'
            ? currentMatch.competitor1.name
            : currentMatch.competitor2.name;

        const indicator = document.createElement('div');
        indicator.className = 'voted-indicator';
        indicator.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 1rem;">
            <div style="font-size: 1.5rem;"><i class="fa-solid fa-check"></i></div>
                <div>
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">Vote Recorded</div>
                    <div style="opacity: 0.9;">You voted for <strong>${escapeHtml(cleanTitle(songName))}</strong></div>
                </div>
            </div>
        `;
        indicator.style.cssText = `
            background: linear-gradient(135deg, rgba(0, 200, 150, 0.15), rgba(0, 180, 130, 0.15));
            border: 2px solid #00c896;
            color: #00c896;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            margin: 0 0 2rem 0;
            animation: slideDown 0.3s ease;
        `;

        // Insert at top of voting arena
        const arena = document.querySelector('.voting-arena .container-wide');
        if (arena) {
            arena.insertBefore(indicator, arena.firstChild);
        }

        // ✅ ADD THIS AT THE END:
        // Reveal vote statistics now that user has voted
        document.querySelectorAll('.vote-stats').forEach(el => {
            el.classList.add('revealed');
            el.classList.remove('hidden');
        });

        console.log('📊 Vote statistics revealed');
    }

    // ========================================
// AUTO-GENERATE USER PROFILE
// ========================================

async function createAutoGeneratedProfile(userId) {
    try {
        // Check if profile already exists
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);

if (profileDoc.exists()) {
    console.log('✅ Profile already exists, syncing to localStorage...');

    // ✅ Sync from Firestore to localStorage
    const profile = profileDoc.data();
    localStorage.setItem('username', profile.username);
    localStorage.setItem('avatar', JSON.stringify(profile.avatar));

    // ✅ FIX: SYNC isPublic!!!
    const isPublic = profile.privacy?.isPublic ?? true;
    localStorage.setItem('isPublic', isPublic ? 'true' : 'false');

    console.log('✅ Profile synced:', {
        username: profile.username,
        isPublic: isPublic
    });

    return;
}

        // ✅ Generate username
        const username = generateUsername();

        // ✅ Pick random champion avatar
        const randomChampion = CHAMPIONS[Math.floor(Math.random() * CHAMPIONS.length)];
        const avatar = {
            type: 'url',
            value: getChampionImageUrl(randomChampion),
            name: randomChampion
        };

        // ✅ Default privacy settings
        const privacy = {
            isPublic: true,  // Default to public so votes show
            emotePrivacy: 'everyone',
            showOnlineStatus: true
        };

        // ✅ Create profile in Firebase
        await setDoc(profileRef, {
            userId: userId,
            username: username,
            avatar: avatar,
            bio: '',
            privacy: privacy,
            unlockedAchievements: [],
            createdAt: Date.now(),
            autoGenerated: true  // ✅ Flag so we know it's auto-generated
        });

        // ✅ Save to localStorage
        localStorage.setItem('username', username);
        localStorage.setItem('tournamentUsername', username);
        localStorage.setItem('avatar', JSON.stringify(avatar));
        localStorage.setItem('isPublic', 'true');

        console.log('🎉 Auto-generated profile created:', username);

        // ✅ Show welcome toast
        setTimeout(() => {
            if (window.showNotification) {
                showNotification(`Welcome, ${username}! You can change your name anytime in settings.`, 'success');
            }
        }, 2000);

    } catch (error) {
        console.error('❌ Error creating auto profile:', error);
        // Fallback to Anonymous
        localStorage.setItem('username', 'Anonymous');
        localStorage.setItem('avatar', JSON.stringify({ type: 'emoji', value: '🎵' }));
    }
}

// ========================================
// USERNAME GENERATOR
// ========================================

function generateUsername() {
    const adjectives = [
        'Epic', 'Legendary', 'Supreme', 'Elite', 'Mystic',
        'Shadow', 'Golden', 'Silver', 'Royal', 'Grand',
        'Swift', 'Fierce', 'Noble', 'Brave', 'Mighty'
    ];

    const nouns = [
        'Summoner', 'Champion', 'Voter', 'Fan', 'Hunter',
        'Legend', 'Warrior', 'Scout', 'Ranger', 'Guardian',
        'Hero', 'Seeker', 'Watcher', 'Striker', 'Sentinel'
    ];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000);

    return `${adj}${noun}${num}`;
}
    // ========================================
    // UPDATE PAGE CONTENT
    // ========================================

    async function updatePageContent() {
        console.log('📝 Updating page content...');
        console.log('🔍 Current match data:', currentMatch);


        // Update breadcrumb
        const breadcrumbRound = document.getElementById('breadcrumb-round');
        if (breadcrumbRound) {
            const roundNumber = currentMatch.round || 1;
            const roundName = getRoundName(roundNumber);
            console.log('🎯 Round number:', roundNumber, '→', roundName);
            breadcrumbRound.textContent = roundName;
        }

        // Update match title
        const matchTitle = document.getElementById('match-title');
        if (matchTitle) {
            // group matches are numbered within their group in the id ("...-group-B-match-3"); matchNumber is the cup-wide count
            const inGroup = currentMatch.stage === 'group' ? String(currentMatch.id || '').match(/-match-(\d+)$/) : null;
            if (inGroup) {
                // the two columns below carry the names, so the heading is just a small label (the tab title keeps "A vs B")
                matchTitle.textContent = `Match ${inGroup[1]}`;
                matchTitle.classList.add('match-title--label');
                // the label shares the badge row (MATCH 1 · Group B · time left) instead of stacking above it: saves ~45px
                const row = document.querySelector('.vote-header .match-info');
                if (row && matchTitle.parentElement !== row) row.prepend(matchTitle);
            } else {
                matchTitle.textContent = `${cleanTitle(currentMatch.competitor1.name)} vs ${cleanTitle(currentMatch.competitor2.name)}`;
            }
        }

        // Update tournament badge
        const tournamentBadge = document.getElementById('tournament-badge');
        if (tournamentBadge) {
            const roundName = getRoundName(currentMatch.round || 1);
            tournamentBadge.innerHTML = `🏆 ${escapeHtml(currentMatch.tournamentName || 'Tournament')} - ${escapeHtml(roundName)}`;
        }

       // Update time remaining with countdown support
const timeRemaining = document.getElementById('time-remaining');
if (timeRemaining) {
    if (currentMatch.status === 'completed') {
        timeRemaining.innerHTML = '<i class="fa-solid fa-check"></i> Voting Closed'; // ✅ Changed
        timeRemaining.style.color = '#999';
    } else if (currentMatch.status === 'upcoming') {
        timeRemaining.innerHTML = '<i class="fa-solid fa-clock"></i> Coming Soon'; // ✅ Changed
        timeRemaining.style.color = '#ffaa00';
    } else if (currentMatch.status === 'live') {
        // ✅ Check for endDate to show countdown
        if (currentMatch.endDate) {
            const timer = getTimeRemaining(currentMatch.endDate);

            if (timer && !timer.expired) {
                timeRemaining.innerHTML = timer.text;
                timeRemaining.style.color = timer.color;
                timeRemaining.style.fontWeight = '600';

                if (timer.urgent) {
                    timeRemaining.classList.add('urgent');
                }
            } else if (timer && timer.expired) {
                timeRemaining.innerHTML = '<i class="fa-solid fa-stopwatch"></i> Voting Closed'; // ✅ Changed
                timeRemaining.style.color = '#999';
                if (typeof applyClosedState === 'function') applyClosedState();
            } else {
                // Fallback
                timeRemaining.innerHTML = '<i class="fa-solid fa-circle"></i> LIVE NOW'; // ✅ Changed
                timeRemaining.style.color = '#ff4444';
                timeRemaining.classList.add('is-live');
            }
        } else {
            // No endDate available, show generic live status
            timeRemaining.innerHTML = '<i class="fa-solid fa-circle"></i> LIVE NOW'; // ✅ Changed
            timeRemaining.style.color = '#ff4444';
            timeRemaining.classList.add('is-live');
        }
    } else {
        timeRemaining.innerHTML = '<i class="fa-solid fa-clock"></i> Vote Now'; // ✅ Changed
        timeRemaining.style.color = '#ffaa00';
    }
}

        // Update total votes
        const totalVotesEl = document.getElementById('total-votes');
        if (totalVotesEl) {
    totalVotesEl.innerHTML = `<i class="fa-solid fa-chart-column"></i> ${currentMatch.totalVotes.toLocaleString()} votes cast`; // ✅ Changed
        }

           // Update vote button text with song names
    const voteSong1Name = document.getElementById('vote-song1-name');
    const voteSong2Name = document.getElementById('vote-song2-name');

    if (voteSong1Name) voteSong1Name.textContent = cleanTitle(currentMatch.competitor1.name);
    if (voteSong2Name) voteSong2Name.textContent = cleanTitle(currentMatch.competitor2.name);

    // the "About" blocks move below both players on a phone, so each says which edit it is about
    [1, 2].forEach(n => {
        const el = document.getElementById(`competitor${n}-details-for`);
        if (el) el.textContent = `About: ${cleanTitle(currentMatch['competitor' + n].name) || 'this edit'}`;
    });

        // ========================================
        // UPDATE COMPETITOR 1 - BASIC INFO
        // ========================================

        const comp1Seed = document.getElementById('competitor1-seed');
        const comp1Name = document.getElementById('competitor1-name');
        const comp1Source = document.getElementById('competitor1-source');
        const comp1Percentage = document.getElementById('competitor1-percentage');
        const comp1Votes = document.getElementById('competitor1-votes');
        const comp1Video = document.getElementById('competitor1-video');

        if (comp1Seed) {
            const hasSeed = currentMatch.competitor1.seed != null;
            comp1Seed.textContent = hasSeed ? `#${currentMatch.competitor1.seed} Seed` : '';
            comp1Seed.style.display = hasSeed ? '' : 'none';
        }
        if (comp1Name) comp1Name.textContent = cleanTitle(currentMatch.competitor1.name);
        if (comp1Source) comp1Source.textContent = currentMatch.competitor1.source;
       if (comp1Percentage) comp1Percentage.textContent = `${currentMatch.competitor1.percentage}`;
if (comp1Votes) comp1Votes.style.display = 'none'; // ✅ Hide vote count
if (comp1Video) {
    const song1Name = currentMatch.competitor1.name;
    const artist1 = currentMatch.competitor1.source.split('•')[0]?.trim();

const origin = encodeURIComponent(window.location.origin);

comp1Video.src = `https://www.youtube.com/embed/${currentMatch.competitor1.videoId}?enablejsapi=1&origin=${origin}&rel=0`;
    comp1Video.title = `${song1Name} by ${artist1} - Arcane moment`;
    comp1Video.loading = 'lazy';
}


  // ========================================
// UPDATE COMPETITOR 2 - BASIC INFO
// ========================================

const comp2Seed = document.getElementById('competitor2-seed');
const comp2Name = document.getElementById('competitor2-name');
const comp2Source = document.getElementById('competitor2-source');
const comp2Percentage = document.getElementById('competitor2-percentage');
const comp2Votes = document.getElementById('competitor2-votes');
const comp2Video = document.getElementById('competitor2-video');

if (comp2Seed) {
    const hasSeed = currentMatch.competitor2.seed != null;
    comp2Seed.textContent = hasSeed ? `#${currentMatch.competitor2.seed} Seed` : '';
    comp2Seed.style.display = hasSeed ? '' : 'none';
}
if (comp2Name) comp2Name.textContent = cleanTitle(currentMatch.competitor2.name);
if (comp2Source) comp2Source.textContent = currentMatch.competitor2.source;
if (comp2Percentage) comp2Percentage.textContent = `${currentMatch.competitor2.percentage}`;
if (comp2Votes) comp2Votes.style.display = 'none'; // ✅ Hide vote count

if (comp2Video) {
    const song2Name = currentMatch.competitor2.name;
    const artist2 = currentMatch.competitor2.source.split('•')[0]?.trim();
    const origin = encodeURIComponent(window.location.origin);

comp2Video.src = `https://www.youtube.com/embed/${currentMatch.competitor2.videoId}?enablejsapi=1&origin=${origin}&rel=0`;
    comp2Video.title = `${song2Name} by ${artist2} - Arcane Moments edit`;
    comp2Video.loading = 'lazy';
}





        // ========================================
        // UPDATE PAGE TITLE
        // ========================================

document.title = `Vote: ${currentMatch.competitor1.name} vs ${currentMatch.competitor2.name} | Arcane Moments`;
        console.log('✅ Page content updated (stats will be added by updateCompetitorInfo)');

         // ✅ ADD THIS LINE:
    updateDynamicMetaTags();
    }


    // ========================================
// UPDATE META TAGS DYNAMICALLY
// ========================================

function updateDynamicMetaTags() {
    if (!currentMatch) return;

    const song1 = currentMatch.competitor1.name;
    const song2 = currentMatch.competitor2.name;
    const roundName = getRoundName(currentMatch.round || 1);

    // Dynamic title
const title = `Vote: ${song1} vs ${song2} | ${roundName} | Arcane Moments`;
    // Dynamic description
const description = `Cast your vote between ${song1} and ${song2} in Arcane Moments.`;
    // Update <title>
    document.title = title;

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.setAttribute('content', description);
    }

    // Update canonical URL (in case match ID is in URL)
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
        canonical.setAttribute('href', window.location.href);
    }

    // ========================================
    // UPDATE OPEN GRAPH TAGS
    // ========================================

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
        ogTitle.setAttribute('content', title);
    }

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) {
        ogDesc.setAttribute('content', description);
    }

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
        ogUrl.setAttribute('content', window.location.href);
    }

    // ========================================
    // UPDATE TWITTER CARD TAGS
    // ========================================

    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) {
        twitterTitle.setAttribute('content', title);
    }

    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    if (twitterDesc) {
        twitterDesc.setAttribute('content', description);
    }

    console.log('✅ Dynamic meta tags updated:', title);
}
    // ========================================
    // HELPER FUNCTION: GET ROUND NAME
    // ========================================

    function getRoundName(roundNumber) {
        // Cups made by the bracket builder store the round's name on the match, so use it. This works for any bracket size.
        if (currentMatch?.roundLabel && roundNumber === currentMatch.round) return currentMatch.roundLabel;
        // Older cups (64-bracket) fall back to the old table.
        const roundNames = {
            1: 'Round 1',
            2: 'Round 2',
            3: 'Round 3 (Sweet 16)',
            4: 'Quarterfinals',
            5: 'Semifinals',
            6: 'Finals'
        };
        return roundNames[roundNumber] || `Round ${roundNumber}`;
    }

    function showMatchStatus() {
        // ✅ ONLY show AFTER voting (reversed logic)
        if (!hasVoted) return;

        const comp1Votes = currentMatch.competitor1.votes;
        const comp2Votes = currentMatch.competitor2.votes;
        const totalVotes = currentMatch.totalVotes;

        // Don't show if no votes yet
        if (totalVotes === 0) return;

        const comp1Pct = currentMatch.competitor1.percentage;
        const comp2Pct = currentMatch.competitor2.percentage;
        const diff = Math.abs(comp1Votes - comp2Votes);

        let message = '';
        let icon = '';
        let color = '';

        // Determine message based on vote spread
        if (Math.abs(comp1Pct - comp2Pct) <= 5) {
            // CLOSE RACE
            message = `🔥 <strong>Too close to call!</strong> Separated by just ${diff} ${diff === 1 ? 'vote' : 'votes'}!`;
            color = '#ffaa00'; // Yellow
        } else if (Math.abs(comp1Pct - comp2Pct) <= 15) {
            // COMPETITIVE
            const leader = comp1Pct > comp2Pct ? currentMatch.competitor1.name : currentMatch.competitor2.name;
            message = `⚔️ <strong>${leader}</strong> leading by ${diff} ${diff === 1 ? 'vote' : 'votes'}. Your vote matters!`;
            color = '#4a9eff'; // Blue
        } else {
            // BLOWOUT
            const leader = comp1Pct > comp2Pct ? currentMatch.competitor1.name : currentMatch.competitor2.name;
            const loser = comp1Pct < comp2Pct ? currentMatch.competitor1.name : currentMatch.competitor2.name;
            message = `🚨 <strong>${leader}</strong> dominating ${comp1Pct}-${comp2Pct}! Can <strong>${loser}</strong> make a comeback?`;
            color = '#ff4444'; // Red
        }

        const banner = document.createElement('div');
        banner.className = 'match-status-banner';
        banner.innerHTML = `
            <div class="status-content">
                ${message}
                <span class="vote-cta">Vote now to impact the race! →</span>
            </div>
        `;
        banner.style.cssText = `
            background: linear-gradient(135deg, ${color}15, ${color}25);
            border: 2px solid ${color};
            color: ${color};
            border-radius: 12px;
            padding: 1rem 1.5rem;
            margin-bottom: 2rem;
            animation: slideDown 0.4s ease;
        `;

        const arena = document.querySelector('.voting-arena .container-wide');
        if (arena) {
            arena.insertBefore(banner, arena.firstChild);
        }
    }

    // Add this helper function to vote.js (after your other helper functions)

/**
 * Track share and award XP
 */
function trackShare(platform, context) {
    // XP and the share count are paid once per match per day, so re-tapping share on the same match earns nothing
    const shareKey = `shareDay_${currentMatch?.id || 'page'}`;
    const today = utcDay();
    if (localStorage.getItem(shareKey) === today) return;
    localStorage.setItem(shareKey, today);

    const currentShares = parseInt(localStorage.getItem('sharesCount') || '0');
    localStorage.setItem('sharesCount', (currentShares + 1).toString());

    const SHARE_XP = 5; // Matches rank-system.js xpSources.share
    addXP(SHARE_XP, 'share');

    console.log(`📤 Share tracked: ${platform} (${context}) - Share #${currentShares + 1} - +${SHARE_XP} XP`);
    showNotification(`+${SHARE_XP} XP for sharing! 📤 (${currentShares + 1} total shares)`, 'success');

    // Social achievements (the tracker shows each unlock's toast)
    setTimeout(async () => {
        try {
            const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
            const voteIds = Object.keys(userVotes);
            if (!voteIds.length) return;
            const allMatches = await getAllMatches();
            const matchMap = new Map(allMatches.map(m => [m.id || m.matchId, m]));
            const allVotes = voteIds.map(matchId => achievementVote(matchId, userVotes[matchId], matchMap.get(matchId)));
            await checkAchievements(allVotes);
        } catch (e) {
            console.warn('Share achievement check failed:', e);
        }
    }, 500);
}

// ========================================
// LOADING SPINNER HELPERS
// ========================================

/**
 * Show loading spinner with custom message
 * @param {string} message - Text to display under spinner
 */
function showLoadingSpinner(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const spinnerText = document.getElementById('spinner-text');

    if (overlay && spinnerText) {
        spinnerText.textContent = message;
        overlay.style.display = 'flex';
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }
}

/**
 * Hide loading spinner
 */
function hideLoadingSpinner() {
    const overlay = document.getElementById('loading-overlay');

    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.style.display = 'none';
            document.body.style.overflow = ''; // Restore scrolling
        }, 200); // Match fadeOut animation
    }
}
    // ========================================
    // ✨ NEW: SHOW VOTE URGENCY INDICATORS
    // ========================================

    function updateVoteUrgency() {
            if (!hasVoted) return; // ✅ Don't show urgency until after voting

        if (currentMatch.totalVotes === 0) return;

        const comp1Pct = currentMatch.competitor1.percentage;
        const comp2Pct = currentMatch.competitor2.percentage;
        const voteDiff = Math.abs(currentMatch.competitor1.votes - currentMatch.competitor2.votes);

        // Determine if it's a close race
        const isClose = Math.abs(comp1Pct - comp2Pct) <= 5;

        // Determine who's losing
        const loser = comp1Pct < comp2Pct ? currentMatch.competitor1 : currentMatch.competitor2;
        const loserSide = comp1Pct < comp2Pct ? 1 : 2;

        // Add urgency banner if close
        if (isClose && currentMatch.status === 'live' && !hasVoted) {
            showUrgencyBanner(loser, voteDiff, loserSide);
        }

        // Add visual indicators to vote cards
        updateVoteCardUrgency(comp1Pct, comp2Pct, voteDiff);
        // ✨ ADD THIS:
        showMatchStatus();
    }

    // ========================================
    // SHOW URGENCY BANNER
    // ========================================

    function showUrgencyBanner(losingSong, voteDiff, loserSide) {
        // Remove existing banner
        const existing = document.querySelector('.urgency-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.className = 'urgency-banner';
        banner.innerHTML = `
            <div class="urgency-content">
            <span class="urgency-icon"><i class="fa-solid fa-triangle-exclamation"></i></span>
                <div class="urgency-text">
                    <strong>${escapeHtml(losingSong.name)}</strong> is being eliminated!
                    <span class="vote-diff">Trailing by ${voteDiff.toLocaleString()} votes</span>
                </div>
                <button class="urgency-cta" onclick="scrollToVoteButton(${loserSide})">
                    Save Now →
                </button>
            </div>
        `;

        // Insert at top of voting arena
        const arena = document.querySelector('.voting-arena .container-wide');
        if (arena) {
            arena.insertBefore(banner, arena.firstChild);
        }
    }

    // ========================================
    // UPDATE VOTE CARDS WITH URGENCY
    // ========================================

    function updateVoteCardUrgency(comp1Pct, comp2Pct, voteDiff) {
        const card1 = document.querySelector('[data-competitor="song1"]')?.closest('.competitor-card');
        const card2 = document.querySelector('[data-competitor="song2"]')?.closest('.competitor-card');

        if (!card1 || !card2) return;

        // Reset classes
        card1.classList.remove('losing', 'winning', 'tied');
        card2.classList.remove('losing', 'winning', 'tied');

        if (Math.abs(comp1Pct - comp2Pct) <= 2) {
            // Too close to call
            card1.classList.add('tied');
            card2.classList.add('tied');
        } else if (comp1Pct < comp2Pct) {
            card1.classList.add('losing');
            card2.classList.add('winning');

            // Add "SAVE THIS SONG" text to losing card
            if (!hasVoted && currentMatch.status === 'live') {
                addSavePrompt(card1, voteDiff);
            }
        } else {
            card1.classList.add('winning');
            card2.classList.add('losing');

            if (!hasVoted && currentMatch.status === 'live') {
                addSavePrompt(card2, voteDiff);
            }
        }
    }

    // ========================================
    // ADD "SAVE" PROMPT TO LOSING CARD
    // ========================================

    function addSavePrompt(card, voteDiff) {
        // Remove existing prompt
        const existing = card.querySelector('.save-prompt');
        if (existing) existing.remove();

        const prompt = document.createElement('div');
        prompt.className = 'save-prompt';
        prompt.innerHTML = `
        <span class="save-icon"><i class="fa-solid fa-triangle-exclamation"></i></span>
            <span class="save-text">Being Eliminated!</span>
            <span class="save-diff">${voteDiff.toLocaleString()} votes behind</span>
        `;

        // Insert before vote button
        const voteBtn = card.querySelector('.vote-btn');
        if (voteBtn && voteBtn.parentNode) {
            voteBtn.parentNode.insertBefore(prompt, voteBtn);
        }
    }

    // ========================================
    // SCROLL TO VOTE BUTTON HELPER
    // ========================================

    window.scrollToVoteButton = function(competitorNumber) {
        const button = document.querySelector(`[data-competitor="song${competitorNumber}"]`);
        if (button) {
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Pulse animation
            button.style.animation = 'pulse 0.6s ease-in-out 3';
        }
    };

    // ========================================
    // INITIALIZE YOUTUBE PLAYERS
    // ========================================

    function initializeYouTubePlayers() {
        console.log('🎬 YouTube players initialized');
        // Videos will auto-initialize via iframe src
    }

// ========================================
// ⭐ UPDATED: SUBMIT VOTE TO FIREBASE WITH XP
// ========================================

async function submitVote(songId) {
    // Prevent double voting
    if (hasVoted) {
        showNotification('You have already voted in this match!', 'error');
        return;
    }

    // Check if match is live
    if (currentMatch.status !== 'live') {
        showNotification('Voting is not open for this match', 'error');
        return;
    }

    console.log('🗳️ Voting for: Song ' + songId);

    try {
        // ✅ CRITICAL: Get guaranteed good profile FIRST
        console.log('🔄 Getting guaranteed user profile...');
        const profile = await getGuaranteedProfile();
        const userId = localStorage.getItem('tournamentUserId');
        const username = profile.username;
        const isPublic = profile.isPublic;
        const avatar = profile.avatar;

        console.log('✅ Guaranteed profile loaded:', { username, isPublic, avatar: !!avatar });

        // Disable voting buttons immediately
        hasVoted = true;
        const voteButtons = document.querySelectorAll('.vote-btn');
        voteButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        });

        // ✅ Show spinner with voting message
        showLoadingSpinner('Submitting your vote...');

        // Determine which song was voted for (song1 or song2)
        const votedForSong1 = songId === 'song1';

        console.log('🗳️ Voting for:', votedForSong1 ? 'Song 1' : 'Song 2');
        console.log('👤 User ID:', userId);
        console.log('👤 Username:', username);
        console.log('🔓 isPublic:', isPublic);

        // ⭐ Create vote record in Firebase
        const voteId = `${currentMatch.id}_${userId}`;
        const voteRef = doc(db, 'votes', voteId);

        // Check if vote already exists (extra safety)
        const existingVote = await getDoc(voteRef);
        if (existingVote.exists()) {
            hideLoadingSpinner();
            console.warn('⚠️ Vote already exists!');
            showNotification('You have already voted in this match!', 'error');
            disableVoting(existingVote.data().choice);
            return;
        }

 // Save vote to Firebase with username and avatar.
// The vote document and the match counters are written in ONE batch:
// firestore.rules only allows the +1 when the same batch creates the vote doc.
const voteBatch = writeBatch(db);
voteBatch.set(voteRef, {
    tournament: ACTIVE_TOURNAMENT,
    matchId: currentMatch.id,
    userId: userId,
    username: username,  // ✅ From guaranteed profile
    avatar: avatar,      // ✅ From guaranteed profile
    championId: profile.championPackId || 'jinx',  // ✅ ADD THIS LINE
    choice: songId,
    timestamp: Date.now(),
    round: currentMatch.round,
    // Store song details for analytics
    votedForSeed: (votedForSong1 ? currentMatch.competitor1.seed : currentMatch.competitor2.seed) ?? null,
    votedForName: votedForSong1 ? currentMatch.competitor1.name : currentMatch.competitor2.name
});

        // Counter increment for the edit that was voted for (same batch as the vote doc)
        const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches/${currentMatch.id}`);
        voteBatch.update(matchRef, {
            [`${songId}.votes`]: increment(1),
            totalVotes: increment(1)
        });

        await voteBatch.commit();
        console.log('✅ CHECKPOINT 1+2: Vote record and match counts written in one batch');

        // Save vote locally as backup
        localStorage.setItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`, songId);

        // ✅ Also save in userVotes format for homepage/matches pages
        saveVoteForOtherPages(currentMatch.id, songId, true);
        console.log('✅ CHECKPOINT 3: LocalStorage saved');
        console.log('✅ CHECKPOINT 4: About to enter activity block');

        // ========================================
        // ✅ ALWAYS LOG ACTIVITY + CREATE SOCIAL POST
        // ========================================
        try {
            console.log('✅ CHECKPOINT 5: Inside activity try block');

            const votedSong = votedForSong1 ? currentMatch.competitor1 : currentMatch.competitor2;
            const otherSong = votedForSong1 ? currentMatch.competitor2 : currentMatch.competitor1;
            const activityId = `${userId}_${currentMatch.id}`;

            const votedVideoId = votedSong.videoId;
            const votedSongName = votedSong.name || 'Unknown edit';
            const otherSongName = otherSong.name || 'Unknown edit';
            const matchTitle = `${currentMatch.competitor1.name} vs ${currentMatch.competitor2.name}`;

            // ✅ DEBUG: Log exactly what we're about to write
            console.log('📝 Logging activity:', {
                matchId: currentMatch.id,
                username: username,
                round: currentMatch.round,
                choice: songId,
                isPublic: isPublic
            });

            console.log('🔍 songId parameter value:', songId);
            console.log('🔍 votedVideoId:', votedVideoId);
            console.log('🔍 isPublic:', isPublic);

// Create activity data object
const activityData = {
    activityId: activityId,
    userId: userId,
    username: username,  // ✅ From guaranteed profile
    avatar: avatar,      // ✅ From guaranteed profile
    championId: profile.championPackId || 'jinx',  // ✅ ADD THIS LINE
    matchId: currentMatch.id,
    matchTitle: matchTitle,
    songId: votedVideoId,
    songTitle: votedSongName,
    choice: songId,
    timestamp: Date.now(),
    round: currentMatch.round,
    tournamentId: ACTIVE_TOURNAMENT,
    isPublic: isPublic  // ✅ From guaranteed profile
};

            console.log('🔍 COMPLETE ACTIVITY DATA TO WRITE:', JSON.stringify(activityData, null, 2));

            // ✅ ALWAYS log to activity collection
            await setDoc(doc(db, 'activity', activityId), activityData);

            console.log('✅ Activity logged for:', username);
            console.log('✅ Activity written to Firebase with ID:', activityId);

            // ✅ ALWAYS create social feed post (if public)
            if (isPublic) {
                try {
                    console.log('📝 ATTEMPTING TO CREATE SOCIAL FEED POST...');
                    console.log('   - User is public');
                    console.log('   - matchId:', currentMatch.id);
                    console.log('   - songId:', votedVideoId);
                    console.log('   - choice:', songId);

                    const { createVotePost } = await import('./social-feed.js');

                    console.log('✅ social-feed.js imported successfully');

                    const postData = {
                        matchId: currentMatch.id,
                        matchTitle: matchTitle,
                        songId: votedVideoId,
                        songTitle: votedSongName,
                        votedSongName: votedSongName,
                        opponentSongName: otherSongName,
                        opponentSongId: otherSong.videoId,
                        choice: songId,
                        round: currentMatch.round,
                        tournamentId: ACTIVE_TOURNAMENT
                    };

                    console.log('🔍 SOCIAL POST DATA:', JSON.stringify(postData, null, 2));

                    await createVotePost(postData);

                    console.log('✅ Social feed post created for:', username);
                } catch (postError) {
                    console.error('❌ SOCIAL FEED POST FAILED!');
                    console.error('Error type:', postError.constructor.name);
                    console.error('Error message:', postError.message);
                    console.error('Full stack:', postError.stack);

                    // ✅ Show a notification so you know it failed
                    if (window.showNotification) {
                        showNotification('Vote saved but social post failed', 'warning');
                    }
                }
            } else {
                console.log('ℹ️ User is private, skipping social post (isPublic:', isPublic, ')');
            }

        } catch (activityError) {
            console.error('❌ Could not log activity:', activityError);
            console.error('Error type:', activityError.constructor.name);
            console.error('Error message:', activityError.message);
            console.error('Stack trace:', activityError.stack);
        }

     // ========================================
// ✅ NEW: CALCULATE AND AWARD XP
// ========================================
const savedVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
const thisVote = savedVotes[currentMatch.id] || {};
const voteStreak = streakFromVotes(Object.values(savedVotes));
const xpData = calculateVoteXP({ facts: thisVote.facts || {}, streak: voteStreak });

// Level-ups, mastery-ups and achievement unlocks from here on are collected for the post-vote modal instead of toasting
beginVoteProgress();
const newTotalXP = addXP(xpData.totalXP);

// Kept for the profile and the post-vote line
localStorage.setItem('votingStreak', String(voteStreak));

// ✅ Check for achievement unlocks
// Achievements can award additional XP, so do this before the
// final profile sync and final rank calculation.
await checkForAchievementUnlocks();

// ✅ Recalculate final XP/rank after achievement rewards
const finalTotalXP = parseInt(
    localStorage.getItem('userTotalXP') || '0',
    10
);

const rank = getUserRank(finalTotalXP);
const progressEvents = endVoteProgress();

console.log(
    `📈 Final XP after achievements: ${finalTotalXP} XP (Level ${rank.currentLevel.level})`
);

// ✅ Sync final profile stats to Firestore
try {
    const { syncProfileStatsToFirestore } = await import('./rank-system.js');
    await syncProfileStatsToFirestore();
    console.log('✅ Final profile stats synced to Firestore');
} catch (syncError) {
    console.warn('⚠️ Profile sync failed (non-critical):', syncError);
    // Don't block vote submission if sync fails
}

        // ========================================
// ✅ CHECK DAILY SESSION KICKOFF
// ========================================
try {
    const { markDailySessionStarted } = await import('./daily-welcome.js');
    const isFirstVoteToday = markDailySessionStarted();

    if (isFirstVoteToday) {
        console.log('🌅 First vote of the day!');
        // Achievement will be checked in next checkAchievements() call
    }
} catch (error) {
    console.error('⚠️ Could not mark daily session:', error);
}


console.log(
    `✨ Earned ${xpData.totalXP} vote XP! Final total: ${finalTotalXP} XP (Level ${rank.currentLevel.level})`
);

        // ✅ Update nav display immediately (with safety check)
        if (window.updateNavProfile) {
            window.updateNavProfile();
        } else {
            console.warn('⚠️ updateNavProfile not available yet');
        }

        // ✅ ADD THIS: Check for founding member badge
        const earnedFoundingBadge = await awardFoundingMemberBadge(userId);
        if (earnedFoundingBadge) {
            console.log('👑 User earned Founding Member badge!');
            // Toast will show automatically from founding-member-tracker.js
        }

        // ✅ CAPTURE SONG DATA BEFORE RELOAD (data might change after reload)
        const votedSong = votedForSong1 ? currentMatch.competitor1 : currentMatch.competitor2;
        const songSeed = votedSong.seed;
        const songName = votedSong.name || votedSong.shortTitle || votedSong.title || 'Your pick';
        // Seeds are null in random-draw cups, so never identify a competitor by seed.
        // votedSlot ('song1' | 'song2') is the reliable identity of the voted competitor.
        const votedSlot = votedForSong1 ? 'song1' : 'song2';
        const songData = { ...votedSong, votedSlot };

        console.log('📊 Song data for modal:', { songName, songSeed, songData });

        // ✅ Update spinner message
        showLoadingSpinner('Refreshing results...');

        // Reload with cache bypass to get fresh vote count
        await reloadMatchData(true);

        // (no "Vote cast" toast here: the post-vote modal says it, and the toast used to sit on top of the modal)

        // Show voted indicator
        disableVoting(songId);

        // Update UI with fresh vote count
        updateVoteCountsUI();

// ✅ Hide spinner before showing modal
        hideLoadingSpinner();

        // the modal's "Next match" button reads the bar, so build the bar first
        await loadOtherLiveMatches();

        // ✅ SAFETY CHECK: Ensure we have valid data before showing modal
        if (!songName || !songData || !xpData || !rank) {
            console.error('❌ Missing data for post-vote modal:', {
                songName,
                songData: !!songData,
                xpData: !!xpData,
                rank: !!rank
            });
            showNotification(`Vote cast for "${cleanTitle(songName || '')}"`, 'success');
        } else {
            // Show modal with correct numbers
            showPostVoteModal(songName, songData, xpData, rank, progressEvents);
        } // ✅ CLOSE THE ELSE BLOCK HERE



        console.log('✅ Vote submitted successfully!');

    } catch (error) { // ✅ NOW THE CATCH PROPERLY PAIRS WITH TRY
        endVoteProgress();   // never leave a capture open: it would hide later toasts
        hideLoadingSpinner(); // ✅ Hide spinner on error
        console.error('❌ Error submitting vote:', error);
        showNotification('Error submitting vote. Please try again.', 'error');

        // Re-enable voting on error
        hasVoted = false;
        const voteButtons = document.querySelectorAll('.vote-btn');
        voteButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }

    // ✅ Show one-time tip to set username
const hasUsername = localStorage.getItem('username');
const tipShown = localStorage.getItem('profileTipShown');

if (!hasUsername && !tipShown) {
    setTimeout(() => {
        showProfileTip();
        localStorage.setItem('profileTipShown', 'true');
    }, 2000); // 2 seconds after post-vote modal
}
}


// ========================================
// ✅ NEW: ACHIEVEMENT CHECK AFTER VOTING
// ========================================
// ========================================
// ✅ IMPROVED: ACHIEVEMENT CHECK AFTER VOTING
// ========================================

export async function checkForAchievementUnlocks() {
    try {
        console.log('🏆 Checking for achievement unlocks...');

        // ✅ NEW: Initialize session tracking
        if (!sessionStorage.getItem('sessionStart')) {
            sessionStorage.setItem('sessionStart', Date.now().toString());
            console.log('📍 New voting session started');
        }

        // ✅ FIX: Get userId FIRST (before doing any work)
        const userId = localStorage.getItem('tournamentUserId') || localStorage.getItem('userId');

        if (!userId) {
            console.warn('⚠️ No userId found, skipping achievement check');
            return;
        }

        console.log('🔍 Checking achievements for userId:', userId);

        // Get user's complete vote history from localStorage
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        const voteIds = Object.keys(userVotes);

        if (voteIds.length === 0) {
            console.log('ℹ️ No votes found in history');
            return;
        }

        // ✅ FIX: Get match data to properly categorize votes
        const allMatches = await getMatchesForThisPageLoad();

        if (!allMatches || allMatches.length === 0) {
            console.warn('⚠️ No match data available for achievement checking');
            return;
        }

        const matchMap = new Map(allMatches.map(m => [m.id || m.matchId, m]));

        // Build proper vote history with match context
        const allVotes = voteIds.map(matchId => achievementVote(matchId, userVotes[matchId], matchMap.get(matchId)));

      // ✅ DEFENSIVE: Import and check achievements safely
const { checkAchievements } = await import('./achievement-tracker.js');

if (typeof checkAchievements !== 'function') {
    console.error('❌ checkAchievements is not a function');
    return;
}

// ✅ FIX: Pass context object with afterVote flag (not userId!)
console.log('🔍 Calling checkAchievements with', allVotes.length, 'votes (afterVote: true)');
const achievementResult = await checkAchievements(allVotes, { afterVote: true });

// ✅ DEFENSIVE: Handle undefined/null results
if (!achievementResult) {
    console.warn('⚠️ checkAchievements returned undefined');
    return;
}

const newlyUnlocked = achievementResult.newlyUnlocked || [];

        // Show notifications for newly unlocked achievements
        if (newlyUnlocked && newlyUnlocked.length > 0) {
            console.log(`🎉 ${newlyUnlocked.length} achievement(s) unlocked!`);

            // The tracker already showed each unlock's toast

            // Update navigation rank (achievements award XP)
            if (window.updateNavProfile && typeof window.updateNavProfile === 'function') {
                window.updateNavProfile();
            }
        } else {
            console.log('✅ No new achievements unlocked this vote');
        }

    } catch (error) {
        console.error('⚠️ Error checking achievements:', error);
        console.error('Stack trace:', error.stack);
        // Don't block vote submission if achievements fail
    }
}

 //* ✅ NEW: Save vote to userVotes format for homepage/matches pages
 /*//
/**
 * ✅ FIXED: Save vote to userVotes format for homepage/matches pages
 * Now includes songTitle and opponentTitle for alert messages
 */
// `isNewVote` is true only for the vote just cast: its facts are judged from the counts as they stood before it was counted
// (currentMatch is still the pre-vote snapshot there). A record restored on a revisit is never rewritten, so a vote keeps the
// facts it had when it was cast.
function saveVoteForOtherPages(matchId, songId, isNewVote = false) {
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const existing = userVotes[matchId];
    if (existing && existing.songId === songId && !isNewVote) return existing;

    const votedSong = songId === 'song1' ? currentMatch.competitor1 : currentMatch.competitor2;
    const opponentSong = songId === 'song1' ? currentMatch.competitor2 : currentMatch.competitor1;

    const record = {
        songId: songId,
        songTitle: votedSong.name,
        opponentTitle: opponentSong.name,
        timestamp: Date.now(),
        championId: activePackId(localStorage),   // the companion that was active (pack achievements, Champions tab)
        round: currentMatch.round
    };
    if (isNewVote) {
        const { sharePct, totalVotesAtTime, ...flags } = voteFacts({ voted: votedSong, other: opponentSong });
        record.facts = flags;
        record.sharePct = sharePct;
        record.totalVotesAtTime = totalVotesAtTime;
        record.tiedBefore = flags.tiedBefore;
        record.votedForSeed = votedSong.seed ?? null;
        record.votedForVideoId = votedSong.videoId ?? null;
        // kept for older readers of this record (alerts, matches page)
        record.voteType = flags.underdog || flags.againstTide ? 'underdog' : flags.close ? 'closeCall' : sharePct > 60 ? 'mainstream' : 'balanced';
    } else {
        record.voteType = 'balanced';
    }
    userVotes[matchId] = record;
    localStorage.setItem('userVotes', JSON.stringify(userVotes));
    return record;
}

// ========================================
// ✅ NEW: XP CALCULATION HELPERS
// ========================================

    // ========================================
    // RELOAD MATCH DATA
    // ========================================
 async function reloadMatchData(bypassCache = false) {
    try {
        console.log(`🔄 Reloading match data${bypassCache ? ' (BYPASSING CACHE)' : ''}...`);

        const matchData = await getMatch(currentMatch.id, bypassCache);

        if (matchData) {
            console.log('📥 Received match data:', {
                totalVotes: matchData.totalVotes,
                song1Votes: matchData.song1?.votes,  // ✅ Check song1
                song2Votes: matchData.song2?.votes   // ✅ Check song2
            });

            // ✅ FIX: Read from song1/song2, not competitor1/competitor2
            currentMatch.competitor1.votes = matchData.song1?.votes ?? 0;
            currentMatch.competitor2.votes = matchData.song2?.votes ?? 0;
            currentMatch.totalVotes = matchData.totalVotes ?? 0;

            // Recalculate percentages
            if (currentMatch.totalVotes > 0) {
                currentMatch.competitor1.percentage = Math.round(currentMatch.competitor1.votes / currentMatch.totalVotes * 100);
                currentMatch.competitor2.percentage = Math.round(currentMatch.competitor2.votes / currentMatch.totalVotes * 100);
            } else {
                currentMatch.competitor1.percentage = 50;
                currentMatch.competitor2.percentage = 50;
            }

            // Update UI with new counts
            updateVoteCountsUI();

            console.log('✅ Match data reloaded:', {
                totalVotes: currentMatch.totalVotes,
                percentages: `${currentMatch.competitor1.percentage}% - ${currentMatch.competitor2.percentage}%`
            });
        } else {
            console.warn('⚠️ No match data returned from getMatch()');
        }
    } catch (error) {
        console.error('⚠️ Error reloading match data:', error);
    }
}

// ========================================
    // UPDATE VOTE COUNTS UI
    // ========================================
// ========================================
// UPDATE VOTE COUNTS UI
// ========================================
// The cup champion's speech bubble: tell it where this viewer is in this match (js/champion-bubble.js)
// ========================================
// SHARE BOX: bottom of the page, inside the post-vote modal, and the slim share modal opened from alerts
// ========================================
function mountMatchShareBox(el, extra = {}) {
    return mountShareBox(el, {
        getShare: bump => currentShare(null, { bump }),
        onShare: (platform, kind) => trackShare(platform, kind),
        notify: (msg, type) => showNotification(msg, type),
        ...extra
    });
}

let pageShareBox = null;
async function updateSharePanel() {
    try {
        const el = document.getElementById('share-panel');
        if (!el || !currentMatch?.competitor1 || !currentMatch?.competitor2) return;
        if (!sharePack) { try { sharePack = await loadChampionPack(getCupChampionId()); } catch (e) { /* plain wording */ } }
        if (!pageShareBox) pageShareBox = mountMatchShareBox(el);
        else pageShareBox.refresh();
        // Arriving from an alert button (?share=1) and already voted: open the slim share modal once
        if (!shareModalOpened && new URLSearchParams(location.search).get('share') && (hasVoted || localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`))) {
            shareModalOpened = true;
            openShareModal();
        }
    } catch (e) { console.warn('share panel skipped:', e); }
}

let shareModalOpened = false;
async function openShareModal() {
    const championId = getCupChampionId();
    const meta = getCompanionPack(championId);
    const champKey = meta?.championId || 'Jinx';
    if (!sharePack) sharePack = await loadChampionPack(championId);
    const pack = sharePack;
    const skin = lookSkin(pack);
    const modal = document.getElementById('vote-modal');
    modal.innerHTML = buildShareModalHtml({
        line: currentShare().text, championName: pack?.name || champKey,
        portraitUrl: getChampionTileUrl(champKey, skin), splashUrl: getChampionSplashUrl(champKey, skin)
    });
    const portraitImg = modal.querySelector('.pvm-portrait');
    if (portraitImg) portraitImg.onerror = () => { portraitImg.onerror = null; portraitImg.src = getChampionTileUrl(champKey, 0); };
    // the champion's speech bubble IS the share message; "New line" swaps it
    const lineEl = modal.querySelector('.pvm-line');
    mountMatchShareBox(modal.querySelector('[data-share-box]'), { showText: false, onText: text => { if (lineEl) lineEl.textContent = text; } });
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
window.openShareModal = openShareModal;

function updateChampionBubble() {
    try {
        if (!currentMatch?.competitor1 || !currentMatch?.competitor2) return;
        const c1 = currentMatch.competitor1, c2 = currentMatch.competitor2;
        const mine = localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`);   // 'song1' | 'song2' | null
        const voted = !!(hasVoted || mine);
        const pick = mine === 'song2' ? c2 : mine === 'song1' ? c1 : null;
        const other = pick === c1 ? c2 : c1;
        const v1 = c1.votes || 0, v2 = c2.votes || 0;
        const winner = currentMatch.winnerId
            ? (c1.videoId === currentMatch.winnerId ? c1 : c2.videoId === currentMatch.winnerId ? c2 : null)
            : (v1 === v2 ? null : (v1 > v2 ? c1 : c2));
        renderChampionBubble({
            matchId: currentMatch.id,
            status: currentMatch.status === 'completed' ? 'completed' : currentMatch.status === 'upcoming' ? 'upcoming' : 'live',
            hasVoted: voted,
            // standings are only handed over once the viewer has voted, as the page itself does
            pickVotes: voted ? (pick || c1).votes || 0 : 0,
            otherVotes: voted ? (pick ? other : c2).votes || 0 : 0,
            total: voted || currentMatch.status === 'completed' ? (currentMatch.totalVotes || v1 + v2) : (currentMatch.totalVotes || 0),
            endDate: currentMatch.endDate,
            pickIsWinner: !!pick && winner === pick,
            tied: !winner,
            pickName: pick?.name, otherName: pick ? other.name : c2.name, winnerName: winner?.name
        });
    } catch (e) { console.warn('champion bubble skipped:', e); }
}

function updateVoteCountsUI() {
    // Safety check
    if (!currentMatch || !currentMatch.competitor1 || !currentMatch.competitor2) {
        console.error('Cannot update UI: currentMatch not ready:', currentMatch);
        return;
    }

    // Recalculate percentages cleanly (NO double-100 hack!)
    const total = currentMatch.totalVotes || 0;
    const comp1Votes = currentMatch.competitor1.votes || 0;
    const comp2Votes = currentMatch.competitor2.votes || 0;

    const comp1Percent = total > 0 ? Math.round((comp1Votes / total) * 100) : 50;
    const comp2Percent = total > 0 ? Math.round((comp2Votes / total) * 100) : 50;

    // Update currentMatch percentages for consistency
    currentMatch.competitor1.percentage = comp1Percent;
    currentMatch.competitor2.percentage = comp2Percent;

    console.log('Updating UI with:', {
        song1: `${comp1Percent}% (${comp1Votes} vote${comp1Votes === 1 ? '' : 's'})`,
        song2: `${comp2Percent}% (${comp2Votes} vote${comp2Votes === 1 ? '' : 's'})`,
        total: total
    });

    // DOM elements
    const comp1Percentage = document.getElementById('competitor1-percentage');
    const comp1VotesEl = document.getElementById('competitor1-votes');
    const comp2Percentage = document.getElementById('competitor2-percentage');
    const comp2VotesEl = document.getElementById('competitor2-votes');
    const totalVotesEl = document.getElementById('total-votes');

    console.log('DOM Elements found:', {
        comp1Percentage: !!comp1Percentage,
        comp1VotesEl: !!comp1VotesEl,
        comp2Percentage: !!comp2Percentage,
        comp2VotesEl: !!comp2VotesEl,
        totalVotesEl: !!totalVotesEl
    });

    // Update Competitor 1
    if (comp1Percentage) {
        comp1Percentage.textContent = comp1Percent;
        console.log('Set comp1 percentage to:', comp1Percent);
    } else {
        console.error('Element not found: competitor1-percentage');
    }

  // ✅ HIDE vote count, only show percentage
    if (comp1VotesEl) {
        comp1VotesEl.style.display = 'none';
    }

     // Update Competitor 2
    if (comp2Percentage) {
        comp2Percentage.textContent = comp2Percent;
    }

    // ✅ HIDE vote count, only show percentage
    if (comp2VotesEl) {
        comp2VotesEl.style.display = 'none';
    }

    // Update total
    if (totalVotesEl) {
        totalVotesEl.innerHTML = `Total: ${total.toLocaleString()} vote${total === 1 ? '' : 's'} cast`;
        console.log('Set total votes to:', total);
    } else {
        console.error('Element not found: total-votes');
    }

    console.log('UI updated with current vote counts');
    updateChampionBubble();
    updateSharePanel();
}

    // ========================================
    // NOTIFICATION SYSTEM
    // ========================================

    // ========================================
// NOTIFICATION SYSTEM (Standardized)
// ========================================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `vote-toast vote-toast--${type}`;
    notification.setAttribute('role', 'status');
    notification.textContent = message;
    // styled by .notification in css/arcane-theme.css (pink, top of the screen, clear of the modal's buttons and the bottom bars)
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('vote-toast--out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

    // ========================================
    // THUMBNAIL FALLBACK FOR NON-EMBEDDABLE VIDEOS
    // ========================================

    /**
     * Show thumbnail instead of iframe for videos that can't be embedded
     * @param {number} competitorNum - 1 or 2
     * @param {string} videoId - YouTube video ID
     */
    function showThumbnailForCompetitor(competitorNum, videoId) {
    const wrapper = document.getElementById(`competitor${competitorNum}-wrapper`);
    const fallback = document.getElementById(`competitor${competitorNum}-youtube-fallback`);
    const thumbnail = document.getElementById(`competitor${competitorNum}-thumbnail`);

    if (!wrapper || !fallback || !thumbnail) {
        console.warn(`Could not find thumbnail elements for competitor ${competitorNum}`);
        return;
    }

    // ✅ NEW: Get song name for alt text
    const songData = competitorNum === 1 ? currentMatch.competitor1 : currentMatch.competitor2;
    const songName = songData.name || 'Arcane Moments edit';
    const artist = songData.source.split('•')[0]?.trim() || 'Unknown creator';

    // Set thumbnail image
    thumbnail.src = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    // ✅ NEW: Add descriptive alt text
    thumbnail.alt = `${songName} by ${artist} - Arcane Moments edit thumbnail`;

    // ✅ NEW: Add loading="lazy" for performance
    thumbnail.loading = 'lazy';

    // Fallback to medium quality if max doesn't exist
    thumbnail.onerror = () => {
        thumbnail.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    };

    // Set YouTube link
    fallback.href = `https://www.youtube.com/watch?v=${videoId}`;

    // Show thumbnail, hide iframe
    wrapper.classList.add('show-thumbnail');
    fallback.classList.add('active');
    fallback.style.display = 'block';

    console.log(`📺 Showing thumbnail for competitor ${competitorNum} (video: ${videoId}) with alt text`);
}

    /**
     * Manual override for testing - call from console
     */
    window.forceVideoThumbnail = function(competitorNumber) {
        if (!currentMatch) {
            console.error('No current match loaded');
            return;
        }

        const videoId = competitorNumber === 1
            ? currentMatch.competitor1.videoId
            : currentMatch.competitor2.videoId;

        showThumbnailForCompetitor(competitorNumber, videoId);
    };


 // ========================================
// POST-VOTE MODAL WITH BOOK RECOMMENDATIONS
// ========================================

/**
 * Show post-vote modal
 * @param {string} songName - Name of the song voted for
 * @param {object} songData - Full song data from JSON
 */
// ========================================
// POST-VOTE MODAL WITH BOOK RECOMMENDATIONS & XP
// ========================================

/**
 * Show post-vote modal with XP earned
 * @param {string} songName - Name of the song voted for
 * @param {object} songData - Full song data from JSON
 * @param {object} xpData - XP earned data from calculateVoteXP
 * @param {object} rank - User's rank data from getUserRank
 */
async function showPostVoteModal(songName, songData, xpData, rank, progressEvents = []) {

    // ✨ Calculate voting situation
    // Prefer the explicit slot; fall back to seed only when both seeds exist and differ.
    const votedFor = songData.votedSlot
        || ((songData.seed != null && songData.seed === currentMatch.competitor1.seed) ? 'song1' : 'song2');
    const userVotes = votedFor === 'song1' ? currentMatch.competitor1.votes : currentMatch.competitor2.votes;
    const opponentVotes = votedFor === 'song1' ? currentMatch.competitor2.votes : currentMatch.competitor1.votes;
    const userPct = votedFor === 'song1' ? currentMatch.competitor1.percentage : currentMatch.competitor2.percentage;
    const opponentPct = votedFor === 'song1' ? currentMatch.competitor2.percentage : currentMatch.competitor1.percentage;
    const opponentName = votedFor === 'song1' ? currentMatch.competitor2.name : currentMatch.competitor1.name;
    const voteDiff = Math.abs(userVotes - opponentVotes);
    const totalVotes = currentMatch.totalVotes;
    const pctDiff = Math.abs(userPct - opponentPct);

    // ========================================
// DETERMINE VOTING SITUATION
// ========================================

// ✅ Calculate match timing using your Firebase fields
const matchStartTime = new Date(currentMatch.startDate).getTime();
const matchEndTime = new Date(currentMatch.endDate).getTime();
const now = Date.now();
const timeRemaining = matchEndTime - now;
const hoursRemaining = timeRemaining / (1000 * 60 * 60);

// ✅ Determine timing phase
const isEarlyVoting = totalVotes < 10; // First 10 votes
const isFinalHours = hoursRemaining <= 10 && hoursRemaining > 0;
const isMiddlePeriod = !isEarlyVoting && !isFinalHours;

let situationType = '';
let modalIcon = '';
let modalTitle = '';
let successMessage = '';
let shareMessage = '';
let shareContext = '';

// Early voting (< 10 votes total)
if (isEarlyVoting) {
    situationType = 'early';
    modalIcon = '🌟';
    modalTitle = 'Early Voter!';
    successMessage = `
        <p class="modal-message early">
            You voted for <strong>"${escapeHtml(songName)}"</strong><br>
            <span class="stakes-text">Only ${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'} so far — this match needs more voters!</span>
        </p>
    `;
    shareContext = 'early';
    shareMessage = `
        <div class="share-cta urgent">
            <div class="share-header">
                <span class="share-icon">🚀</span>
                <strong>Be a Pioneer!</strong>
            </div>
            <p class="share-text">
                This match just started! Help shape the results from the beginning.
            </p>
            <div class="share-buttons">
                <button class="share-btn twitter" data-song="${escapeHtml(songName)}" onclick="shareToTwitter(this.dataset.song, 'early')">
        <span class="btn-icon"><i class="fa-brands fa-twitter"></i></span> Tweet
                </button>
                <button class="share-btn reddit" data-song="${escapeHtml(songName)}" onclick="shareToReddit(this.dataset.song, 'early')">
        <span class="btn-icon"><i class="fa-brands fa-reddit"></i></span> Reddit
                </button>
                <button class="share-btn copy" onclick="copyMatchLink()">
        <span class="btn-icon"><i class="fa-solid fa-link"></i></span> Copy Link
                </button>
            </div>
        </div>
    `;
}
// Perfect tie
else if (voteDiff === 0) {
    situationType = 'tied';
    modalIcon = '⚖️';
    modalTitle = 'Perfect Tie!';
    successMessage = `
        <p class="modal-message special">
            You just broke the deadlock!<br>
            <span class="stakes-text">"${escapeHtml(songName)}" and "${escapeHtml(opponentName)}" were exactly ${userVotes}-${opponentVotes}</span>
        </p>
    `;
    shareContext = 'tied';

    // ✅ Dynamic based on timing
    const tiedUrgency = isFinalHours
        ? 'FINAL HOURS - PERFECTLY TIED!'
        : 'This is INSANE!';
    const tiedMessage = isFinalHours
        ? `Final hours and these edits are PERFECTLY TIED at ${userVotes}-${userVotes}! Your vote could be the tiebreaker.`
        : `these edits are PERFECTLY TIED at ${userVotes}-${userVotes}! Every single vote decides the winner.`;

    shareMessage = `
        <div class="share-cta extreme">
            <div class="share-header">
                <span class="share-icon">⚖️</span>
                <strong>${tiedUrgency}</strong>
            </div>
            <p class="share-text">
                ${tiedMessage}
            </p>
            <div class="share-buttons">
                <button class="share-btn twitter" data-song="${escapeHtml(songName)}" onclick="shareToTwitter(this.dataset.song, 'tied')">
        <span class="btn-icon"><i class="fa-brands fa-twitter"></i></span> Tweet
                </button>
                <button class="share-btn reddit" data-song="${escapeHtml(songName)}" onclick="shareToReddit(this.dataset.song, 'tied')">
        <span class="btn-icon"><i class="fa-brands fa-reddit"></i></span> Reddit
                </button>
                <button class="share-btn copy" onclick="copyMatchLink()">
        <span class="btn-icon"><i class="fa-solid fa-link"></i></span> Copy Link
                </button>
            </div>
        </div>
    `;
}
// Nail-biter (within 2 votes)
else if (voteDiff <= 2) {
    situationType = 'nailbiter';
    modalIcon = '🔥';
    modalTitle = 'Nail-Biter!';
    successMessage = `
        <p class="modal-message special">
            You voted for <strong>"${escapeHtml(songName)}"</strong><br>
            <span class="stakes-text">Only ${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'} separate these edits!</span>
        </p>
    `;
    shareContext = 'nailbiter';

    // ✅ Dynamic based on timing
    const nailbiterHeader = isFinalHours
        ? 'FINAL HOURS - TOO CLOSE!'
        : 'TOO CLOSE TO CALL!';
    const nailbiterMessage = isFinalHours
        ? `Just ${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'} separate these edits in the FINAL HOURS! This could go either way!`
        : `Just ${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'} separate these edits. Your vote could decide everything!`;

    shareMessage = `
        <div class="share-cta extreme">
            <div class="share-header">
                <span class="share-icon">🔥</span>
                <strong>${nailbiterHeader}</strong>
            </div>
            <p class="share-text">
                ${nailbiterMessage}
            </p>
            <div class="share-buttons">
                <button class="share-btn twitter" data-song="${escapeHtml(songName)}" onclick="shareToTwitter(this.dataset.song, 'nailbiter')">
        <span class="btn-icon"><i class="fa-brands fa-twitter"></i></span> Tweet
                </button>
                <button class="share-btn reddit" data-song="${escapeHtml(songName)}" onclick="shareToReddit(this.dataset.song, 'nailbiter')">
        <span class="btn-icon"><i class="fa-brands fa-reddit"></i></span> Reddit
                </button>
                <button class="share-btn copy" onclick="copyMatchLink()">
        <span class="btn-icon"><i class="fa-solid fa-link"></i></span> Copy Link
                </button>
            </div>
        </div>
    `;
}
// Losing but salvageable (behind by 3-5 votes)
else if (userPct < opponentPct && voteDiff <= 5) {
    situationType = 'losing-close';
    modalIcon = '⚔️';
    modalTitle = 'Fighting for It!';
    successMessage = `
        <p class="modal-message special">
            You're fighting for <strong>"${escapeHtml(songName)}"</strong>!<br>
            <span class="stakes-text">Behind by just ${voteDiff} votes (${userPct}% vs ${opponentPct}%)</span>
        </p>
    `;
    shareContext = 'losing-close';

    // ✅ Dynamic based on timing
    const comebackHeader = isFinalHours
        ? 'FINAL HOURS - Comeback Time!'
        : 'Comeback Time!';
    const comebackMessage = isFinalHours
        ? `"${escapeHtml(songName)}" is behind by ${voteDiff} votes in the FINAL HOURS! A comeback is still possible!`
        : `"${escapeHtml(songName)}" is behind by just ${voteDiff} votes! A comeback is totally possible — rally support!`;

    shareMessage = `
        <div class="share-cta urgent">
            <div class="share-header">
                <span class="share-icon">⚔️</span>
                <strong>${comebackHeader}</strong>
            </div>
            <p class="share-text">
                ${comebackMessage}
            </p>
            <div class="share-buttons">
                <button class="share-btn twitter" data-song="${escapeHtml(songName)}" onclick="shareToTwitter(this.dataset.song, 'losing-close')">
        <span class="btn-icon"><i class="fa-brands fa-twitter"></i></span> Tweet
                </button>
                <button class="share-btn reddit" data-song="${escapeHtml(songName)}" onclick="shareToReddit(this.dataset.song, 'losing-close')">
        <span class="btn-icon"><i class="fa-brands fa-reddit"></i></span> Reddit
                </button>
                <button class="share-btn copy" onclick="copyMatchLink()">
        <span class="btn-icon"><i class="fa-solid fa-link"></i></span> Copy Link
                </button>
            </div>
        </div>
    `;
}
// Losing badly (behind by 6+ votes)
else if (userPct < opponentPct) {
    situationType = 'losing-bad';
    modalIcon = '🆘';
    modalTitle = 'Save It!';
    successMessage = `
        <p class="modal-message special">
            You voted to save <strong>"${escapeHtml(songName)}"</strong>!<br>
            <span class="stakes-text">But it's losing ${userPct}% to ${opponentPct}% — it needs a miracle!</span>
        </p>
    `;
    shareContext = 'losing-bad';

    // ✅ Dynamic based on timing
    const emergencyHeader = isFinalHours
        ? 'FINAL HOURS - CODE RED!'
        : 'EMERGENCY: Rally the Community!';
    const emergencyMessage = isFinalHours
        ? `"${songName}" is down ${pctDiff}% with only hours remaining! This is the LAST CHANCE!`
        : `"${songName}" is down ${pctDiff}% and needs your help to survive. Share now to rally supporters!`;

    shareMessage = `
        <div class="share-cta urgent">
            <div class="share-header">
                <span class="share-icon">📢</span>
                <strong>${emergencyHeader}</strong>
            </div>
            <p class="share-text">
                ${emergencyMessage}
            </p>
            <div class="share-buttons">
                <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'losing-bad')">
        <span class="btn-icon"><i class="fa-brands fa-twitter"></i></span> Tweet
                </button>
                <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'losing-bad')">
        <span class="btn-icon"><i class="fa-brands fa-reddit"></i></span> Reddit
                </button>
                <button class="share-btn copy" onclick="copyMatchLink()">
        <span class="btn-icon"><i class="fa-solid fa-link"></i></span> Copy Link
                </button>
            </div>
        </div>
    `;
}
// Winning but close (within 10%)
else if (pctDiff <= 10) {
    situationType = 'winning-close';
    modalIcon = '📊';
    modalTitle = 'Leading!';
    successMessage = `
        <p class="modal-message">
            Great choice! <strong>"${escapeHtml(songName)}"</strong> is leading!<br>
            <span class="stakes-text">Currently ${userPct}% to ${opponentPct}% — but it's still competitive!</span>
        </p>
    `;
    shareContext = 'winning-close';

    // ✅ Dynamic based on timing
    const leadHeader = isFinalHours
        ? 'FINAL HOURS - Seal the Victory!'
        : 'Maintain the Lead!';
    const leadMessage = isFinalHours
        ? `"${songName}" is ahead in the FINAL HOURS, but it's still competitive. Help seal the win!`
        : `"${songName}" is ahead but the race is still close. Help secure the victory!`;

    shareMessage = `
        <div class="share-cta">
            <div class="share-header">
                <span class="share-icon">📊</span>
                <strong>${leadHeader}</strong>
            </div>
            <p class="share-text">
                ${leadMessage}
            </p>
            <div class="share-buttons">
                <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'winning-close')">
        <span class="btn-icon"><i class="fa-brands fa-twitter"></i></span> Tweet
                </button>
                <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'winning-close')">
        <span class="btn-icon"><i class="fa-brands fa-reddit"></i></span> Reddit
                </button>
                <button class="share-btn copy" onclick="copyMatchLink()">
        <span class="btn-icon"><i class="fa-solid fa-link"></i></span> Copy Link
                </button>
            </div>
        </div>
    `;
}
// Dominating (winning by 10%+)
else {
    situationType = 'dominating';
    modalIcon = '🎯';
    modalTitle = 'Dominating!';
    successMessage = `
        <p class="modal-message victory">
            "${songName}" is crushing it at ${userPct}%!<br>
            <span class="stakes-text">Keep the momentum going!</span>
        </p>
    `;
    shareContext = 'dominating';
    shareMessage = `
        <div class="share-cta calm">
            <div class="share-header">
                <span class="share-icon">🎯</span>
                <strong>Victory Lap!</strong>
            </div>
            <p class="share-text">
                "${songName}" is dominating! Share the tournament with the community:
            </p>
            <div class="share-buttons">
                <button class="share-btn twitter" data-song="${escapeHtml(songName)}" onclick="shareToTwitter(this.dataset.song, 'dominating')">
        <span class="btn-icon"><i class="fa-brands fa-twitter"></i></span> Tweet
                </button>
                <button class="share-btn reddit" data-song="${escapeHtml(songName)}" onclick="shareToReddit(this.dataset.song, 'dominating')">
        <span class="btn-icon"><i class="fa-brands fa-reddit"></i></span> Reddit
                </button>
                <button class="share-btn copy" onclick="copyMatchLink()">
        <span class="btn-icon"><i class="fa-solid fa-link"></i></span> Copy Link
                </button>
            </div>
        </div>
    `;
}
// ========================================
// ✅ IMPROVED: XP EARNED SECTION
// ========================================
// The cup champion answers the vote (lines per kind of vote live in champion-packs/<id>.json under "modal")
    const championId = getCupChampionId();
    const meta = getCompanionPack(championId);
    const champKey = meta?.championId || 'Jinx';
    const pack = await loadChampionPack(championId);
    sharePack = pack;
    const userVotesMap = (() => { try { return JSON.parse(localStorage.getItem('userVotes') || '{}'); } catch (e) { return {}; } })();
    const modalKey = pickModalKey({
        isFirstEver: Object.keys(userVotesMap).length <= 1,
        streak: parseInt(localStorage.getItem('votingStreak') || '0', 10),
        isUnderdog: !!(userVotesMap[currentMatch.id]?.facts?.underdog),
        isEarly: isEarlyVoting,
        situationType
    });
    const prettyName = cleanTitle(songName);
    const skin = lookSkin(pack);
    const line = chooseModalLine(pack, modalKey,
        { pick: prettyName.split(/\s+[-–—]\s+|\s*\|\|?\s*/)[0].trim() || prettyName, streak: localStorage.getItem('votingStreak') || '' },
        currentMatch.id || '');

    // "Next match" comes from the same list the bar uses (loadOtherLiveMatches ran before this)
    const nextEl = document.querySelector('#next-match-bar [data-next-match]');
    const next = nextEl ? { href: nextEl.getAttribute('href'), label: 'Next match' } : null;

    // What this vote changed: level, mastery, skins and achievements (events were collected while the vote was processed)
    const progressPack = activePackId(localStorage);
    const progress = buildProgressSummary({ events: progressEvents, xpData, packId: progressPack, packXp: readPackXp(localStorage)[progressPack] || 0 });
    const thumbFor = (packId, num) => getChampionTileUrl(getCompanionPack(packId)?.championId || (packId.charAt(0).toUpperCase() + packId.slice(1)), num);
    for (const mu of progress.masteryUps) for (const sk of mu.skins) sk.thumb = thumbFor(mu.packId, sk.num);

    const modal = document.getElementById('vote-modal');
    modal.innerHTML = buildPostVoteModalHtml({
        situationType, line, tag: TAG_FOR_KEY[modalKey] || '', championName: pack?.name || champKey,
        portraitUrl: getChampionTileUrl(champKey, skin), splashUrl: getChampionSplashUrl(champKey, skin),
        voteTitle: shortTitle(songName, 46), songNameRaw: songName, shareContext,
        xp: xpData, rank, next, bracketHref: 'brackets', progress
    });
    modal.querySelectorAll('[data-wear-pack]').forEach(btn => btn.addEventListener('click', () => {
        const opts = { champion: btn.dataset.wearPack, skin: Number(btn.dataset.wearSkin) };
        if (window.openSettingsModal) { window.closePostVoteModal?.(); window.openSettingsModal(opts); }
        else window.location.href = '/profile#champions';
    }));
    const portraitImg = modal.querySelector('.pvm-portrait');
    if (portraitImg) portraitImg.onerror = () => { portraitImg.onerror = null; portraitImg.src = getChampionTileUrl(champKey, 0); };
    const modalShare = modal.querySelector('[data-share-box]');
    if (modalShare) mountMatchShareBox(modalShare);

    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    console.log(`✅ Post-vote modal shown (${situationType}) with ${xpData.totalXP} XP`);
}

// ========================================
// SHARE FUNCTIONS
// ========================================

// ========================================
// UPDATED: Share functions with tracking
// ========================================

// The wording comes from the cup champion's pack ("share" lines, see js/match-share.js); the post-vote buttons and the
// share panel at the bottom of the page use the same builder, so the text is the same everywhere.
let sharePack = null;
function currentShare(kind, extra = {}) {
    const c1 = currentMatch.competitor1, c2 = currentMatch.competitor2;
    const mine = localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`);   // 'song1' | 'song2' | null
    const pick = mine === 'song2' ? c2 : mine === 'song1' ? c1 : null;
    const other = pick === c1 ? c2 : c1;
    const voted = !!(hasVoted || mine);
    return buildMatchShare({
        kind: kind || shareKind({
            hasVoted: voted && !!pick, status: currentMatch.status === 'completed' ? 'completed' : 'live',
            pickVotes: pick?.votes || 0, otherVotes: (pick ? other : c2).votes || 0, total: currentMatch.totalVotes || 0
        }),
        pack: sharePack, matchId: currentMatch.id, origin: window.location.origin,
        a: c1.name, b: c2.name, pick: (pick || c1).name, other: (pick ? other : c2).name,
        pickVotes: pick?.votes || 0, otherVotes: (pick ? other : c2).votes || 0, total: currentMatch.totalVotes || 0,
        ...extra
    });
}

window.shareToTwitter = function(songName, context) {
    const s = currentShare(context);
    window.open(s.targets.x, '_blank', 'width=550,height=420');
    trackShare('twitter', context);
};

window.shareToReddit = function(songName, context) {
    const s = currentShare(context);
    window.open(s.targets.reddit, '_blank');
    trackShare('reddit', context);
};

window.copyMatchLink = function() {
    const matchUrl = currentShare().copyText;

    navigator.clipboard.writeText(matchUrl).then(() => {
        showNotification('Link copied to clipboard! 🔗', 'success');

        // ✅ ADD THIS:
        trackShare('copy-link', 'manual');
    }).catch(() => {
        // Fallback for older browsers
        const tempInput = document.createElement('input');
        tempInput.value = matchUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        showNotification('Link copied! 🔗', 'success');

        // ✅ ADD THIS:
        trackShare('copy-link', 'manual');
    });

    console.log('📋 Match link copied to clipboard');
};

/**
 * Close post-vote modal
 */
function closePostVoteModal() {
    const modal = document.getElementById('vote-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

}

// Make functions available globally
window.closePostVoteModal = closePostVoteModal;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('vote-modal')?.classList.contains('active')) closePostVoteModal(); });
    // ========================================
    // EVENT LISTENERS
    // ========================================

    // Vote button handlers
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('vote-btn') || e.target.closest('.vote-btn')) {
            const button = e.target.classList.contains('vote-btn') ? e.target : e.target.closest('.vote-btn');
            const songId = button.dataset.competitor;

            if (songId && currentMatch) {
                await submitVote(songId);
            }
        }
    });

    // Video control handlers - Replay
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('replay-btn') || e.target.closest('.replay-btn')) {
            const button = e.target.classList.contains('replay-btn') ? e.target : e.target.closest('.replay-btn');
            const videoId = button.dataset.video;
            const iframe = document.getElementById(`${videoId}-video`);

            if (iframe) {
                const src = iframe.src;
                iframe.src = src; // Reload iframe to replay video
                console.log('🔄 Replaying video:', videoId);
            }
        }
    });

    // Video control handlers - Fullscreen
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('fullscreen-btn') || e.target.closest('.fullscreen-btn')) {
            const button = e.target.classList.contains('fullscreen-btn') ? e.target : e.target.closest('.fullscreen-btn');
            const videoId = button.dataset.video;
            const iframe = document.getElementById(`${videoId}-video`);

            if (iframe) {
                if (iframe.requestFullscreen) {
                    iframe.requestFullscreen();
                } else if (iframe.webkitRequestFullscreen) {
                    iframe.webkitRequestFullscreen();
                } else if (iframe.mozRequestFullScreen) {
                    iframe.mozRequestFullScreen();
                } else if (iframe.msRequestFullscreen) {
                    iframe.msRequestFullscreen();
                }
                console.log('⛶ Fullscreen requested:', videoId);
            }
        }
    });

    // (Share buttons: js/share-box.js. The old delegated .twitter/.reddit/.copy handler was removed: it opened a second, old-wording tab on top of the new box.)

    // Back button handler
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // Modal handlers
    function closeModal() {
        const modal = document.getElementById('vote-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('vote-modal');
        if (e.target === modal) {
            closeModal();
        }
    });

    // Make closeModal available globally for inline onclick if needed
    window.closeModal = closeModal;

    console.log('✅ Vote.js loaded with IP + Fingerprint security');

    // ========================================
// ✅ NEW: TRACK MATCH VIEW
// ========================================

async function trackMatchView(matchId) {
    try {
        const response = await fetch('/api/track-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matchId: matchId,
                timestamp: Date.now()
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`👀 View tracked: ${data.totalViews} total, ${data.recentViews} recent`);
        }
    } catch (error) {
        console.warn('⚠️ View tracking failed:', error);
        // Don't block page load if tracking fails
    }
}

   /**
 * Show one-time profile tip
 */
function showProfileTip() {
    const tip = document.createElement('div');
    tip.className = 'profile-tip';
    tip.innerHTML = `
        <div class="tip-content">
            <span class="tip-icon">💡</span>
            <div class="tip-text">
                <strong>Set your username to appear on leaderboards!</strong>
                <p>Click your profile in the top-right corner</p>
            </div>
            <button class="tip-close" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
    `;

    tip.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95));
        color: #0a0a0a;
        padding: 1.5rem;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        z-index: 9999;
        max-width: 350px;
        animation: slideInRight 0.4s ease;
        font-family: 'Lora', serif;
    `;

    document.body.appendChild(tip);

    // Auto-remove after 8 seconds
    setTimeout(() => {
        tip.style.animation = 'slideOutRight 0.4s ease';
        setTimeout(() => tip.remove(), 400);
    }, 8000);
}
// ========================================
// SYNC USERNAME ON PAGE LOAD
// ========================================

/**
 * Ensure username and tournamentUsername stay in sync
 */
// ========================================
// SYNC USERNAME ON PAGE LOAD
// ========================================

function syncUsernameOnLoad() {
    const username = localStorage.getItem('username');
    const tournamentUsername = localStorage.getItem('tournamentUsername');

    // ✅ If BOTH are missing, trigger profile creation
    if (!username && !tournamentUsername) {
        console.log('⚠️ No username found, profile should have been created');
        return;
    }

    if (username && !tournamentUsername) {
        localStorage.setItem('tournamentUsername', username);
        console.log('✅ Synced tournamentUsername from username:', username);
    } else if (!username && tournamentUsername) {
        localStorage.setItem('username', tournamentUsername);
        console.log('✅ Synced username from tournamentUsername:', tournamentUsername);
    } else if (username && tournamentUsername && username !== tournamentUsername) {
        // Both exist but don't match - username takes priority
        localStorage.setItem('tournamentUsername', username);
        console.log('✅ Resolved mismatch - set both to:', username);
    }
}