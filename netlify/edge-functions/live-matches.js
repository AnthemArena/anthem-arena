// ========================================
// LIVE MATCHES EDGE CACHE - NETLIFY EDGE FUNCTION
// Caches all live matches for 2 minutes at edge
// ========================================

const CACHE_DURATION = 120; // 2 minutes
const FIREBASE_PROJECT = "league-music-tournament";
const TOURNAMENT = "2025-worlds-anthems";

// Edge cache storage
const edgeCache = new Map();

export default async (request, context) => {
  const cacheKey = 'live-matches';
  
  console.log(`📡 Live matches request`);
  
  // Check edge cache
  const cached = edgeCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < CACHE_DURATION * 1000) {
    console.log(`✅ CACHE HIT: ${cached.data.length} live matches`);
    
    return new Response(JSON.stringify({
      matches: cached.data,
      cached: true,
      timestamp: cached.timestamp,
      expiresAt: cached.timestamp + (CACHE_DURATION * 1000)
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_DURATION}`,
        "X-Cache": "HIT",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
  
  // Cache miss - fetch from Firebase
  console.log(`❌ CACHE MISS - fetching from Firebase`);
  
  try {
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents:runQuery`;
    
    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{
            collectionId: 'matches',
            allDescendants: false
          }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'tournamentId' },
                    op: 'EQUAL',
                    value: { stringValue: TOURNAMENT }
                  }
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'status' },
                    op: 'EQUAL',
                    value: { stringValue: 'live' }
                  }
                }
              ]
            }
          }
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Firebase query failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    const liveMatches = data
      .filter(item => item.document)
      .map(item => convertDocument(item.document));
    
    console.log(`🔥 Found ${liveMatches.length} live matches`);
    
    // Fetch votes for all live matches in parallel
    const matchesWithVotes = await Promise.all(
      liveMatches.map(async (match) => {
        const votes = await fetchVotesForMatch(match.matchId || match.id);
        return addVoteCountsToMatch(match, votes);
      })
    );
    
    // Store in edge cache
    edgeCache.set(cacheKey, { 
      data: matchesWithVotes, 
      timestamp: Date.now() 
    });
    
    console.log(`✅ Cached ${matchesWithVotes.length} matches for ${CACHE_DURATION}s`);
    
    return new Response(JSON.stringify({
      matches: matchesWithVotes,
      cached: false,
      timestamp: Date.now(),
      expiresAt: Date.now() + (CACHE_DURATION * 1000)
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_DURATION}`,
        "X-Cache": "MISS",
        "X-Matches-Count": matchesWithVotes.length.toString(),
        "Access-Control-Allow-Origin": "*"
      }
    });
    
  } catch (error) {
    console.error("❌ Error:", error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      matches: []
    }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};

async function fetchVotesForMatch(matchId) {
  if (!matchId) return [];
  
  const votesUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents:runQuery`;
  
  try {
    const response = await fetch(votesUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'votes' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'matchId' },
              op: 'EQUAL',
              value: { stringValue: matchId }
            }
          }
        }
      })
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data
      .filter(item => item.document)
      .map(item => convertDocument(item.document));
  } catch (error) {
    console.error(`❌ Error fetching votes for ${matchId}:`, error);
    return [];
  }
}

function addVoteCountsToMatch(match, votes) {
  let song1Votes = 0;
  let song2Votes = 0;
  
  votes.forEach(vote => {
    if (vote.choice === 'song1') song1Votes++;
    else if (vote.choice === 'song2') song2Votes++;
  });
  
  const totalVotes = song1Votes + song2Votes;
  const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
  const song2Percentage = totalVotes > 0 ? 100 - song1Percentage : 50;
  
  return {
    ...match,
    totalVotes,
    song1: {
      ...(match.song1 || {}),
      votes: song1Votes,
      percentage: song1Percentage
    },
    song2: {
      ...(match.song2 || {}),
      votes: song2Votes,
      percentage: song2Percentage
    }
  };
}

function convertDocument(doc) {
  const fields = doc.fields || {};
  const result = {};
  
  for (const [key, value] of Object.entries(fields)) {
    result[key] = extractValue(value);
  }
  
  if (doc.name && !result.id) {
    const nameParts = doc.name.split('/');
    result.id = nameParts[nameParts.length - 1];
  }
  
  return result;
}

function extractValue(field) {
  if (field === null || field === undefined) return null;
  
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return parseInt(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  
  if (field.mapValue) {
    const result = {};
    const mapFields = field.mapValue.fields || {};
    for (const [key, value] of Object.entries(mapFields)) {
      result[key] = extractValue(value);
    }
    return result;
  }
  
  if (field.arrayValue) {
    const values = field.arrayValue.values || [];
    return values.map(v => extractValue(v));
  }
  
  if (field.timestampValue !== undefined) return field.timestampValue;
  if (field.nullValue !== undefined) return null;
  
  return null;
}

export const config = {
  path: "/api/live-matches"
};