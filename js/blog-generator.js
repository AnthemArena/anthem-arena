// ========================================
// BLOG POST GENERATOR - COMPLETE
// ========================================

import { getCrossTournamentH2H, analyzeMatchContext } from './firebase-stats.js';
import { getAllMatches } from './api-client.js';
import { db } from './firebase-config.js';
import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Load songs data
let songsData = [];
async function loadSongsData() {
    if (songsData.length === 0) {
        const response = await fetch('/data/songs.json');
        songsData = await response.json();
    }
    return songsData;
}

// ========================================
// SONG DATA LOOKUP
// ========================================

function getSongData(seed) {
    return songsData.find(s => s.seed === seed);
}

// ========================================
// GENERATE MATCH RECAP POST
// ========================================

export async function generateMatchRecap(matchId) {
    try {
        await loadSongsData();
        
        const allMatches = await getAllMatches();
        const match = allMatches.find(m => m.matchId === matchId);
        
        if (!match || match.status !== 'completed') {
            throw new Error('Match not found or not completed');
        }
        
        // Get context
        const context = analyzeMatchContext(match);
        const { winner, loser } = context;
        
        // Get song data from JSON
        const winnerData = getSongData(winner.seed);
        const loserData = getSongData(loser.seed);
        
        if (!winnerData || !loserData) {
            throw new Error('Song data not found');
        }
        
        // Get H2H history
        const h2hHistory = await getCrossTournamentH2H(winner.seed, loser.seed);
        
        // Generate content
        const headline = generateHeadline(match, context, winnerData, loserData);
        const content = generateNarrative(match, context, winnerData, loserData, h2hHistory);
        const excerpt = generateExcerpt(match, context, winnerData, loserData);
        
        // Build post object
        const blogPost = {
            id: `match-${matchId}`,
            slug: `${winnerData.slug}-defeats-${loserData.slug}-round-${match.round}`,
            type: 'match-recap',
            status: 'published',
            featured: context.isMajorUpset || context.matchType === 'nailbiter',
            publishedDate: new Date().toISOString(),
            headline: headline,
            subheadline: `${getRoundName(match.round)} | ${winner.shortTitle} ${context.winnerPct}%-${context.loserPct}% ${loser.shortTitle}`,
            excerpt: excerpt,
            author: 'Anthem Arena',
            category: 'Match Recap',
            tags: [
                getRoundName(match.round),
                winnerData.shortTitle,
                loserData.shortTitle,
                context.matchType,
                ...(context.isUpset ? ['Upset'] : []),
                winnerData.seriesCollection,
                loserData.seriesCollection
            ],
            metadata: {
                matchId: matchId,
                round: match.round,
                winnerSeed: winner.seed,
                loserSeed: loser.seed,
                winnerSlug: winnerData.slug,
                loserSlug: loserData.slug,
                finalScore: `${context.winnerPct}-${context.loserPct}`,
                totalVotes: match.totalVotes,
                margin: context.voteDiff,
                matchType: context.matchType,
                isUpset: context.isUpset,
                isMajorUpset: context.isMajorUpset
            },
            content: content,
            relatedSongs: [winnerData.id, loserData.id],
            images: {
                hero: `https://img.youtube.com/vi/${winnerData.videoId}/maxresdefault.jpg`,
                thumbnail: `https://img.youtube.com/vi/${winnerData.videoId}/mqdefault.jpg`,
                loserThumb: `https://img.youtube.com/vi/${loserData.videoId}/mqdefault.jpg`
            }
        };
        
        console.log(`✅ Generated match recap: ${headline}`);
        return blogPost;
        
    } catch (error) {
        console.error('Error generating match recap:', error);
        throw error;
    }
}

// ========================================
// GENERATE ROUND RECAP POST
// ========================================

