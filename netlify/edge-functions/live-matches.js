// ========================================
// LIVE MATCHES EDGE CACHE - NETLIFY EDGE FUNCTION
// FIXED: Query nested matches collection
// ========================================

const CACHE_DURATION = 120; // 2 minutes
const FIREBASE_PROJECT = "arcane-moments";

// ---- Firestore REST access --------------------------------------------------------------------------------------
// Requests with no API key are anonymous: Google throttles them per source address, and Netlify's edge servers share
// addresses with many other sites, which is how /api/matches began answering 429 Too Many Requests while the site's own
// reads (and the daily quota) were fine. Sending the project's web key makes the call count against this project.
// If the key were ever blocked (403), the call is repeated without it, so this can only help, never break reads.
// Read from the Netlify environment variable FIREBASE_WEB_API_KEY (Site configuration > Environment variables), not hardcoded.
// If it is not set, requests go out without a key, exactly as before.
const firestoreKey = () => (typeof Deno !== "undefined" && Deno.env?.get("FIREBASE_WEB_API_KEY")) || "";
const SITE_ORIGIN = "https://arcanemoments.netlify.app/";
async function fsFetch(url, init = {}) {
  const key = firestoreKey();
  if (!key) return fetch(url, init);
  const keyed = url + (url.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(key);
  const headers = { ...(init.headers || {}), Referer: SITE_ORIGIN };
  const response = await fetch(keyed, { ...init, headers });
  if (response.status === 403) return fetch(url, init);
  return response;
}
// Short, safe description of a failed Firestore response, so an error says WHY (quota, rate limit, rules...) and not just the code.
async function describeFailure(response) {
  let detail = "";
  try { detail = (await response.clone().text()).replace(/\s+/g, " ").slice(0, 240); } catch { /* ignore */ }
  return `${response.status} ${response.statusText}${detail ? " | " + detail : ""}`;
}
// Keep in sync with ARCANE_CONFIG.tournamentId in js/arcane-config.js
const TOURNAMENT = "jinx-cup-1";

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
    // FIXED: Query nested collection path
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${TOURNAMENT}/matches`;
    
    const response = await fsFetch(queryUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Firebase query failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Filter for live matches
    const allMatches = data.documents || [];
    const liveMatches = allMatches
      .filter(doc => {
        const status = doc.fields?.status?.stringValue;
        return status === 'live';
      })
      .map(doc => convertDocument(doc));
    
    console.log(`🔥 Found ${liveMatches.length} live matches out of ${allMatches.length} total`);
    
    // Fetch votes for all live matches in parallel
    const matchesWithVotes = await Promise.all(
      liveMatches.map(async (match) => {
        const matchId = match.id || match.matchId;
        const votes = await fetchVotesForMatch(matchId);
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
  
  // Query votes collection at tournament level
  const votesUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${TOURNAMENT}/votes`;
  
  try {
    const response = await fsFetch(votesUrl);
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const allVotes = data.documents || [];
    
    // Filter votes for this match
    const matchVotes = allVotes
      .filter(doc => {
        const voteMatchId = doc.fields?.matchId?.stringValue;
        return voteMatchId === matchId;
      })
      .map(doc => convertDocument(doc));
    
    return matchVotes;
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
  
  // Extract ID from document name
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