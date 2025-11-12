// ========================================
// SHARED MATCH CARD RENDERER
// Used by: homepage.js, matches.js
// ========================================

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
            text: '⏱️ Voting Closed',
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
            text: `🚨 ${minutes}m left to vote!`,
            color: '#ff4444',
            urgent: true,
            expired: false
        };
    }
    
    // Urgent (< 6 hours)
    if (days === 0 && hours < 6) {
        return {
            text: `🔥 ${hours}h ${minutes}m left`,
            color: '#ff4444',
            urgent: true,
            expired: false
        };
    }
    
    // Moderate (< 24 hours)
    if (days === 0) {
        return {
            text: `⏰ ${hours}h ${minutes}m left`,
            color: '#ffaa00',
            urgent: false,
            expired: false
        };
    }
    
    // Calm (1+ days)
    return {
        text: `⏰ ${days}d ${hours}h left`,
        color: '#667eea',
        urgent: false,
        expired: false
    };
}

// ========================================
// CALCULATE POTENTIAL XP FOR MATCH
// ========================================

function calculatePotentialMatchXP(match) {
    // Base XP (from rank-system.js)
    const baseXP = 10;
    let totalXP = baseXP;
    const bonuses = [];
    
    // Check if first vote today
    const lastVoteDate = localStorage.getItem('lastVoteDate');
    const today = new Date().toISOString().split('T')[0];
    if (lastVoteDate !== today) {
        totalXP += 25;
        bonuses.push({ icon: '🌅', label: 'First vote today', xp: 25 });
    }
    
    // Check if close match (within 10% margin)
    const diff = Math.abs(match.competitor1.percentage - match.competitor2.percentage);
    if (diff <= 10 && match.totalVotes > 0) {
        totalXP += 10;
        bonuses.push({ icon: '⚡', label: 'Close match', xp: 10 });
    }
    
    // Check if early voter (less than 50 total votes)
    if (match.totalVotes < 50) {
        totalXP += 5;
        bonuses.push({ icon: '🎯', label: 'Early voter', xp: 5 });
    }
    
    return {
        totalXP,
        baseXP,
        bonuses,
        hasBonuses: bonuses.length > 0
    };
}