export async function generateRoundRecap(roundNumber) {
    try {
        await loadSongsData();
        
        const allMatches = await getAllMatches();
        const roundMatches = allMatches.filter(m => 
            m.round === roundNumber && m.status === 'completed'
        );
        
        if (roundMatches.length === 0) {
            throw new Error(`No completed matches found for round ${roundNumber}`);
        }
        
        // Analyze all matches
        const contexts = roundMatches.map(m => ({
            match: m,
            context: analyzeMatchContext(m)
        }));
        
        // Find notable matches
        const upsets = contexts.filter(c => c.context.isUpset)
            .sort((a, b) => b.context.seedDiff - a.context.seedDiff);
        
        const nailbiters = contexts.filter(c => c.context.matchType === 'nailbiter')
            .sort((a, b) => a.context.voteDiff - b.context.voteDiff);
        
        const blowouts = contexts.filter(c => c.context.isBlowout)
            .sort((a, b) => b.context.winnerPct - a.context.winnerPct);
        
        const undefeatedTeams = contexts
            .filter(c => c.context.isUndefeated)
            .map(c => c.context.winner.shortTitle);
        
        // Calculate stats
        const totalVotes = roundMatches.reduce((sum, m) => sum + m.totalVotes, 0);
        const avgVotesPerMatch = Math.round(totalVotes / roundMatches.length);
        const closestMargin = Math.min(...contexts.map(c => c.context.voteDiff));
        const biggestMargin = Math.max(...contexts.map(c => c.context.voteDiff));
        
        // Generate headline
        let headline = `${getRoundName(roundNumber)} Recap: `;
        if (upsets.length >= 3) {
            headline += `${upsets.length} Upsets Rock the Tournament`;
        } else if (nailbiters.length >= 4) {
            headline += `${nailbiters.length} Nail-Biters Keep Fans on Edge`;
        } else {
            headline += `${roundMatches.length} Matches Decided`;
        }
        
        // Generate content
        let content = `# ${headline}\n\n`;
        
        // Opening paragraph
        content += `${getRoundName(roundNumber)} has concluded with **${roundMatches.length} matches** decided and the tournament field narrowed. `;
        content += `A staggering **${totalVotes.toLocaleString()} total votes** were cast, `;
        content += `averaging **${avgVotesPerMatch.toLocaleString()} votes per match**. `;
        
        if (upsets.length > 0) {
            content += `The round was marked by **${upsets.length} upset${upsets.length === 1 ? '' : 's'}**, `;
        }
        if (nailbiters.length > 0) {
            content += `**${nailbiters.length} nail-biter${nailbiters.length === 1 ? '' : 's'}**, `;
        }
        content += `and plenty of drama.\n\n`;
        
        // === BIGGEST UPSETS ===
        if (upsets.length > 0) {
            content += `## 🚨 Biggest Upsets\n\n`;
            
            upsets.slice(0, 3).forEach(({ match, context }, index) => {
                const winnerData = getSongData(context.winner.seed);
                const loserData = getSongData(context.loser.seed);
                
                content += `### ${index + 1}. ${context.winner.shortTitle} (#${context.winner.seed}) defeats ${context.loser.shortTitle} (#${context.loser.seed})\n\n`;
                content += `**Final Score:** ${context.winnerPct}%-${context.loserPct}% `;
                content += `(${context.winner.votes.toLocaleString()}-${context.loser.votes.toLocaleString()})\n\n`;
                
                if (context.isMajorUpset) {
                    content += `In one of the round's biggest shocks, the **#${context.winner.seed} seed** `;
                    content += `${winnerData.year} ${winnerData.seriesCollection} entry toppled `;
                    content += `the **#${context.loser.seed} seed** ${loserData.seriesCollection} anthem. `;
                } else {
                    content += `The ${winnerData.seriesCollection} entry proved the doubters wrong `;
                    content += `with a ${context.intensity} performance. `;
                }
                
                content += `\n\n`;
            });
        }
        
        // === CLOSEST CALLS ===
        if (nailbiters.length > 0) {
            content += `## ⚔️ Nail-Biters\n\n`;
            content += `These matches went down to the wire:\n\n`;
            
            nailbiters.slice(0, 5).forEach(({ match, context }) => {
                content += `- **${context.winner.shortTitle}** edged **${context.loser.shortTitle}** `;
                content += `by just **${context.voteDiff} ${context.voteDiff === 1 ? 'vote' : 'votes'}** `;
                content += `(${context.winnerPct}%-${context.loserPct}%)\n`;
            });
            
            content += `\n`;
        }
        
        // === DOMINANT PERFORMANCES ===
        if (blowouts.length > 0) {
            content += `## 💥 Dominant Performances\n\n`;
            content += `These songs left no doubt:\n\n`;
            
            blowouts.slice(0, 3).forEach(({ match, context }) => {
                const winnerData = getSongData(context.winner.seed);
                content += `- **${context.winner.shortTitle}** crushed **${context.loser.shortTitle}** `;
                content += `**${context.winnerPct}%-${context.loserPct}%** `;
                content += `(${winnerData.seriesCollection})\n`;
            });
            
            content += `\n`;
        }
        
        // === UNDEFEATED WATCH ===
        if (undefeatedTeams.length > 0) {
            content += `## 🔥 Undefeated Watch\n\n`;
            content += `Still perfect through ${getRoundName(roundNumber)}:\n\n`;
            
            undefeatedTeams.forEach(team => {
                content += `- **${team}**\n`;
            });
            
            content += `\n`;
        }
        
        // === FULL RESULTS ===
        content += `## 📊 Complete Results\n\n`;
        
        roundMatches
            .sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0))
            .forEach(match => {
                const ctx = analyzeMatchContext(match);
                content += `**Match ${match.matchNumber || match.matchId}:** `;
                content += `${ctx.winner.shortTitle} def. ${ctx.loser.shortTitle} `;
                content += `(${ctx.winnerPct}-${ctx.loserPct})`;
                
                if (ctx.isUpset) {
                    content += ` 🚨 UPSET`;
                }
                if (ctx.matchType === 'nailbiter') {
                    content += ` ⚔️ THRILLER`;
                }
                
                content += `\n`;
            });
        
        content += `\n`;
        
        // === BY THE NUMBERS ===
        content += `## 📈 By The Numbers\n\n`;
        content += `- **Total votes cast:** ${totalVotes.toLocaleString()}\n`;
        content += `- **Average votes per match:** ${avgVotesPerMatch.toLocaleString()}\n`;
        content += `- **Closest margin:** ${closestMargin} ${closestMargin === 1 ? 'vote' : 'votes'}\n`;
        content += `- **Biggest margin:** ${biggestMargin} votes\n`;
        content += `- **Upsets:** ${upsets.length}\n`;
        content += `- **Nail-biters (≤5 vote margin):** ${nailbiters.length}\n`;
        content += `- **Undefeated teams remaining:** ${undefeatedTeams.length}\n\n`;
        
        // === CLOSING ===
        const nextRound = getRoundName(roundNumber + 1);
        content += `---\n\n`;
        content += `The stakes only get higher in ${nextRound}. `;
        content += `Will the favorites hold serve, or will more upsets shake up the bracket?\n\n`;
        content += `📊 [View Updated Bracket](/brackets.html) | 🗳️ [Vote in ${nextRound}](/live.html) | 📈 [Tournament Stats](/stats.html)`;
        
        // Generate excerpt
        const excerpt = `${getRoundName(roundNumber)} is complete. ${roundMatches.length} matches decided, `;
        excerpt += `${totalVotes.toLocaleString()} votes cast, `;
        excerpt += `${upsets.length} upsets, and ${nailbiters.length} thrillers. Here's everything you need to know.`;
        
        // Build post object
        const blogPost = {
            id: `round-${roundNumber}-recap`,
            slug: `round-${roundNumber}-recap`,
            type: 'round-recap',
            status: 'published',
            featured: true,
            publishedDate: new Date().toISOString(),
            headline: headline,
            subheadline: `${totalVotes.toLocaleString()} votes cast | ${upsets.length} upsets | ${nailbiters.length} thrillers`,
            excerpt: excerpt,
            author: 'Anthem Arena',
            category: 'Round Recap',
            tags: [
                getRoundName(roundNumber),
                'Recap',
                'Tournament',
                ...(upsets.length > 0 ? ['Upsets'] : []),
                ...(nailbiters.length > 0 ? ['Thrillers'] : [])
            ],
            metadata: {
                round: roundNumber,
                totalMatches: roundMatches.length,
                totalVotes: totalVotes,
                avgVotesPerMatch: avgVotesPerMatch,
                upsets: upsets.length,
                nailbiters: nailbiters.length,
                undefeated: undefeatedTeams.length
            },
            content: content,
            relatedMatches: roundMatches.map(m => m.matchId),
            images: {
                hero: '/images/blog/round-recap-hero.jpg', // You can customize this
                thumbnail: '/images/blog/round-recap-thumb.jpg'
            }
        };
        
        console.log(`✅ Generated round recap: ${headline}`);
        return blogPost;
        
    } catch (error) {
        console.error('Error generating round recap:', error);
        throw error;
    }
}

