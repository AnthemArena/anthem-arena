// ========================================
// MATCH DETAILS MODAL - CLEANED VERSION
// ========================================

// ========================================
// MATCH DATABASE
// ========================================

// HARDCODED MATCHES: Used for featured/promotional matches
// For bracket matches, use window.matchDatabase (populated by brackets.js)
const matchDatabase = {
    'featured-match': {
        id: 'featured-match',
        tournament: 'Worlds Anthems',
        round: 'Featured Match',
        date: 'January 15, 2025',
        status: 'live',
        competitor1: {
            name: 'Warriors',
            seed: 1,
            source: '2014 World Championship',
            videoId: 'fmI_Ndrxy14',
            votes: 3041,
            percentage: 52,
            winner: false
        },
        competitor2: {
            name: 'RISE',
            seed: 2,
            source: '2018 World Championship',
            videoId: '3Wz1OxmlXek',
            votes: 2806,
            percentage: 48,
            winner: false
        },
        totalVotes: 5847
    }
    // Add other hardcoded matches if needed
};

// ========================================
// MODAL FUNCTIONS
// ========================================

// Show match details modal
function showMatchDetails(matchId) {
    console.log('Opening match details for:', matchId);
    
    // Check window.matchDatabase first (dynamic), then fallback to hardcoded
    const match = window.matchDatabase?.[matchId] || matchDatabase[matchId];
    
    if (!match) {
        console.error('Match not found:', matchId);
        console.log('Dynamic matches:', Object.keys(window.matchDatabase || {}));
        console.log('Hardcoded matches:', Object.keys(matchDatabase || {}));
        showNotification('Match details not available', 'error');
        return;
    }
    
    // Create modal HTML
    const modalHTML = createModalHTML(match);
    
    // Check if modal already exists
    let modal = document.getElementById('match-modal');
    if (modal) {
        modal.remove();
    }
    
    // Insert modal into page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Get the new modal
    modal = document.getElementById('match-modal');
    
    // Show modal with animation
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Set up event listeners
    setupModalListeners(modal);
    
    // Start countdown if needed
    if (match.date && (match.status === 'upcoming' || match.status === 'live')) {
        startModalCountdown(match);
    }
}