export function createMatchCard(match) {
    const statusClass = match.status;
    const statusBadge = getStatusBadge(match);
    const footerContent = getFooterContent(match);
    
    // ✅ Show percentages if user voted OR match is completed
    const showPercentages = match.hasVoted || match.status === 'completed';
    
    // Generate thumbnail URLs
    const comp1Thumbnail = match.competitor1.videoId 
        ? `https://img.youtube.com/vi/${match.competitor1.videoId}/mqdefault.jpg`
        : '';
    const comp2Thumbnail = match.competitor2.videoId 
        ? `https://img.youtube.com/vi/${match.competitor2.videoId}/mqdefault.jpg`
        : '';

   // ✅ CALCULATE XP REWARD (only for unvoted live matches)
// ✅ CALCULATE XP REWARD (only for unvoted live matches)
let xpBadgeHTML = '';
if (!match.hasVoted && match.status === 'live') {
    const xpData = calculatePotentialMatchXP(match);
    
    xpBadgeHTML = `
        <div class="xp-reward-badge">
            <span class="xp-icon">⭐</span>
            <span class="xp-value">+${xpData.totalXP} XP</span>
            ${xpData.hasBonuses ? '<span class="xp-bonus-indicator">🔥</span>' : ''}
        </div>
    `;
}

const cardHTML = `
    <div class="match-card ${statusClass} ${match.hasVoted ? 'user-voted' : ''}" 
         data-tournament="${match.tournament}" 
         data-round="${match.round}" 
         data-status="${match.status}"
         data-match-id="${match.id}"
         data-date="${match.date || ''}"
         data-match-title="${match.competitor1.name} vs ${match.competitor2.name}"
         style="cursor: pointer;">
    
    ${xpBadgeHTML}
    
    <div class="match-header">
        <span class="match-tournament">${formatTournamentName(match.tournament)}</span>
        <span class="match-round">${formatRoundName(match.round)}</span>
        ${match.hasVoted && match.status === 'live' 
            ? '<span class="voted-badge">✓ Voted</span>' 
            : statusBadge
        }
    </div>
            
            <div class="match-competitors">
                <div class="competitor ${getCompetitorClass(match.competitor1, match.status)}">
                    ${comp1Thumbnail ? `
                        <img src="${comp1Thumbnail}" 
                             alt="${match.competitor1.name}" 
                             class="competitor-thumbnail"
                             loading="lazy">
                    ` : ''}
                    <div class="competitor-rank">#${match.competitor1.seed}</div>
                    <div class="competitor-details">
                        <h3 class="competitor-title">${match.competitor1.name}</h3>
                        <p class="competitor-source">${match.competitor1.source}</p>
                    </div>
                    <div class="competitor-result">
                        ${showPercentages ? `
                            <span class="vote-percentage">${formatPercentage(match.competitor1.percentage)}</span>
                        ` : match.status === 'completed' ? `
                            <span class="vote-percentage">${formatPercentage(match.competitor1.percentage)}</span>
                            ${getResultBadge(match.competitor1, match.status)}
                        ` : ''}
                    </div>
                </div>

                <div class="vs-divider">VS</div>

                <div class="competitor ${getCompetitorClass(match.competitor2, match.status)}">
                    ${comp2Thumbnail ? `
                        <img src="${comp2Thumbnail}" 
                             alt="${match.competitor2.name}" 
                             class="competitor-thumbnail"
                             loading="lazy">
                    ` : ''}
                    <div class="competitor-rank">#${match.competitor2.seed}</div>
                    <div class="competitor-details">
                        <h3 class="competitor-title">${match.competitor2.name}</h3>
                        <p class="competitor-source">${match.competitor2.source}</p>
                    </div>
                    <div class="competitor-result">
                        ${showPercentages ? `
                            <span class="vote-percentage">${formatPercentage(match.competitor2.percentage)}</span>
                        ` : match.status === 'completed' ? `
                            <span class="vote-percentage">${formatPercentage(match.competitor2.percentage)}</span>
                            ${getResultBadge(match.competitor2, match.status)}
                        ` : ''}
                    </div>
                </div>
            </div>

            ${footerContent}
        </div>
    `;

    // ✅ Create element and add click handler
    const wrapper = document.createElement('div');
    wrapper.innerHTML = cardHTML;
    const card = wrapper.firstElementChild;
    
    // ✅ Make entire card clickable
   // ✅ Make entire card clickable
card.addEventListener('click', () => {
    window.location.href = `/vote.html?match=${match.id}`;
});

// ✅ Add specific button handlers with stopPropagation
const voteButton = card.querySelector('.vote-now-btn');
const viewResultsButton = card.querySelector('.view-results-btn');
const viewDetailsButton = card.querySelector('.view-details-btn');

if (voteButton) {
    voteButton.addEventListener('click', (e) => {
        e.stopPropagation();  // Prevent card click
        window.location.href = `/vote.html?match=${match.id}`;
    });
}

if (viewResultsButton) {
    viewResultsButton.addEventListener('click', (e) => {
        e.stopPropagation();  // Prevent card click
        window.location.href = `/vote.html?match=${match.id}`;
    });
}

if (viewDetailsButton) {
    viewDetailsButton.addEventListener('click', (e) => {
        e.stopPropagation();  // Prevent card click
        window.location.href = `/vote.html?match=${match.id}`;
    });
}
    
    return card;
}

// Helper functions
function getStatusBadge(match) {
    if (match.status === 'live') {
        return '<span class="live-badge">🔴 Live</span>';
    } else if (match.status === 'upcoming') {
        return '<span class="upcoming-badge">Upcoming</span>';
    } else if (match.status === 'completed') {
        return '<span class="finished-badge">Finished</span>';
    }
    return '';
}

function getCompetitorClass(competitor, status) {
    if (status === 'completed' && competitor.winner) {
        return 'winner';
    } else if (status === 'live' && competitor.leading) {
        return 'leading';
    }
    return '';
}

function getResultBadge(competitor, status) {
    if (status === 'completed' && competitor.winner) {
        return '<span class="winner-badge">Winner</span>';
    }
    // Don't show leading badge for live matches (hides who's winning)
    return '';
}