// ========================================
// GENERATE ROUND PREVIEW POST
// ========================================

export async function generateRoundPreview(roundNumber) {
    try {
        await loadSongsData();
        
        const allMatches = await getAllMatches();
        const upcomingMatches = allMatches.filter(m => 
            m.round === roundNumber && m.status === 'live'
        );
        
        if (upcomingMatches.length === 0) {
            throw new Error(`No upcoming matches found for round ${roundNumber}`);
        }
        
        let content = `# ${getRoundName(roundNumber)} Preview\n\n`;
        
        content += `${getRoundName(roundNumber)} is here! **${upcomingMatches.length} matches** will determine `;
        content += `who advances to ${getRoundName(roundNumber + 1)}. Here's what you need to know:\n\n`;
        
        // Highlight featured matchups
        content += `## 🔥 Must-Watch Matchups\n\n`;
        
        upcomingMatches.slice(0, 3).forEach((match, index) => {
            const song1Data = getSongData(match.song1.seed);
            const song2Data = getSongData(match.song2.seed);
            
            content += `### ${index + 1}. ${match.song1.shortTitle} vs. ${match.song2.shortTitle}\n\n`;
            content += `**#${match.song1.seed} ${song1Data.seriesCollection}** vs. **#${match.song2.seed} ${song2Data.seriesCollection}**\n\n`;
            
            // Add storyline
            const seedDiff = Math.abs(match.song1.seed - match.song2.seed);
            if (seedDiff >= 10) {
                content += `Classic David vs. Goliath matchup. `;
            }
            
            content += `${song1Data.artist} (${song1Data.year}) faces ${song2Data.artist} (${song2Data.year}). `;
            content += `\n\n[Vote Now](/vote?match=${match.matchId})\n\n`;
        });
        
        content += `## 📊 All Matchups\n\n`;
        
        upcomingMatches.forEach(match => {
            content += `- **${match.song1.shortTitle}** (#${match.song1.seed}) vs. `;
            content += `**${match.song2.shortTitle}** (#${match.song2.seed})\n`;
        });
        
        content += `\n---\n\n`;
        content += `Voting is now open! Make your picks and shape the tournament.\n\n`;
        content += `🗳️ [Start Voting](/live.html) | 📊 [View Bracket](/brackets.html)`;
        
        const blogPost = {
            id: `round-${roundNumber}-preview`,
            slug: `round-${roundNumber}-preview`,
            type: 'round-preview',
            status: 'published',
            featured: true,
            publishedDate: new Date().toISOString(),
            headline: `${getRoundName(roundNumber)} Preview: ${upcomingMatches.length} Matchups Set`,
            subheadline: `Voting is open — here's what to watch`,
            excerpt: `${getRoundName(roundNumber)} features ${upcomingMatches.length} matchups. From classic rivalries to potential upsets, here's your complete preview.`,
            author: 'Anthem Arena',
            category: 'Round Preview',
            tags: [getRoundName(roundNumber), 'Preview', 'Predictions'],
            metadata: {
                round: roundNumber,
                totalMatches: upcomingMatches.length
            },
            content: content,
            relatedMatches: upcomingMatches.map(m => m.matchId)
        };
        
        console.log(`✅ Generated round preview: ${blogPost.headline}`);
        return blogPost;
        
    } catch (error) {
        console.error('Error generating round preview:', error);
        throw error;
    }
}

