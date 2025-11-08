import { getStore } from "@netlify/blobs";

export default async (request, context) => {
    const activityStore = getStore("activity");
    
    try {
        // Check cache first
        const cached = await activityStore.get("current-activity");
        
        if (cached) {
            const data = JSON.parse(cached);
            const age = Date.now() - data.timestamp;
            
            // Serve cached data if < 30 seconds old
            if (age < 30000) {
                return new Response(cached, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
                        "X-Cache-Status": "HIT",
                        "X-Cache-Age": Math.floor(age / 1000).toString()
                    }
                });
            }
        }
        
        // Cache miss or stale - fetch fresh data from Firestore
        console.log('🔄 Cache miss - fetching from Firestore');
        const activity = await fetchActivityFromFirestore(context);
        
        const response = {
            ...activity,
            timestamp: Date.now()
        };
        
        // Store in edge cache
        await activityStore.set("current-activity", JSON.stringify(response), {
            metadata: { updated: new Date().toISOString() }
        });
        
        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
                "X-Cache-Status": "MISS"
            }
        });
        
    } catch (error) {
        console.error('❌ Error in live-activity edge function:', error);
        
        // Return fallback data
        return new Response(JSON.stringify({
            hotMatches: [],
            totalActiveUsers: 0,
            lastUpdate: Date.now(),
            error: 'Service temporarily unavailable'
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, s-maxage=10"
            }
        });
    }
};

async function fetchActivityFromFirestore(context) {
    const projectId = context.env.get('FIREBASE_PROJECT_ID');
    const apiKey = context.env.get('FIREBASE_API_KEY');
    
    if (!projectId || !apiKey) {
        throw new Error('Firebase credentials not configured');
    }
    
    try {
        // Fetch the aggregated activity document
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/system/liveActivity?key=${apiKey}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Firestore API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Parse Firestore document format
        return {
            hotMatches: parseFirestoreArray(data.fields?.hotMatches),
            totalActiveUsers: parseInt(data.fields?.totalActiveUsers?.integerValue || '0'),
            lastUpdate: parseInt(data.fields?.lastUpdate?.integerValue || Date.now())
        };
        
    } catch (error) {
        console.error('Error fetching from Firestore:', error);
        throw error;
    }
}

function parseFirestoreArray(field) {
    if (!field?.arrayValue?.values) return [];
    
    return field.arrayValue.values.map(item => {
        if (!item.mapValue?.fields) return null;
        
        const fields = item.mapValue.fields;
        return {
            matchId: fields.matchId?.stringValue || '',
            recentVotes: parseInt(fields.recentVotes?.integerValue || '0'),
            song1: fields.song1?.stringValue || '',
            song2: fields.song2?.stringValue || '',
            thumbnailUrl: fields.thumbnailUrl?.stringValue || ''
        };
    }).filter(Boolean);
}

export const config = { 
    path: "/api/live-activity",
    cache: "manual" // We handle caching ourselves
};