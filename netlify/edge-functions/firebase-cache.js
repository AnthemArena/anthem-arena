// ========================================
// FIREBASE EDGE CACHE - NETLIFY EDGE FUNCTION
// Caches Firebase data at CDN edge for 5 minutes
// ========================================

const CACHE_DURATION = 30; // 30 seconds
const STALE_OK_MS = 10 * 60 * 1000; // serve a copy up to 10 minutes old if Firestore refuses
const FIREBASE_PROJECT = "arcane-moments";
const TOURNAMENT = "jinx-cup-1";

// Edge cache storage
const edgeCache = new Map();

// ========================================
// MAIN HANDLER
// ========================================

export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const matchId = url.searchParams.get('matchId');
  // Optional ?tournament=<cupId> reads a past cup (profiles and stats history). Anything that is not a plain cup id is ignored.
  const askedCup = url.searchParams.get('tournament');
  const cup = askedCup && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(askedCup) ? askedCup : TOURNAMENT;

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

    
  // ✅ ADD THIS NEW BLOCK:
  if (pathname === "/api/activity") {
    return handleActivityFeed(request);
  }
  
  // ✅ Check for cache bypass (after voting)
  const bypassCache = url.searchParams.get('_refresh') !== null;
  
  // Create cache key including matchId if present
  const cacheKey = (matchId ? `${pathname}?matchId=${matchId}` : pathname) + (cup !== TOURNAMENT ? `#${cup}` : '');
  
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
    let isMatchList = false; // true for "all matches": that is a LIST request and Firestore pages lists
    
    // Route to correct Firebase endpoint
    if (pathname === "/api/matches") {
      if (matchId) {
        // Get single match by ID
        firebaseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${cup}/matches/${matchId}`;
        fetchVotes = true; // ✅ Fetch votes for single match
      } else {
        // Get all matches
        firebaseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${cup}/matches`;
        fetchVotes = true; // ✅ Fetch votes for all matches
        isMatchList = true;
      }
    } else if (pathname.startsWith("/api/match/")) {
      // Alternative route: Get single match
      const pathMatchId = pathname.replace("/api/match/", "");
      firebaseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${cup}/matches/${pathMatchId}`;
      fetchVotes = true; // ✅ Fetch votes for single match
    }
    
    if (!firebaseUrl) {
      return new Response(JSON.stringify({ error: "Invalid endpoint" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log(`🔥 Fetching from Firebase: ${firebaseUrl}`);
    
    // Fetch from Firebase REST API.
    // The match LIST is fetched page by page: Firestore returns one page at a time and may return fewer documents than exist,
    // so a cup with many matches (a group stage is 24 to 384) must follow nextPageToken or the page shows only the first few.
    let firestoreData;
    if (isMatchList) {
      firestoreData = await fetchAllPages(firebaseUrl);
    } else {
      const response = await fetch(firebaseUrl, {
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Firebase error: ${response.status} ${response.statusText}`);
      }

      firestoreData = await response.json();
    }
    
    // Transform Firestore format to your app format
    let transformed = transformFirestoreData(firestoreData);
    
    // ✅ NEW: Fetch and attach vote counts if needed
    if (fetchVotes) {
      if (isMatchList) {
        // The match list used to run one votes query per match (384 queries per refresh for a full group stage), which made
        // Firestore answer 429 Too Many Requests and the whole site lost its matches. Every vote already increments the
        // counters on the match document in the same batch, so the list reads those instead: zero extra requests.
        transformed = Array.isArray(transformed) ? transformed.map(addStoredCountsToMatch) : transformed;
      } else {
        transformed = await attachVoteCounts(transformed, matchId);   // one match: one exact count is cheap
      }
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

    // Firestore can answer 429/5xx for a moment. A copy that is a few minutes old beats an error page for every visitor.
    const stale = edgeCache.get(cacheKey);
    if (stale && (Date.now() - stale.timestamp) < STALE_OK_MS) {
      console.warn(`⚠️ Serving stale ${cacheKey} (${Math.round((Date.now() - stale.timestamp) / 1000)}s old)`);
      return new Response(JSON.stringify(stale.data), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=10", "X-Cache": "STALE", "Access-Control-Allow-Origin": "*" }
      });
    }

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
// PAGED LIST FETCH
// ========================================
// Lists a Firestore collection through the REST API, following nextPageToken until there are no more pages.
// Returns { documents: [...] } like a single-page response, so transformFirestoreData() needs no change.
// Asks for the biggest page Firestore allows (300) to keep the number of requests down; the MAX_PAGES guard stops a runaway loop.
const PAGE_SIZE = 300;
const MAX_PAGES = 50;

