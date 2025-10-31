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
    const userVote = localStorage.getItem(`vote_${match.id}`);
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
        ? `<a href="vote.html?match=${match.id}" class="modal-vote-btn primary">
             ${hasVoted ? '🔄 Change Your Vote' : '🎵 Cast Your Vote'}
           </a>`
        : match.status === 'upcoming'
        ? `<div class="modal-vote-btn disabled">Voting Opens Soon</div>`
        : `<a href="matches.html?match=${match.id}" class="modal-vote-btn secondary">View Full Results</a>`;
    
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
                    <p class="modal-meta">${match.totalVotes.toLocaleString()} total votes${match.date ? ' • ' + match.date : ''}</p>
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
                                <div class="result-bar-container">
                                    <div class="result-bar" style="width: ${match.competitor1.percentage}%"></div>
                                </div>
                                <div class="result-stats">
                                    <span class="result-percentage">${match.competitor1.percentage}%</span>
                                    <span class="result-label">${match.competitor1.votes.toLocaleString()} votes</span>
                                </div>
                                ${match.competitor1.winner ? '<span class="result-winner-badge">🏆 Winner</span>' : ''}
                                ${!match.competitor1.winner && match.competitor1.percentage > match.competitor2.percentage && match.status === 'live' ? '<span class="result-leading-badge">📈 Leading</span>' : ''}
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
                                <div class="result-bar-container">
                                    <div class="result-bar" style="width: ${match.competitor2.percentage}%"></div>
                                </div>
                                <div class="result-stats">
                                    <span class="result-percentage">${match.competitor2.percentage}%</span>
                                    <span class="result-label">${match.competitor2.votes.toLocaleString()} votes</span>
                                </div>
                                ${match.competitor2.winner ? '<span class="result-winner-badge">🏆 Winner</span>' : ''}
                                ${!match.competitor2.winner && match.competitor2.percentage > match.competitor1.percentage && match.status === 'live' ? '<span class="result-leading-badge">📈 Leading</span>' : ''}
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