// Create modal HTML structure
function createModalHTML(match) {
    // Status badge
    const statusBadge = match.status === 'completed' 
        ? '<span class="modal-badge completed">✓ Completed</span>'
        : match.status === 'live'
        ? '<span class="modal-badge live">🔴 Live Now</span>'
        : '<span class="modal-badge upcoming">📅 Upcoming</span>';
    
    // Check if user has voted
// ✅ NEW:
const ACTIVE_TOURNAMENT = '2025-worlds-anthems';
const userVote = localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${match.id}`);
    const hasVoted = !!userVote;
    
    // Determine which competitor user voted for
    let votedForName = '';
    if (userVote) {
        const comp1Id = match.competitor1.name.toLowerCase().replace(/\s+/g, '-');
        const comp2Id = match.competitor2.name.toLowerCase().replace(/\s+/g, '-');
        
        if (userVote === comp1Id) {
            votedForName = match.competitor1.name;
        } else if (userVote === comp2Id) {
            votedForName = match.competitor2.name;
        } else {
            // Fallback: try matching directly
            votedForName = userVote;
        }
    }
    
    // Vote button logic
    const voteButton = match.status === 'live' 
        ? `<a href="vote.html?match=${match.id}" class="modal-vote-btn ${hasVoted ? 'voted' : 'primary'}">
             ${hasVoted ? `✅ You Voted: ${votedForName}` : '🎵 Cast Your Vote'}
           </a>`
        : match.status === 'upcoming'
        ? `<div class="modal-vote-btn disabled">Voting Opens Soon</div>`
        : `<a href="matches.html?match=${match.id}" class="modal-vote-btn secondary">View Full Results</a>`;
    
    // Format date nicely
    const formattedDate = match.date 
        ? new Date(match.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
    
    return `
<div id="match-modal" class="match-modal">
    <div class="modal-overlay">
        <div class="modal-container">
            <button class="modal-close" onclick="closeMatchModal()" aria-label="Close modal">×</button>
            
            <div class="modal-header">
                <div class="modal-match-info">
                    ${statusBadge}
                    <span class="modal-badge">${match.tournament}</span>
                    <span class="modal-badge">${match.round}</span>
                </div>
                <h2 class="modal-title">${match.status === 'completed' ? 'Match Results' : 'Match Preview'}</h2>
<p class="modal-meta">
    ${match.status === 'completed' ? `${match.totalVotes.toLocaleString()} total votes` : match.status === 'live' ? `🔴 Live Now - Cast Your Vote!` : 'Coming Soon'}
    ${formattedDate ? ' • ' + formattedDate : ''}
</p>                
                ${match.date && (match.status === 'upcoming' || match.status === 'live') ? `
                    <p class="modal-countdown" id="modal-countdown-${match.id}"></p>
                ` : ''}
            </div>
            
            <div class="modal-body">
                <div class="modal-competitors">
                    <!-- Competitor 1 -->
                    <div class="modal-competitor ${match.competitor1.winner ? 'winner' : ''} ${match.competitor1.percentage > match.competitor2.percentage ? 'leading' : ''}">
                        <div class="competitor-header-modal">
                            <span class="competitor-seed-modal">#${match.competitor1.seed} Seed</span>
                            <h3 class="competitor-name-modal">${match.competitor1.name}</h3>
                            <p class="competitor-source-modal">${match.competitor1.source}</p>
                        </div>
                        
                        <!-- Video Thumbnail (clickable link to vote page) -->
                        <a href="vote.html?match=${match.id}" class="modal-video-thumbnail">
                            <img src="https://img.youtube.com/vi/${match.competitor1.videoId}/hqdefault.jpg" 
                                 alt="${match.competitor1.name}"
                                 loading="lazy">
                            <div class="play-overlay">
                                <span class="play-icon">🎵</span>
                                <span class="play-text">Watch & Vote</span>
                            </div>
                        </a>
                        
             <div class="modal-result">
    ${match.status === 'completed' ? `
        <div class="result-bar-container">
            <div class="result-bar" style="width: ${match.competitor1.percentage}%"></div>
        </div>
        <div class="result-stats">
            <span class="result-percentage">${match.competitor1.percentage}%</span>
            <span class="result-label">${match.competitor1.votes.toLocaleString()} votes</span>
        </div>
        ${match.competitor1.winner ? '<span class="result-winner-badge">🏆 Winner</span>' : ''}
    ` : match.status === 'live' ? `
        <div class="modal-hidden-results">
            <p class="hidden-results-text">🔒 Vote to see results</p>
        </div>
    ` : `
        <div class="modal-hidden-results">
            <p class="hidden-results-text">⏰ Results available after voting opens</p>
        </div>
    `}
</div>
                    </div>
                    
                    <!-- VS Divider -->
                    <div class="modal-vs">
                        <div class="modal-vs-circle">VS</div>
                    </div>
                    
                    <!-- Competitor 2 -->
                    <div class="modal-competitor ${match.competitor2.winner ? 'winner' : ''} ${match.competitor2.percentage > match.competitor1.percentage ? 'leading' : ''}">
                        <div class="competitor-header-modal">
                            <span class="competitor-seed-modal">#${match.competitor2.seed} Seed</span>
                            <h3 class="competitor-name-modal">${match.competitor2.name}</h3>
                            <p class="competitor-source-modal">${match.competitor2.source}</p>
                        </div>
                        
                        <!-- Video Thumbnail (clickable link to vote page) -->
                        <a href="vote.html?match=${match.id}" class="modal-video-thumbnail">
                            <img src="https://img.youtube.com/vi/${match.competitor2.videoId}/hqdefault.jpg" 
                                 alt="${match.competitor2.name}"
                                 loading="lazy">
                            <div class="play-overlay">
                                <span class="play-icon">🎵</span>
                                <span class="play-text">Watch & Vote</span>
                            </div>
                        </a>
                        
<div class="modal-result">
    ${match.status === 'completed' ? `
        <div class="result-bar-container">
            <div class="result-bar" style="width: ${match.competitor2.percentage}%"></div>
        </div>
        <div class="result-stats">
            <span class="result-percentage">${match.competitor2.percentage}%</span>
            <span class="result-label">${match.competitor2.votes.toLocaleString()} votes</span>
        </div>
        ${match.competitor2.winner ? '<span class="result-winner-badge">🏆 Winner</span>' : ''}
    ` : match.status === 'live' ? `
        <div class="modal-hidden-results">
            <p class="hidden-results-text">🔒 Vote to see results</p>
        </div>
    ` : `
        <div class="modal-hidden-results">
            <p class="hidden-results-text">⏰ Results available after voting opens</p>
        </div>
    `}
</div>
</div>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div class="modal-actions">
                    ${voteButton}
                    <button class="modal-btn secondary" onclick="closeMatchModal()">Back to Bracket</button>
                </div>
            </div>
        </div>
    </div>
</div>
`;
}

// ========================================
// START MODAL COUNTDOWN
// ========================================

function startModalCountdown(match) {
    const elem = document.getElementById(`modal-countdown-${match.id}`);
    if (!elem) return;
    
    const status = match.status;
    const startTime = new Date(match.date).getTime();
    const endTime = match.endTime ? new Date(match.endTime).getTime() : null;
    
    const interval = setInterval(() => {
        const now = new Date().getTime();
        
        // UPCOMING: Show countdown to when voting opens
        if (status === 'upcoming') {
            const remaining = startTime - now;
            
            if (remaining <= 0) {
                clearInterval(interval);
                elem.textContent = '🔴 Voting is LIVE!';
                elem.style.color = '#00ff00';
                return;
            }
            
            const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            
            if (days > 0) {
                elem.textContent = `⏰ Opens in ${days}d ${hours}h ${minutes}m`;
                elem.style.color = '#667eea';
            } else if (hours > 0) {
                elem.textContent = `⏰ Opens in ${hours}h ${minutes}m`;
                elem.style.color = '#667eea';
            } else {
                elem.textContent = `🔥 Opens in ${minutes}m!`;
                elem.style.color = '#ffaa00';
                elem.style.fontWeight = 'bold';
            }
        }
        
        // LIVE: Show countdown to when voting closes
        else if (status === 'live' && endTime) {
            const remaining = endTime - now;
            
            if (remaining <= 0) {
                clearInterval(interval);
                elem.textContent = '⏱️ Voting Closed';
                elem.style.color = '#999';
                return;
            }
            
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
            
            if (hours > 0) {
                elem.textContent = `⏰ ${hours}h ${minutes}m left to vote`;
                elem.style.color = '#667eea';
            } else if (minutes > 30) {
                elem.textContent = `⏰ ${minutes}m ${seconds}s left to vote`;
                elem.style.color = '#ffaa00';
            } else {
                elem.textContent = `🚨 ${minutes}m ${seconds}s left to vote!`;
                elem.style.color = '#ff4444';
                elem.style.fontWeight = 'bold';
            }
        }
        
    }, 1000);
    
    // Store interval ID so we can clear it when modal closes
    if (elem) {
        elem.dataset.countdownInterval = interval;
    }
}

// Set up modal event listeners
function setupModalListeners(modal) {
    // Close on overlay click
    const overlay = modal.querySelector('.modal-overlay');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeMatchModal();
        }
    });
    
    // Close on ESC key
    document.addEventListener('keydown', handleEscKey);
}

// Handle ESC key press
function handleEscKey(e) {
    if (e.key === 'Escape') {
        closeMatchModal();
    }
}

// Close modal
function closeMatchModal() {
    const modal = document.getElementById('match-modal');
    if (!modal) return;
    
    // Clear countdown interval if it exists
    const countdownElem = modal.querySelector('.modal-countdown');
    if (countdownElem && countdownElem.dataset.countdownInterval) {
        clearInterval(parseInt(countdownElem.dataset.countdownInterval));
    }
    
    // Remove active class
    modal.classList.remove('active');
    
    // Remove from DOM after animation
    setTimeout(() => {
        modal.remove();
        document.body.style.overflow = '';
        document.removeEventListener('keydown', handleEscKey);
    }, 300);
}

// Show notification (helper function)
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // Add toast notification here if you have one
}

console.log('✅ Modal.js loaded (cleaned version - no YouTube API)');