export async function saveBlogPost(blogPost) {
    try {
        const blogRef = doc(db, 'blog', blogPost.id);  // ← Changed from 'blog-posts'
        await setDoc(blogRef, blogPost);
        console.log(`✅ Saved blog post to Firebase: ${blogPost.id}`);
        return true;
    } catch (error) {
        console.error('Error saving blog post:', error);
        throw error;
    }
}

export async function getAllBlogPosts(limitCount = 50) {
    try {
        const blogRef = collection(db, 'blog');  // ← Changed from 'blog-posts'
        const q = query(
            blogRef,
            where('published', '==', true),
            orderBy('publishedDate', 'desc'),
            limit(limitCount)
        );
        
        const snapshot = await getDocs(q);
        const posts = [];
        
        snapshot.forEach(doc => {
            posts.push({ id: doc.id, ...doc.data() });
        });
        
        console.log(`✅ Fetched ${posts.length} blog posts from Firebase`);
        return posts;
        
    } catch (error) {
        console.error('Error fetching blog posts:', error);
        return [];
    }
}

export async function getBlogPost(postId) {
    try {
        const blogRef = doc(db, 'blog', postId);  // ← Changed from 'blog-posts'
        const snapshot = await getDoc(blogRef);
        
        if (snapshot.exists()) {
            return { id: snapshot.id, ...snapshot.data() };
        } else {
            throw new Error('Blog post not found');
        }
    } catch (error) {
        console.error('Error fetching blog post:', error);
        throw error;
    }
}

