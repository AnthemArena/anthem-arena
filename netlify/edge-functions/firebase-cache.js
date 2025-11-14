// ========================================
// FIREBASE EDGE CACHE - NETLIFY EDGE FUNCTION
// Caches Firebase data at CDN edge for 5 minutes
// ========================================

const CACHE_DURATION = 30; // 30 seconds
const FIREBASE_PROJECT = "league-music-tournament";
const TOURNAMENT = "2025-worlds-anthems";

// Edge cache storage
const edgeCache = new Map();

// ========================================
// MAIN HANDLER
// ========================================

export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const matchId = url.searchParams.get('matchId');

   // ✅ NEW: Handle total votes endpoint
  if (pathname === "/api/total-votes") {
    return handleTotalVotes(request);
  }


// ✅ NEW: Handle view tracking endpoint
  if (pathname === "/api/track-view" && request.method === "POST") {
    return handleViewTracking(request);
  }
  
  // ✅ NEW: Handle view stats endpoint
  if (pathname === "/api/view-stats") {
    return handleViewStats(matchId);
  }
  
  // ✅ Check for cache bypass (after voting)
  const bypassCache = url.searchParams.get('_refresh') !== null;
  
  // Create cache key including matchId if present
  const cacheKey = matchId ? `${pathname}?matchId=${matchId}` : pathname;
  
  console.log(`📡 Edge request: ${cacheKey}${bypassCache ? ' (BYPASS)' : ''}`);
  
  // ✅ Skip cache check if bypass requested
  if (!bypassCache) {
    // Check edge cache
    const cached = edgeCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION * 1000) {
      console.log(`✅ CACHE HIT: ${cacheKey}`);
      
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${CACHE_DURATION}`,
          "X-Cache": "HIT",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  }
  
  // Cache miss or bypass - fetch from Firebase
  console.log(`${bypassCache ? '🔄 CACHE BYPASS' : '❌ CACHE MISS'}: ${cacheKey} - fetching from Firebase`);
  
  try {
    let firebaseUrl = "";
    let fetchVotes = false; // Flag to determine if we need to fetch votes
    
    // Route to correct Firebase endpoint
    if (pathname === "/api/matches") {
      if (matchId) {
        // Get single match by ID
        firebaseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${TOURNAMENT}/matches/${matchId}`;
        fetchVotes = true; // ✅ Fetch votes for single match
      } else {
        // Get all matches
        firebaseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${TOURNAMENT}/matches`;
        fetchVotes = true; // ✅ Fetch votes for all matches
      }
    } else if (pathname.startsWith("/api/match/")) {
      // Alternative route: Get single match
      const pathMatchId = pathname.replace("/api/match/", "");
      firebaseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${TOURNAMENT}/matches/${pathMatchId}`;
      fetchVotes = true; // ✅ Fetch votes for single match
    }
    
    if (!firebaseUrl) {
      return new Response(JSON.stringify({ error: "Invalid endpoint" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log(`🔥 Fetching from Firebase: ${firebaseUrl}`);
    
    // Fetch from Firebase REST API
    const response = await fetch(firebaseUrl, {
      headers: {
        "Content-Type": "application/json"
      }
    });
    
    if (!response.ok) {
      throw new Error(`Firebase error: ${response.status} ${response.statusText}`);
    }
    
    const firestoreData = await response.json();
    
    // Transform Firestore format to your app format
    let transformed = transformFirestoreData(firestoreData);
    
    // ✅ NEW: Fetch and attach vote counts if needed
    if (fetchVotes) {
      transformed = await attachVoteCounts(transformed, matchId);
    }
    
    // Store in edge cache
    edgeCache.set(cacheKey, { data: transformed, timestamp: Date.now() });
    
    console.log(`✅ Cached at edge: ${cacheKey}`);
    
    return new Response(JSON.stringify(transformed), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_DURATION}`,
        "X-Cache": bypassCache ? "REFRESH" : "MISS",
        "Access-Control-Allow-Origin": "*"
      }
    });
    
  } catch (error) {
    console.error("❌ Edge function error:", error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      endpoint: pathname,
      matchId: matchId 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// ========================================
// ✅ NEW: VIEW TRACKING HANDLER
// ========================================

async function handleViewTracking(request) {
  try {
    const { matchId, timestamp } = await request.json();
    
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    
    const viewUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/matchViews/${matchId}`;
    
    // Try to get current view data
    const getResponse = await fetch(viewUrl);
    let currentViews = 0;
    let recentTimestamps = [];
    
    if (getResponse.ok) {
      const data = await getResponse.json();
      currentViews = extractValue(data.fields.totalViews) || 0;
      
      // Get recent timestamps and filter to last 5 minutes
      recentTimestamps = (extractValue(data.fields.recentTimestamps) || [])
        .filter(ts => timestamp - ts < 300000); // Keep only last 5 min
      
      // Add new timestamp
      recentTimestamps.push(timestamp);
      
      // Keep only last 100 timestamps to prevent bloat
      if (recentTimestamps.length > 100) {
        recentTimestamps = recentTimestamps.slice(-100);
      }
      
      // Update Firestore
      await fetch(viewUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            matchId: { stringValue: matchId },
            totalViews: { integerValue: currentViews + 1 },
            lastViewed: { integerValue: timestamp },
            recentTimestamps: { 
              arrayValue: { 
                values: recentTimestamps.map(ts => ({ integerValue: ts }))
              }
            }
          }
        })
      });
      
    } else {
      // Create new view record
      recentTimestamps = [timestamp];
      
      await fetch(viewUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            matchId: { stringValue: matchId },
            totalViews: { integerValue: 1 },
            lastViewed: { integerValue: timestamp },
            recentTimestamps: { 
              arrayValue: { 
                values: [{ integerValue: timestamp }]
              }
            }
          }
        })
      });
    }
    
    const recentViews = recentTimestamps.filter(ts => timestamp - ts < 300000).length;
    
    console.log(`👀 View tracked for ${matchId}: ${currentViews + 1} total, ${recentViews} recent`);
    
    return new Response(JSON.stringify({ 
      success: true,
      totalViews: currentViews + 1,
      recentViews: recentViews
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
    
  } catch (error) {
    console.error("❌ View tracking error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

// ========================================
// ✅ NEW: GET VIEW STATS FOR A MATCH
// ========================================

async function handleViewStats(matchId) {
  try {
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const viewUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/matchViews/${matchId}`;
    
    const response = await fetch(viewUrl);
    
    if (!response.ok) {
      // No views yet
      return new Response(JSON.stringify({ 
        totalViews: 0,
        recentViews: 0
      }), {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    
    const data = await response.json();
    const totalViews = extractValue(data.fields.totalViews) || 0;
    const recentTimestamps = extractValue(data.fields.recentTimestamps) || [];
    const now = Date.now();
    const recentViews = recentTimestamps.filter(ts => now - ts < 300000).length;
    
    return new Response(JSON.stringify({ 
      totalViews,
      recentViews
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
    
  } catch (error) {
    console.error("❌ View stats error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// ========================================
// ✅ NEW: GET TOTAL SITE-WIDE VOTES
// ========================================

async function handleTotalVotes(request) {
  try {
    // Check cache first (cache for 30 seconds)
    const cacheKey = 'total-votes';
    const cached = edgeCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < 30000) { // 30 second cache
      console.log(`✅ CACHE HIT: total votes = ${cached.data.totalVotes}`);
      
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30",
          "X-Cache": "HIT",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    
    console.log('🔥 Fetching total votes from Firebase...');
    
    // Query all votes using structured query
    const votesUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents:runQuery`;
    
    const response = await fetch(votesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{
            collectionId: 'votes'
          }],
          select: {
            fields: [{ fieldPath: 'matchId' }] // Only select matchId to reduce payload
          }
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Firebase error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Count total votes (each document = 1 vote)
    const totalVotes = data.filter(item => item.document).length;
    
    console.log(`✅ Total site votes: ${totalVotes}`);
    
    const result = {
      totalVotes,
      timestamp: now,
      milestoneReached: totalVotes >= 1000
    };
    
    // Cache the result
    edgeCache.set(cacheKey, { data: result, timestamp: now });
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
        "X-Cache": "MISS",
        "Access-Control-Allow-Origin": "*"
      }
    });
    
  } catch (error) {
    console.error("❌ Total votes error:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      totalVotes: 0,
      milestoneReached: false
    }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

// ========================================
// ✅ NEW: ATTACH VOTE COUNTS
// ========================================

async function attachVoteCounts(matchData, specificMatchId = null) {
  try {
    // Handle single match
    if (!Array.isArray(matchData)) {
      const votes = await fetchVotesForMatch(matchData.id || specificMatchId);
      return addVoteCountsToMatch(matchData, votes);
    }
    
    // Handle multiple matches
    const matchesWithVotes = await Promise.all(
      matchData.map(async (match) => {
        const votes = await fetchVotesForMatch(match.id);
        return addVoteCountsToMatch(match, votes);
      })
    );
    
    return matchesWithVotes;
  } catch (error) {
    console.error("❌ Error attaching vote counts:", error);
    // Return original data if vote counting fails
    return matchData;
  }
}

async function fetchVotesForMatch(matchId) {
  if (!matchId) return [];
  
  // ✅ Query votes collection with matchId filter using structured query
  const votesUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents:runQuery`;
  
  console.log(`🗳️ Fetching votes for match: ${matchId}`);
  
  try {
    const response = await fetch(votesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{
            collectionId: 'votes'
          }],
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
    
    if (!response.ok) {
      console.error(`❌ Failed to fetch votes: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    // Transform query results
    const matchVotes = data
      .filter(item => item.document) // Filter out empty responses
      .map(item => convertDocument(item.document));
    
    console.log(`✅ Found ${matchVotes.length} votes for ${matchId}`);
    
    return matchVotes;
  } catch (error) {
    console.error(`❌ Error fetching votes for ${matchId}:`, error);
    return [];
  }
}

function addVoteCountsToMatch(match, votes) {
  // Count votes for each competitor
  let song1Votes = 0;
  let song2Votes = 0;
  
  votes.forEach(vote => {
    if (vote.choice === 'song1') song1Votes++;
    else if (vote.choice === 'song2') song2Votes++;
  });
  
  const totalVotes = song1Votes + song2Votes;
  
  // Calculate percentages
  const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
  const song2Percentage = totalVotes > 0 ? 100 - song1Percentage : 50;
  
  console.log(`📊 Match ${match.id}: Song1=${song1Votes}(${song1Percentage}%), Song2=${song2Votes}(${song2Percentage}%)`);
  
  // ✅ FIX: Attach to song1/song2, not competitor1/competitor2
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

// ========================================
// TRANSFORM FIRESTORE DATA
// ========================================

function transformFirestoreData(firestoreData) {
  // Handle collection (multiple documents)
  if (firestoreData.documents && Array.isArray(firestoreData.documents)) {
    return firestoreData.documents.map(doc => convertDocument(doc));
  }
  
  // Handle single document
  if (firestoreData.fields) {
    return convertDocument(firestoreData);
  }
  
  // Fallback
  return firestoreData;
}

function convertDocument(doc) {
  const fields = doc.fields || {};
  const result = {};
  
  // Convert each field from Firestore format to plain JS
  for (const [key, value] of Object.entries(fields)) {
    result[key] = extractValue(value);
  }
  
  // Extract ID from document name if not already present
  if (doc.name && !result.id) {
    const nameParts = doc.name.split('/');
    result.id = nameParts[nameParts.length - 1];
  }
  
  return result;
}

function extractValue(field) {
  if (field === null || field === undefined) return null;
  
  // String
  if (field.stringValue !== undefined) return field.stringValue;
  
  // Number
  if (field.integerValue !== undefined) return parseInt(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  
  // Boolean
  if (field.booleanValue !== undefined) return field.booleanValue;
  
  // Map/Object
  if (field.mapValue) {
    const result = {};
    const mapFields = field.mapValue.fields || {};
    for (const [key, value] of Object.entries(mapFields)) {
      result[key] = extractValue(value);
    }
    return result;
  }
  
  // Array
  if (field.arrayValue) {
    const values = field.arrayValue.values || [];
    return values.map(v => extractValue(v));
  }
  
  // Null
  if (field.nullValue !== undefined) return null;
  
  return null;
}

// ========================================
// CONFIGURE ROUTES
// ========================================

// Update config to include new endpoint
export const config = {
  path: ["/api/matches", "/api/match/*", "/api/track-view", "/api/view-stats", "/api/total-votes"]
};