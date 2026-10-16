// ========================================
// PROFILE EDGE FUNCTION
// Caches user profiles at CDN edge
// ========================================

const CACHE_DURATION = 30; // 30 seconds
const FIREBASE_PROJECT = "arcane-moments";

// ---- Firestore REST access --------------------------------------------------------------------------------------
// Requests with no API key are anonymous: Google throttles them per source address, and Netlify's edge servers share
// addresses with many other sites, which is how /api/matches began answering 429 Too Many Requests while the site's own
// reads (and the daily quota) were fine. Sending the project's public web key makes the call count against this project.
// If the key were ever blocked (403), the call is repeated without it, so this can only help, never break reads.
const FIRESTORE_WEB_KEY = "AIzaSyCApnc605mPNOEsAcVnKeXbBTokk7iZP5E";
const SITE_ORIGIN = "https://arcanemoments.netlify.app/";
async function fsFetch(url, init = {}) {
  const keyed = url + (url.includes("?") ? "&" : "?") + "key=" + FIRESTORE_WEB_KEY;
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

// Edge cache storage
const edgeCache = new Map();

export default async (request, context) => {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');
  const userId = url.searchParams.get('userId');
  const bypassCache = url.searchParams.get('_refresh') !== null;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  if (!username && !userId) {
    return new Response(JSON.stringify({ error: 'Missing username or userId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const cacheKey = username ? `profile-${username}` : `profile-user-${userId}`;
  
  // Check cache
  if (!bypassCache) {
    const cached = edgeCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION * 1000) {
      console.log(`✅ CACHE HIT: ${cacheKey}`);
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_DURATION}`,
          'X-Cache': 'HIT',
        }
      });
    }
  }
  
  console.log(`${bypassCache ? '🔄 CACHE BYPASS' : '❌ CACHE MISS'}: ${cacheKey}`);
  
  try {
    // Query profile by username
    if (username) {
      const profileUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents:runQuery`;
      
      const response = await fsFetch(profileUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'profiles' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'username' },
                op: 'EQUAL',
                value: { stringValue: username }
              }
            },
            limit: 1
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Firebase error: ${response.status}`);
      }
      
      const data = await response.json();
      const profileDoc = data.find(item => item.document);
      
      if (!profileDoc) {
        return new Response(JSON.stringify({ error: 'Profile not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const profile = convertDocument(profileDoc.document);
      
      // Fetch profile stats
      const stats = await fetchProfileStats(profile.userId || extractUserIdFromPath(profileDoc.document.name));
      
      const result = { ...profile, stats };
      
      // Cache result
      edgeCache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_DURATION}`,
          'X-Cache': bypassCache ? 'REFRESH' : 'MISS',
        }
      });
      
    } else {
      // Direct fetch by userId
      const profileUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/profiles/${userId}`;
      
      const response = await fsFetch(profileUrl);
      
      if (!response.ok) {
        if (response.status === 404) {
          return new Response(JSON.stringify({ error: 'Profile not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        throw new Error(`Firebase error: ${response.status}`);
      }
      
      const profileDoc = await response.json();
      const profile = convertDocument(profileDoc);
      
      // Fetch profile stats
      const stats = await fetchProfileStats(userId);
      
      const result = { ...profile, userId, stats };
      
      // Cache result
      edgeCache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_DURATION}`,
          'X-Cache': bypassCache ? 'REFRESH' : 'MISS',
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Profile edge function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// Helper: Fetch profile stats (votes, streak, etc.)
async function fetchProfileStats(userId) {
  const votesUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents:runQuery`;
  
  try {
    const response = await fsFetch(votesUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'votes' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'userId' },
              op: 'EQUAL',
              value: { stringValue: userId }
            }
          }
        }
      })
    });
    
    if (!response.ok) {
      console.warn('Could not fetch vote stats');
      return { voteCount: 0 };
    }
    
    const data = await response.json();
    const votes = data.filter(item => item.document).length;
    
    return {
      voteCount: votes,
    };
    
  } catch (error) {
    console.error('Error fetching profile stats:', error);
    return { voteCount: 0 };
  }
}

// Helper: Convert Firestore document
function convertDocument(doc) {
  const fields = doc.fields || {};
  const result = {};
  
  for (const [key, value] of Object.entries(fields)) {
    result[key] = extractValue(value);
  }
  
  if (doc.name && !result.userId) {
    const nameParts = doc.name.split('/');
    result.userId = nameParts[nameParts.length - 1];
  }
  
  return result;
}

function extractValue(field) {
  if (!field) return null;
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
    return (field.arrayValue.values || []).map(v => extractValue(v));
  }
  
  return null;
}

function extractUserIdFromPath(path) {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

export const config = { 
  path: "/api/profile"
};