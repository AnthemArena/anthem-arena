// ========================================
// PROFILE INSIGHTS (owner-only)
// Voting-style stats + shareable stats image.
// Ported from the retired My Votes page. Every helper takes the vote
// list as an argument instead of reading page-level state.
// ========================================

import { standingBand } from './vote-facts.js';

// Voting Style needs this many closed (decided) votes before its numbers mean anything
export const MIN_CLOSED_VOTES_FOR_STYLE = 5;

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

            const voteType = standingBand(pct, total);   // the one set of bands (js/vote-facts.js)

            const isCompleted = m.status ? m.status === 'completed' : !!m.winnerId;   // a re-opened match may keep an old winnerId

            let editStatus = 'active';
            if (isCompleted && m.winnerId) {
                editStatus = m.winnerId === chosen.id ? 'advanced' : 'eliminated';
            }

            return {
                matchId: v.matchId,
                timestamp: toMs(v.timestamp),
                round: toRoundNumber(m.round),
                roundLabel: m.roundLabel || '',
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

/** "Group stage" for round 1 of a group cup, otherwise "Round N" (a bare number reads as a count). */
export function roundText(round, label = '') {
    if (/^group/i.test(label || '')) return 'Group stage';
    return `Round ${round}`;
}

export function computeInsights(enriched) {
    const totalVotes = enriched.length;
    const underdogPicks = enriched.filter(v => v.voteType === 'underdog').length;
    const mainstreamPicks = enriched.filter(v => v.voteType === 'mainstream').length;
    const closeCalls = enriched.filter(v => v.voteType === 'closeCall').length;
    const unclassified = enriched.filter(v => v.voteType === 'unclassified').length;   // nobody had voted in the match yet
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
    const furthestLabel = roundText(furthestRound, enriched.find(v => v.round === furthestRound)?.roundLabel);

    // Votes in matches still open: Underdog / Mainstream / Close call use the standings right now, so they can still move
    const liveVotes = enriched.filter(v => !v.isCompleted).length;

    // The shared image never names a pick from a match that is still open
    const closedEdits = new Map();
    enriched.filter(v => v.isCompleted).forEach(v => {
        const e = closedEdits.get(v.editId) || { id: v.editId, name: v.editName, videoId: v.videoId, count: 0 };
        e.count++; closedEdits.set(v.editId, e);
    });
    const shareFavoriteEdit = [...closedEdits.values()].sort((a, b) => b.count - a.count)[0] || null;

    const majorityAlignment = totalVotes > 0
        ? Math.round((mainstreamPicks / totalVotes) * 100)
        : 0;

    return {
        totalVotes,
        underdogPicks,
        mainstreamPicks,
        closeCalls,
        unclassified,
        closedVotes: enriched.filter(v => v.isCompleted).length,
        influentialVotes,
        votingStreak: calculateVotingStreak(enriched),
        editsStillAlive,
        editsAdvanced,
        roundsParticipated,
        furthestRound,
        furthestLabel,
        liveVotes,
        favoriteEdit,
        shareFavoriteEdit,
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

async function shareStatsImage(insights, streak = insights.votingStreak) {
    // Shape expected by generateAndShareStats() in stats-image-generator.js
    const statsData = {
        totalVotes: insights.totalVotes,
        underdogPicks: insights.underdogPicks,
        mainstreamPicks: insights.mainstreamPicks,
        songsStillAlive: insights.editsStillAlive, // key name kept for the generator
        votingStreak: streak,
        roundsParticipated: insights.roundsParticipated,
        tasteProfile: {
            icon: insights.tasteProfile.emoji, // canvas can't draw Font Awesome
            title: insights.tasteProfile.title,
            description: insights.tasteProfile.description
        },
        favoriteSong: insights.shareFavoriteEdit ? {
            name: insights.shareFavoriteEdit.name,
            thumbnailUrl: `https://img.youtube.com/vi/${insights.shareFavoriteEdit.videoId}/mqdefault.jpg`,
            voteCount: insights.shareFavoriteEdit.count
        } : null
    };

    await loadStatsImageGenerator();
    await window.generateAndShareStats(statsData);
}

// ----------------------------------------
// RENDER
// ----------------------------------------

function statTile(icon, value, label, isText = false) {
    return `
        <div class="insight-tile">
            <i class="fas ${icon}"></i>
            <div class="insight-value${isText ? ' is-text' : ''}">${value}</div>
            <div class="insight-label">${label}</div>
        </div>
    `;
}

/** Above the tiles: which numbers are still moving, and why the three pick types may not add up to your votes. */
export function provisionalNote(i) {
    const bits = [];
    if (i.liveVotes) bits.push(`${i.liveVotes} of your votes ${i.liveVotes === 1 ? 'is' : 'are'} in a live match, so Underdog, Mainstream, Close call and Influential vote counts can still change until it closes.`);
    if (i.unclassified) bits.push(`${i.unclassified} ${i.unclassified === 1 ? "isn't" : "aren't"} counted in any of the three pick types yet, because nobody has voted in ${i.unclassified === 1 ? 'that match' : 'those matches'}.`);
    return bits.length ? `<p class="insights-note">Provisional: ${bits.join(' ')}</p>` : '';
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

    const unlocked = insights.closedVotes >= MIN_CLOSED_VOTES_FOR_STYLE;
    // The shared image is built from closed matches only (as the copy says); it needs at least one to show anything real.
    const closedInsights = computeInsights(enriched.filter(v => v.isCompleted));
    const canShare = insights.closedVotes >= 1;
    const waiting = insights.liveVotes ? ` · ${insights.liveVotes} ${insights.liveVotes === 1 ? 'vote' : 'votes'} waiting` : '';

    container.innerHTML = `
        <div class="insights-header">
            <div class="insights-title">
                <h3 class="section-title"><i class="fas fa-chart-pie"></i> Your Voting Style</h3>
                <p class="insights-subtitle">Only you can see this section. "Generate Stats Image" makes a picture you can share; picks from live matches are left out of it.</p>
            </div>
            <button type="button" class="share-stats-btn" id="shareStatsBtn"${canShare ? '' : ' aria-disabled="true" aria-describedby="shareStatsHint"'}>
                <i class="fas fa-share-alt"></i> Generate Stats Image
            </button>
            ${canShare ? '' : '<p class="share-stats-hint" id="shareStatsHint">Available after your first match closes.</p>'}
        </div>

        ${unlocked ? `
        <div class="insights-taste">
            <span class="insights-taste-icon">${insights.tasteProfile.icon}</span>
            <div>
                <div class="insights-taste-title">${insights.tasteProfile.title}</div>
                <div class="insights-taste-desc">${insights.tasteProfile.description}</div>
            </div>
        </div>
        ${provisionalNote(insights)}
        <div class="insights-grid">
            ${statTile('fa-mask', insights.underdogPicks, 'Underdog picks')}
            ${statTile('fa-bullseye', insights.mainstreamPicks, insights.mainstreamPicks === 1 ? 'Mainstream pick' : 'Mainstream picks')}
            ${statTile('fa-hand-holding-heart', insights.closeCalls, insights.closeCalls === 1 ? 'Close call' : 'Close calls')}
            ${statTile('fa-bolt', insights.influentialVotes, 'Influential votes')}
            ${statTile('fa-fire', insights.votingStreak, 'Day streak')}
            ${statTile('fa-circle-check', insights.editsStillAlive, 'Edits still alive')}
            ${statTile('fa-arrow-up', insights.editsAdvanced, 'Edits advanced')}
            ${statTile('fa-layer-group', insights.furthestLabel, 'Furthest round', true)}
        </div>` : `
        <div class="insights-locked" role="status">
            <strong>Voting Style unlocks after ${MIN_CLOSED_VOTES_FOR_STYLE} closed matches.</strong>
            <span>${insights.closedVotes} of ${MIN_CLOSED_VOTES_FOR_STYLE} closed${waiting}</span>
            <span class="insights-locked-bar" role="progressbar" aria-label="Closed matches voted" aria-valuenow="${insights.closedVotes}" aria-valuemin="0" aria-valuemax="${MIN_CLOSED_VOTES_FOR_STYLE}"><span style="width:${Math.round(Math.min(insights.closedVotes, MIN_CLOSED_VOTES_FOR_STYLE) / MIN_CLOSED_VOTES_FOR_STYLE * 100)}%"></span></span>
        </div>`}
    `;
    container.hidden = false;

    const btn = container.querySelector('#shareStatsBtn');
    btn.addEventListener('click', async () => {
        if (btn.getAttribute('aria-disabled') === 'true') return;
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        try {
            await shareStatsImage(closedInsights, insights.votingStreak);
        } catch (error) {
            console.error('❌ Stats image failed:', error);
            alert('Could not generate the stats image. Please refresh and try again.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });
}
