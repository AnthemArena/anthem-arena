// ========================================
// FIREBASE EDGE CACHE - NETLIFY EDGE FUNCTION
// Caches Firebase data at CDN edge for 5 minutes
// ========================================

const CACHE_DURATION = 300; // 5 minutes in seconds
const FIREBASE_PROJECT = "league-music-tournament"; // ✅ Your project ID
const TOURNAMENT = "2025-worlds-anthems";

// Edge cache storage
const edgeCache = new Map();

// ========================================
// MAIN HANDLER
// ========================================

export default async (request, context) => {
  const url = new URL(request.url);
  const cacheKey = url.pathname;
  
  console.log(`📡 Edge request: ${cacheKey}`);
  
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
  
  // Cache miss - fetch from Firebase
  console.log(`❌ CACHE MISS: ${cacheKey} - fetching from Firebase`);
  
  try {
    let firebaseUrl = "";
    
    // Route to correct Firebase endpoint
    if (url.pathname === "/api/matches") {
      // Get all matches
      firebaseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${TOURNAMENT}/matches`;
      
    } else if (url.pathname.startsWith("/api/match/")) {
      // Get single match
      const matchId = url.pathname.replace("/api/match/", "");
      firebaseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/tournaments/${TOURNAMENT}/matches/${matchId}`;
    }
    
    if (!firebaseUrl) {
      return new Response(JSON.stringify({ error: "Invalid endpoint" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    
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
    const transformed = transformFirestoreData(firestoreData);
    
    // Store in edge cache
    edgeCache.set(cacheKey, { data: transformed, timestamp: now });
    
    console.log(`✅ Cached at edge: ${cacheKey}`);
    
    return new Response(JSON.stringify(transformed), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_DURATION}`,
        "X-Cache": "MISS",
        "Access-Control-Allow-Origin": "*"
      }
    });
    
  } catch (error) {
    console.error("❌ Edge function error:", error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      endpoint: url.pathname 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

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

export const config = {
  path: ["/api/matches", "/api/match/*"]
};