export async function getBlogPostsByType(type, limitCount = 20) {
    try {
        const blogRef = collection(db, 'blog');  // ← Changed from 'blog-posts'
        const q = query(
            blogRef,
            where('published', '==', true),
            where('type', '==', type),
            orderBy('publishedDate', 'desc'),
            limit(limitCount)
        );
        
        const snapshot = await getDocs(q);
        const posts = [];
        
        snapshot.forEach(doc => {
            posts.push({ id: doc.id, ...doc.data() });
        });
        
        return posts;
        
    } catch (error) {
        console.error(`Error fetching ${type} posts:`, error);
        return [];
    }
}

// ========================================
// AUTO-GENERATION TRIGGERS
// ========================================

/**
 * Generate match recap after match completes
 */
export async function autoGenerateMatchRecap(matchId) {
    try {
        console.log(`🤖 Auto-generating match recap for ${matchId}...`);
        
        const blogPost = await generateMatchRecap(matchId);
        await saveBlogPost(blogPost);
        
        console.log(`✅ Auto-generated and saved: ${blogPost.headline}`);
        return blogPost;
        
    } catch (error) {
        console.error('Error in auto-generate match recap:', error);
        return null;
    }
}

/**
 * Generate round recap after all matches in round complete
 */
export async function autoGenerateRoundRecap(roundNumber) {
    try {
        console.log(`🤖 Auto-generating round ${roundNumber} recap...`);
        
        const blogPost = await generateRoundRecap(roundNumber);
        await saveBlogPost(blogPost);
        
        console.log(`✅ Auto-generated and saved: ${blogPost.headline}`);
        return blogPost;
        
    } catch (error) {
        console.error('Error in auto-generate round recap:', error);
        return null;
    }
}

// ========================================
// HEADLINE GENERATOR (WITH FLAVOR)
// ========================================

function generateHeadline(match, context, winnerData, loserData) {
    const { winner, loser, matchType, isUpset, isMajorUpset, voteDiff } = context;
    
    // Get song-specific flavor
    const winnerCategory = winnerData.seriesCollection;
    const isVirtualGroup = winnerData.category === 'virtual-group';
    const isWorldsAnthem = winnerData.category === 'worlds-anthem';
    
    // Choose verb based on match type
    let verb;
    if (matchType === 'nailbiter') {
        verb = ['edges past', 'survives against', 'outlasts', 'escapes with victory over'][Math.floor(Math.random() * 4)];
    } else if (matchType === 'dominant') {
        verb = isVirtualGroup 
            ? ['dominates', 'crushes', 'overwhelms', 'storms past'][Math.floor(Math.random() * 4)]
            : ['triumphs over', 'defeats', 'conquers', 'prevails against'][Math.floor(Math.random() * 4)];
    } else {
        verb = ['beats', 'tops', 'defeats', 'overcomes'][Math.floor(Math.random() * 4)];
    }
    
    // Generate headline
    if (isMajorUpset) {
        return `🚨 UPSET: ${winner.shortTitle} ${verb} #${loser.seed} ${loser.shortTitle}`;
    }
    
    if (matchType === 'nailbiter') {
        return `⚔️ THRILLER: ${winner.shortTitle} ${verb} ${loser.shortTitle} by ${voteDiff} ${voteDiff === 1 ? 'Vote' : 'Votes'}`;
    }
    
    if (matchType === 'dominant') {
        return `💥 ${winner.shortTitle} ${verb} ${loser.shortTitle}`;
    }
    
    if (context.isUndefeated && match.round >= 3) {
        return `🔥 ${winner.shortTitle} Stays Perfect, ${verb} ${loser.shortTitle}`;
    }
    
    const emoji = isWorldsAnthem ? '🏆' : isVirtualGroup ? '🎵' : '✅';
    return `${emoji} ${winner.shortTitle} ${verb} ${loser.shortTitle}`;
}