function getFooterContent(match) {
    // ✅ Determine if we should show vote counts
    const showVoteData = match.hasVoted || match.status === 'completed';
    
    let statsHtml = '<div class="match-stats">';
    
    if (match.status === 'completed') {
        statsHtml += `
            <span class="stat"><i class="fas fa-chart-bar"></i> ${match.totalVotes.toLocaleString()} votes</span>
            <span class="stat"><i class="far fa-calendar"></i> ${formatDate(match.date)}</span>
        `;
    } else if (match.status === 'live') {
        // ✅ Get countdown timer
        const timer = match.endDate ? getTimeRemaining(match.endDate) : null;
        
        // Only show vote count if user already voted
        if (showVoteData) {
            statsHtml += `
                <span class="stat"><i class="fas fa-chart-bar"></i> ${match.totalVotes.toLocaleString()} votes</span>
            `;
        }
        
        // ✅ Show timer if available
        if (timer && !timer.expired) {
            statsHtml += `
                <span class="stat timer ${timer.urgent ? 'urgent' : ''}" 
                      style="color: ${timer.color}; font-weight: 600;">
                    ${timer.text}
                </span>
            `;
        } else if (timer && timer.expired) {
            statsHtml += `
                <span class="stat" style="color: #999;">
                    ${timer.text}
                </span>
            `;
        } else {
            // Fallback if no endDate
            statsHtml += `
                <span class="stat"><i class="fas fa-clock"></i> ${match.timeLeft || 'Voting open'}</span>
            `;
        }
    } else if (match.status === 'upcoming') {
        statsHtml += `<span class="stat"><i class="far fa-clock"></i> Scheduled</span>`;
    }
    
    statsHtml += '</div>';

    let buttonHtml = '';
    if (match.status === 'completed') {
        buttonHtml = `<button class="view-details-btn"><i class="fas fa-eye"></i> View Details</button>`;
    } else if (match.status === 'live') {
        // ✅ Check if user voted
        if (match.hasVoted) {
            buttonHtml = `<button class="view-results-btn voted"><i class="fas fa-check-circle"></i> View Results</button>`;
        } else {
            buttonHtml = `<button class="vote-now-btn"><i class="fas fa-vote-yea"></i> Vote Now</button>`;
        }
    } else if (match.status === 'upcoming') {
        const timeUntil = getTimeUntilMatch(match.date);
        
        if (timeUntil === 'Starting Soon') {
            buttonHtml = `<span class="starting-soon-badge urgent"><i class="far fa-clock"></i> Starting Soon</span>`;
        } else if (timeUntil === 'Coming Soon') {
            buttonHtml = `<span class="starting-soon-badge"><i class="far fa-clock"></i> Coming Soon</span>`;
        } else {
            buttonHtml = `<span class="starting-soon-badge countdown"><i class="far fa-clock"></i> ${timeUntil}</span>`;
        }
    }

    return `
        <div class="match-footer">
            ${statsHtml}
            ${buttonHtml}
        </div>
    `;
}

function getTimeUntilMatch(dateString) {
    if (!dateString) return 'Coming Soon';
    
    const matchDate = new Date(dateString);
    const now = new Date();
    const diff = matchDate - now;
    
    if (diff < 0) return 'Starting Soon';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `Starts in ${days}d ${hours}h`;
    if (hours > 0) return `Starts in ${hours}h`;
    return 'Starting Soon';
}

function formatTournamentName(tournament) {
    const names = {
        'anthem-arena-championship': 'Anthem Arena Championship S1',
        '2025-worlds-anthems': 'Anthem Arena Championship S1',
        'Anthems Arena Championship': 'Anthem Arena Championship S1',
        'Anthem Arena Championship': 'Anthem Arena Championship S1'
    };
    return names[tournament] || tournament;
}

function formatRoundName(round) {
    const names = {
        'finals': 'Finals',
        'semifinals': 'Semifinals',
        'quarterfinals': 'Quarterfinals',
        'round-1': 'Round 1',
        'round-2': 'Round 2',
        'round-3': 'Round 3'
    };
    return names[round] || round;
}

function formatPercentage(percentage) {
    return percentage !== null && percentage !== undefined ? `${percentage}%` : '—';
}

function formatDate(dateString) {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export {
    getStatusBadge,
    getCompetitorClass,
    getResultBadge,
    getFooterContent,
    formatTournamentName,
    formatRoundName,
    formatPercentage,
    formatDate
};