async function fetchAllPages(baseUrl) {
  const documents = [];
  let pageToken = null;
  let pages = 0;

  do {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const url = `${baseUrl}${separator}pageSize=${PAGE_SIZE}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    let response = await fetch(url, { headers: { "Content-Type": "application/json" } });
    for (let attempt = 0; !response.ok && (response.status === 429 || response.status === 503) && attempt < 2; attempt++) {
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      response = await fetch(url, { headers: { "Content-Type": "application/json" } });
    }

    if (!response.ok) {
      throw new Error(`Firebase error: ${response.status} ${response.statusText}`);
    }

    const page = await response.json();
    if (Array.isArray(page.documents)) documents.push(...page.documents);
    pageToken = page.nextPageToken || null;
    pages++;
  } while (pageToken && pages < MAX_PAGES);

  if (pageToken) console.warn(`⚠️ Stopped after ${MAX_PAGES} pages: the list is longer than ${MAX_PAGES * PAGE_SIZE} documents`);
  return { documents };
}

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
// ✅ NEW: ACTIVITY FEED HANDLER
// ========================================

async function handleActivityFeed(request) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const bypassCache = url.searchParams.get('_refresh') !== null;
  
  const cacheKey = `activity-feed-${limit}`;
  
  // Check cache (unless bypassed)
  if (!bypassCache) {
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
  
  console.log(`${bypassCache ? '🔄 CACHE BYPASS' : '❌ CACHE MISS'}: ${cacheKey}`);
  
  try {
    const activityUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents:runQuery`;
    
    const response = await fetch(activityUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'activity' }],
          // ✅ No where clause - fetch all activities
          orderBy: [
            { field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }
          ],
          limit: limit * 2  // Fetch extra to account for filtering
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firebase response:', errorText);
      throw new Error(`Firebase error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // ✅ Filter client-side: show everything except explicitly private
    const activities = data
      .filter(item => item.document)
      .map(item => convertDocument(item.document))
      .filter(activity => activity.isPublic !== false)  // Hides only false, shows true/undefined
      .slice(0, limit);  // Trim to requested limit after filtering
    
    console.log(`✅ Fetched ${activities.length} public activity items (filtered from ${data.length} total)`);
    
    edgeCache.set(cacheKey, { data: activities, timestamp: Date.now() });
    
    return new Response(JSON.stringify(activities), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_DURATION}`,
        "X-Cache": bypassCache ? "REFRESH" : "MISS",
        "Access-Control-Allow-Origin": "*"
      }
    });
    
  } catch (error) {
    console.error("❌ Activity feed error:", error);
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

// Builds the same fields as addVoteCountsToMatch, from the counters stored on the match document.
function addStoredCountsToMatch(match) {
  const song1Votes = Number(match.song1?.votes) || 0;
  const song2Votes = Number(match.song2?.votes) || 0;
  const totalVotes = song1Votes + song2Votes;
  const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
  const song2Percentage = totalVotes > 0 ? 100 - song1Percentage : 50;
  return {
    ...match,
    totalVotes,
    song1: { ...(match.song1 || {}), votes: song1Votes, percentage: song1Percentage },
    song2: { ...(match.song2 || {}), votes: song2Votes, percentage: song2Percentage }
  };
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

  // Handle empty collection
  if (!firestoreData.fields && !firestoreData.documents) {
    return [];
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

// ========================================
// CONFIGURE ROUTES
// ========================================

// Update config to include new endpoint
export const config = {
  path: ["/api/matches", "/api/match/*", "/api/track-view", "/api/view-stats", "/api/total-votes", "/api/activity"]
};