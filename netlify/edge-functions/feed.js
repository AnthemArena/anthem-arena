// ========================================
// FEED EDGE FUNCTION - JAVASCRIPT VERSION
// Caches feed at Netlify edge for fast reads
// ========================================

export default async (request, context) => {
  const url = new URL(request.url);
  const feedType = url.searchParams.get('type') || 'all';
  const limitParam = url.searchParams.get('limit') || '50';
  const limit = parseInt(limitParam);
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  // Handle OPTIONS for CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  
  try {
    console.log(`📥 Feed request: type=${feedType}, limit=${limit}`);
    
    // Import Firebase (dynamic import for edge function)
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const { getFirestore, collection, query, where, orderBy, limit: firestoreLimit, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    // Initialize Firebase (use your config)
    const firebaseConfig = {
      apiKey: context.env.FIREBASE_API_KEY || Deno.env.get('FIREBASE_API_KEY'),
      authDomain: context.env.FIREBASE_AUTH_DOMAIN || Deno.env.get('FIREBASE_AUTH_DOMAIN'),
      projectId: context.env.FIREBASE_PROJECT_ID || Deno.env.get('FIREBASE_PROJECT_ID'),
    };
    
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    // Query posts
    const postsQuery = query(
      collection(db, 'posts'),
      where('privacy', '==', 'public'),
      orderBy('timestamp', 'desc'),
      firestoreLimit(limit)
    );
    
    const snapshot = await getDocs(postsQuery);
    const posts = snapshot.docs.map(doc => doc.data());
    
    console.log(`✅ Fetched ${posts.length} posts from Firestore`);
    
    // Return cached response
    return new Response(JSON.stringify(posts), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        'X-Edge-Cache': 'HIT',
        'X-Posts-Count': posts.length.toString(),
      }
    });
    
  } catch (error) {
    console.error('❌ Edge function error:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      type: 'edge_function_error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Edge-Cache': 'MISS'
      }
    });
  }
};

export const config = { 
  path: "/api/feed",
  // Cache at the edge
  cache: "manual"
};