// ========================================
// EXCERPT GENERATOR
// ========================================

function generateExcerpt(match, context, winnerData, loserData) {
    const { winner, loser, matchType, winnerPct, loserPct } = context;
    
    let excerpt = `The #${winner.seed} seed ${winnerData.seriesCollection} anthem `;
    
    if (matchType === 'nailbiter') {
        excerpt += `barely escapes with a ${winnerPct}%-${loserPct}% thriller against `;
    } else if (matchType === 'dominant') {
        excerpt += `dominates in a ${winnerPct}%-${loserPct}% statement performance against `;
    } else {
        excerpt += `advances with a ${winnerPct}%-${loserPct}% victory over `;
    }
    
    excerpt += `the ${loserData.year} ${loserData.seriesCollection} entry.`;
    
    if (context.isUpset) {
        excerpt += ` Upset alert!`;
    }
    
    return excerpt;
}

// ========================================
// NARRATIVE GENERATOR
// ========================================

function generateNarrative(match, context, winnerData, loserData, h2hHistory) {
    const { winner, loser, matchType, intensity, voteDiff, winnerPct, loserPct, isUpset, isUndefeated } = context;
    
    let narrative = '';
    
    // Opening paragraph
    narrative += `**${winner.shortTitle}** has advanced to ${getNextRoundName(match.round)} after `;
    
    if (matchType === 'nailbiter') {
        narrative += `a ${intensity} **${winnerPct}%-${loserPct}%** thriller against **${loser.shortTitle}**. `;
        narrative += `The match came down to just **${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'}**, `;
        narrative += `with neither side able to pull away throughout the ${match.totalVotes.toLocaleString()}-vote battle.\n\n`;
    } else if (matchType === 'dominant') {
        narrative += `a ${intensity} **${winnerPct}%-${loserPct}%** victory over **${loser.shortTitle}**. `;
        narrative += `The ${winnerData.year} ${winnerData.seriesCollection} anthem never let ${loser.shortTitle} into the match, `;
        narrative += `winning by **${voteDiff} votes** in a statement performance.\n\n`;
    } else {
        narrative += `defeating **${loser.shortTitle}** **${winnerPct}%-${loserPct}%** in ${getRoundName(match.round)}. `;
        narrative += `The ${intensity} matchup saw ${winner.shortTitle} pull ahead with ${winner.votes.toLocaleString()} votes.\n\n`;
    }
    
    // Song context
    narrative += `## The Matchup\n\n`;
    narrative += `This ${getRoundName(match.round)} clash pitted `;
    narrative += `**${winnerData.artist}'s** ${winnerData.year} ${winnerData.seriesCollection} entry `;
    narrative += `against **${loserData.artist}'s** ${loserData.year} ${loserData.seriesCollection} anthem. `;
    
    if (winnerData.views > loserData.views) {
        narrative += `Despite ${loser.shortTitle}'s impressive ${(loserData.views / 1000000).toFixed(0)}M YouTube views, `;
        narrative += `${winner.shortTitle}'s ${(winnerData.views / 1000000).toFixed(0)}M views and passionate fanbase proved decisive.\n\n`;
    } else {
        narrative += `${loser.shortTitle} came in with ${(loserData.views / 1000000).toFixed(0)}M YouTube views, `;
        narrative += `but ${winner.shortTitle} defied expectations.\n\n`;
    }
    
    // Upset section
    if (isUpset) {
        narrative += `## 🚨 Upset Alert!\n\n`;
        if (context.isMajorUpset) {
            narrative += `In one of the biggest surprises of the tournament, `;
        }
        narrative += `the **#${winner.seed} seed** ${winner.shortTitle} took down the higher-seeded **#${loser.seed}** ${loser.shortTitle}. `;
        
        if (context.seedDiff >= 10) {
            narrative += `This David vs. Goliath matchup saw the massive underdog defy all expectations. `;
        }
        narrative += `Tournament brackets everywhere are now in shambles.\n\n`;
    }
    
    // H2H history
    if (h2hHistory && h2hHistory.hasHistory) {
        narrative += `## Head-to-Head History\n\n`;
        narrative += `This wasn't the first time these two songs have battled. `;
        
        const seriesLeader = h2hHistory.song1Wins > h2hHistory.song2Wins ? winner.shortTitle : loser.shortTitle;
const leaderWins = Math.max(h2hHistory.song1Wins, h2hHistory.song2Wins);
        const trailingWins = Math.min(h2hHistory.song1Wins, h2hHistory.song2Wins);
        
        narrative += `**${seriesLeader}** now leads the all-time series **${leaderWins}-${trailingWins}** `;
        narrative += `after this ${getRoundName(match.round)} battle. `;
        narrative += `Their last meeting was in ${h2hHistory.lastMeeting.tournament}.\n\n`;
    }
    
    // Tournament form
    narrative += `## Tournament Impact\n\n`;
    if (isUndefeated) {
        narrative += `${winner.shortTitle} remains **undefeated** at **${winner.wins}-0** `;
        narrative += `and continues to be one of the most dominant forces in the tournament. `;
    } else {
        narrative += `${winner.shortTitle} improves to **${winner.wins}-${winner.losses}** and advances to `;
        narrative += `${getNextRoundName(match.round)} where ${match.round >= 4 ? 'championship dreams' : 'the competition'} awaits. `;
    }
    
    narrative += `${loser.shortTitle} ends their run at **${loser.wins}-${loser.losses}**`;
    if (loser.wins >= 2) {
        narrative += `, proving they belong among the elite despite this loss`;
    }
    narrative += `.\n\n`;
    
    // Stats section
    narrative += `## By The Numbers\n\n`;
    narrative += `- **${winner.shortTitle}:** ${winner.votes.toLocaleString()} votes (**${winnerPct}%**)\n`;
    narrative += `- **${loser.shortTitle}:** ${loser.votes.toLocaleString()} votes (**${loserPct}%**)\n`;
    narrative += `- **Total votes cast:** ${match.totalVotes.toLocaleString()}\n`;
    narrative += `- **Margin of victory:** ${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'}\n`;
    narrative += `- **Match type:** ${matchType.charAt(0).toUpperCase() + matchType.slice(1)}\n\n`;
    
    // Song spotlight
    narrative += `## Song Spotlight\n\n`;
    narrative += `### 🏆 ${winner.shortTitle}\n`;
    narrative += `- **Artist:** ${winnerData.artist}\n`;
    narrative += `- **Year:** ${winnerData.year}\n`;
    narrative += `- **Category:** ${winnerData.seriesCollection}\n`;
    narrative += `- **YouTube Views:** ${(winnerData.views / 1000000).toFixed(1)}M\n`;
    narrative += `- **Seed:** #${winner.seed}\n`;
    if (winnerData.stats && winnerData.stats.championships > 0) {
        narrative += `- **Championships:** ${winnerData.stats.championships}\n`;
    }
    narrative += `\n`;
    
    // Closing hook
    if (match.round >= 4) {
        narrative += `The stakes only get higher from here. ${winner.shortTitle} will need every vote `;
        narrative += `to survive ${getNextRoundName(match.round)} and keep their championship hopes alive. `;
    } else {
        narrative += `Can ${winner.shortTitle} maintain this momentum? ${getNextRoundName(match.round)} awaits. `;
    }
    
    narrative += `\n\n---\n\n`;
    narrative += `📊 [View Full Bracket](/brackets.html) | 🗳️ [Vote Live](/live.html) | 📈 [Tournament Stats](/stats.html)`;
    
    return narrative;
}

// ========================================
// HELPERS
// ========================================

function getRoundName(round) {
    const names = {
        1: 'Round 1',
        2: 'Round 2',
        3: 'Round 3',
        4: 'Quarterfinals',
        5: 'Semifinals',
        6: 'Finals'
    };
    return names[round] || `Round ${round}`;
}

function getNextRoundName(currentRound) {
    return getRoundName(currentRound + 1);
}


