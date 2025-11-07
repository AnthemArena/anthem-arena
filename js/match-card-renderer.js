// ========================================
// SHARED MATCH CARD RENDERER
// Used by: homepage.js, matches.js
// ========================================

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

    const cardHTML = `
        <div class="match-card ${statusClass} ${match.hasVoted ? 'user-voted' : ''}" 
             data-tournament="${match.tournament}" 
             data-round="${match.round}" 
             data-status="${match.status}"
             data-match-id="${match.id}"
             data-date="${match.date || ''}"
             data-match-title="${match.competitor1.name} vs ${match.competitor2.name}"
             style="cursor: pointer;">
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
    card.addEventListener('click', (e) => {
        // Don't navigate if clicking directly on a button (let button handlers fire)
        if (e.target.closest('button')) return;
        
        // Navigate to vote page
        window.location.href = `/vote.html?match=${match.id}`;
    });
    
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
        // ✅ Only show vote count if user already voted
        if (showVoteData) {
            statsHtml += `
                <span class="stat"><i class="fas fa-chart-bar"></i> ${match.totalVotes.toLocaleString()} votes</span>
                <span class="stat"><i class="fas fa-clock"></i> ${match.timeLeft || 'Voting open'}</span>
            `;
        } else {
            // ✅ Show generic "Voting open" message without counts
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