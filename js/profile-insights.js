// ========================================
// PROFILE INSIGHTS (owner-only)
// Voting-style stats + shareable stats image.
// Ported from the retired My Votes page. Every helper takes the vote
// list as an argument instead of reading page-level state.
// ========================================

// ----------------------------------------
// HELPERS
// ----------------------------------------

/** True only for a real numeric seed (random-draw cups use null). */
export function hasSeed(seed) {
    return seed !== null && seed !== undefined && seed !== '' && Number.isFinite(Number(seed));
}

function toMs(timestamp) {
    if (!timestamp) return null;
    if (typeof timestamp === 'object' && typeof timestamp.toMillis === 'function') {
        return timestamp.toMillis();
    }
    if (typeof timestamp === 'object' && typeof timestamp.seconds === 'number') {
        return timestamp.seconds * 1000;
    }
    const n = Number(timestamp);
    if (Number.isFinite(n) && n > 0) return n;
    const parsed = new Date(timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

function toRoundNumber(round) {
    return parseInt(String(round ?? 1).replace(/\D/g, ''), 10) || 1;
}

function dayNumber(ms) {
    const d = new Date(ms);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// ----------------------------------------
// ENRICH
// votes: [{ choice, matchId, timestamp, match }]  (match already looked up)
// ----------------------------------------

export function enrichVotes(votes) {
    return votes
        .filter(v => v.match && v.match.song1 && v.match.song2)
        .map(v => {
            const m = v.match;
            const chosen = v.choice === 'song1' ? m.song1 : m.song2;
            const opponent = v.choice === 'song1' ? m.song2 : m.song1;

            const s1 = Number(m.song1.votes) || 0;
            const s2 = Number(m.song2.votes) || 0;
            const total = s1 + s2;
            const chosenVotes = v.choice === 'song1' ? s1 : s2;
            const pct = total > 0 ? Math.round((chosenVotes / total) * 100) : 50;

            let voteType = 'closeCall';
            if (pct < 40) voteType = 'underdog';
            else if (pct > 60) voteType = 'mainstream';

            const isCompleted = m.status === 'completed' || !!m.winnerId;

            let editStatus = 'active';
            if (isCompleted && m.winnerId) {
                editStatus = m.winnerId === chosen.id ? 'advanced' : 'eliminated';
            }

            return {
                matchId: v.matchId,
                timestamp: toMs(v.timestamp),
                round: toRoundNumber(m.round),
                editId: chosen.id,
                editName: chosen.shortTitle || chosen.title || 'Unknown edit',
                videoId: chosen.videoId,
                opponentName: opponent.shortTitle || opponent.title || 'Unknown edit',
                pct,
                voteType,
                isCompleted,
                editStatus,
                marginPct: total > 0 ? (Math.abs(s1 - s2) / total) * 100 : null
            };
        });
}

// ----------------------------------------
// STATS
// ----------------------------------------

/** Current streak: consecutive days with a vote, ending today or yesterday. */
export function calculateVotingStreak(enriched) {
    const days = [...new Set(
        enriched.filter(v => v.timestamp).map(v => dayNumber(v.timestamp))
    )].sort((a, b) => b - a);

    if (days.length === 0) return 0;

    const today = dayNumber(Date.now());
    if (days[0] < today - 1) return 0; // streak has lapsed

    let streak = 1;
    for (let i = 0; i < days.length - 1; i++) {
        if (days[i] - days[i + 1] === 1) streak++;
        else break;
    }
    return streak;
}

export function getTasteProfile(majorityAlignment, totalVotes, underdogPicks) {
    if (totalVotes < 5) {
        return {
            icon: '<i class="fa-solid fa-clapperboard"></i>',
            emoji: '🎬',
            title: 'New Voter',
            description: 'Just getting started - vote more to unlock your taste profile!'
        };
    }

    const underdogPercentage = Math.round((underdogPicks / totalVotes) * 100);

    if (underdogPercentage >= 40) {
        return {
            icon: '<i class="fa-solid fa-mask"></i>',
            emoji: '🎭',
            title: 'Rebel Voter',
            description: `You champion the underdog ${underdogPercentage}% of the time!`
        };
    }
    if (majorityAlignment >= 70) {
        return {
            icon: '<i class="fa-solid fa-bullseye"></i>',
            emoji: '🎯',
            title: 'Mainstream Maven',
            description: `Your taste aligns with the crowd ${majorityAlignment}% of the time`
        };
    }
    if (majorityAlignment >= 55) {
        return {
            icon: '<i class="fa-solid fa-scale-balanced"></i>',
            emoji: '⚖️',
            title: 'Balanced Critic',
            description: 'You have your own taste but appreciate popular picks too'
        };
    }
    if (underdogPercentage >= 25) {
        return {
            icon: '<i class="fa-solid fa-compass"></i>',
            emoji: '🧭',
            title: 'Independent Voter',
            description: 'You march to the beat of your own drum'
        };
    }
    return {
        icon: '<i class="fa-solid fa-film"></i>',
        emoji: '🎞️',
        title: 'Arcane Enthusiast',
        description: 'You appreciate all kinds of Arcane edits'
    };
}

export function computeInsights(enriched) {
    const totalVotes = enriched.length;
    const underdogPicks = enriched.filter(v => v.voteType === 'underdog').length;
    const mainstreamPicks = enriched.filter(v => v.voteType === 'mainstream').length;
    const closeCalls = enriched.filter(v => v.pct >= 45 && v.pct <= 55).length;
    const influentialVotes = enriched.filter(
        v => v.isCompleted && v.marginPct !== null && v.marginPct <= 5
    ).length;

    // Per-edit journey: one entry per edit the voter has backed
    const edits = new Map();
    enriched.forEach(v => {
        if (!edits.has(v.editId)) {
            edits.set(v.editId, {
                id: v.editId,
                name: v.editName,
                videoId: v.videoId,
                count: 0,
                status: 'active'
            });
        }
        const e = edits.get(v.editId);
        e.count++;
        if (v.editStatus === 'eliminated') e.status = 'eliminated';
        else if (v.editStatus === 'advanced' && e.status !== 'eliminated') e.status = 'advanced';
    });

    const editList = [...edits.values()];
    const editsStillAlive = editList.filter(e => e.status !== 'eliminated').length;
    const editsAdvanced = editList.filter(e => e.status === 'advanced').length;
    const favoriteEdit = [...editList].sort((a, b) => b.count - a.count)[0] || null;

    const roundsParticipated = new Set(enriched.map(v => v.round)).size;
    const furthestRound = enriched.length ? Math.max(...enriched.map(v => v.round)) : 0;

    const majorityAlignment = totalVotes > 0
        ? Math.round((mainstreamPicks / totalVotes) * 100)
        : 0;

    return {
        totalVotes,
        underdogPicks,
        mainstreamPicks,
        closeCalls,
        influentialVotes,
        votingStreak: calculateVotingStreak(enriched),
        editsStillAlive,
        editsAdvanced,
        roundsParticipated,
        furthestRound,
        favoriteEdit,
        tasteProfile: getTasteProfile(majorityAlignment, totalVotes, underdogPicks)
    };
}

// ----------------------------------------
// SHARE IMAGE
// ----------------------------------------

let generatorPromise = null;

function loadStatsImageGenerator() {
    if (window.generateAndShareStats) return Promise.resolve();
    if (!generatorPromise) {
        generatorPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/js/stats-image-generator.js';
            script.onload = resolve;
            script.onerror = () => {
                generatorPromise = null;
                reject(new Error('Could not load stats image generator'));
            };
            document.head.appendChild(script);
        });
    }
    return generatorPromise;
}

async function shareStatsImage(insights) {
    // Shape expected by generateAndShareStats() in stats-image-generator.js
    const statsData = {
        totalVotes: insights.totalVotes,
        underdogPicks: insights.underdogPicks,
        mainstreamPicks: insights.mainstreamPicks,
        songsStillAlive: insights.editsStillAlive, // key name kept for the generator
        votingStreak: insights.votingStreak,
        roundsParticipated: insights.roundsParticipated,
        tasteProfile: {
            icon: insights.tasteProfile.emoji, // canvas can't draw Font Awesome
            title: insights.tasteProfile.title,
            description: insights.tasteProfile.description
        },
        favoriteSong: insights.favoriteEdit ? {
            name: insights.favoriteEdit.name,
            thumbnailUrl: `https://img.youtube.com/vi/${insights.favoriteEdit.videoId}/mqdefault.jpg`,
            voteCount: insights.favoriteEdit.count
        } : null
    };

    await loadStatsImageGenerator();
    await window.generateAndShareStats(statsData);
}

// ----------------------------------------
// RENDER
// ----------------------------------------

function statTile(icon, value, label) {
    return `
        <div class="insight-tile">
            <i class="fas ${icon}"></i>
            <div class="insight-value">${value}</div>
            <div class="insight-label">${label}</div>
        </div>
    `;
}

/**
 * Renders the owner-only "Your Voting Style" panel into `container`.
 * votes: [{ choice, matchId, timestamp, match }]
 */
export function renderOwnerInsights(container, votes) {
    if (!container) return;

    const enriched = enrichVotes(votes);

    if (enriched.length === 0) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    const insights = computeInsights(enriched);

    container.innerHTML = `
        <div class="insights-header">
            <div class="insights-title">
                <h3 class="section-title"><i class="fas fa-chart-pie"></i> Your Voting Style</h3>
                <p class="insights-subtitle">Only you can see this section.</p>
            </div>
            <button type="button" class="share-stats-btn" id="shareStatsBtn">
                <i class="fas fa-share-alt"></i> Generate Stats Image
            </button>
        </div>

        <div class="insights-taste">
            <span class="insights-taste-icon">${insights.tasteProfile.icon}</span>
            <div>
                <div class="insights-taste-title">${insights.tasteProfile.title}</div>
                <div class="insights-taste-desc">${insights.tasteProfile.description}</div>
            </div>
        </div>

        <div class="insights-grid">
            ${statTile('fa-mask', insights.underdogPicks, 'Underdog picks')}
            ${statTile('fa-bullseye', insights.mainstreamPicks, 'Mainstream picks')}
            ${statTile('fa-hand-holding-heart', insights.closeCalls, 'Close calls')}
            ${statTile('fa-bolt', insights.influentialVotes, 'Influential votes')}
            ${statTile('fa-fire', insights.votingStreak, 'Day streak')}
            ${statTile('fa-circle-check', insights.editsStillAlive, 'Edits still alive')}
            ${statTile('fa-arrow-up', insights.editsAdvanced, 'Edits advanced')}
            ${statTile('fa-layer-group', insights.furthestRound, 'Furthest round')}
        </div>
    `;
    container.hidden = false;

    const btn = container.querySelector('#shareStatsBtn');
    btn.addEventListener('click', async () => {
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        try {
            await shareStatsImage(insights);
        } catch (error) {
            console.error('❌ Stats image failed:', error);
            alert('Could not generate the stats image. Please refresh and try again.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });
}
