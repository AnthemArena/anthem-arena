// POST /.netlify/functions/discover-edits   { days: 14 }   Authorization: Bearer <Firebase ID token of the admin>
// Searches YouTube for new Shorts that match the champion rules, drops everything already in data/edits.json,
// and returns the rest. Costs about 100 YouTube quota units per query (see DISCOVER_RULES): 12 queries = ~1,200 units (2,400 for the all-time search, which reads two pages per query).
import { DISCOVER_RULES, knownIds, buildCandidates, publishedAfter } from '../shared/discover-model.js';

const ADMIN_UIDS = ['T3tYzd29FseCMWwBSBzH3IHURej2'];   // same list as isAdmin() in firestore.rules
const FIREBASE_WEB_KEY = 'AIzaSyCApnc605mPNOEsAcVnKeXbBTokk7iZP5E';   // public by design (it is in js/firebase-config.js)
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

async function adminUid(authHeader) {
    const token = /^Bearer (.+)$/.exec(authHeader || '')?.[1];
    if (!token) return null;
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
    });
    if (!res.ok) return null;
    const uid = (await res.json()).users?.[0]?.localId;
    return ADMIN_UIDS.includes(uid) ? uid : null;
}

// Results for the same window are reused for 10 minutes, so a double click does not spend the quota twice.
const cache = new Map();
const PAGES_FIRST_ALL_TIME = 2;   // the all-time search reads two pages (100 results) per query on its first run

export async function handler(event) {
    if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
    if (!await adminUid(event.headers.authorization || event.headers.Authorization)) return json(403, { error: 'Admin sign-in required.' });
    const KEY = process.env.YOUTUBE_API_KEY_SERVER || process.env.YOUTUBE_API_KEY;
    if (!KEY) return json(500, { error: 'YOUTUBE_API_KEY_SERVER is not set in Netlify.' });

    let req = {};
    try { req = JSON.parse(event.body || '{}'); } catch { /* defaults */ }
    const allTime = parseInt(req.days, 10) === 0;
    const after = publishedAfter(req.days)?.slice(0, 10) || null;   // day precision keeps the cache key stable
    const loadMore = !!req.ruleId;                                  // "Load more" for one champion: next pages only
    const cacheKey = after || 'all';
    if (!loadMore) {
        const hit = cache.get(cacheKey);
        if (hit && Date.now() - hit.at < 600000) return json(200, { ...hit.body, cached: true, quotaUsed: 0 });
    }

    const yt = async (path, params) => {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: KEY })}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message || `YouTube error ${res.status}`);
        return body;
    };

    try {
        const host = event.headers['x-forwarded-host'] || event.headers.host;
        const proto = event.headers['x-forwarded-proto'] || 'https';
        const poolRes = await fetch(`${process.env.URL || `${proto}://${host}`}/data/edits.json`);
        const pool = JSON.parse(await poolRes.text());   // a missing file comes back as the home page (catch-all redirect): this throws
        const known = knownIds(pool);

        const rules = loadMore ? DISCOVER_RULES.filter(r => r.id === req.ruleId) : DISCOVER_RULES;
        const searchedBy = {}, ids = new Set(), next = {};
        let quota = 0;
        for (const rule of rules) {
            next[rule.id] = {};
            for (const q of rule.queries) {
                let token = loadMore ? req.tokens?.[q] : undefined;
                if (loadMore && !token) continue;   // that query has no more pages
                const pages = allTime && !loadMore ? PAGES_FIRST_ALL_TIME : 1;
                for (let page = 0; page < pages; page++) {
                    const params = { part: 'snippet', type: 'video', order: allTime ? 'viewCount' : 'date', videoDuration: 'short', maxResults: '50', q };
                    if (after) params.publishedAfter = `${after}T00:00:00Z`;
                    if (token) params.pageToken = token;
                    const r = await yt('search', params);
                    quota += 100;
                    for (const it of r.items || []) { const id = it.id?.videoId; if (!id) continue; ids.add(id); (searchedBy[id] ||= []).push(q); }
                    token = r.nextPageToken;
                    if (!token) break;
                }
                if (token) next[rule.id][q] = token;
            }
        }
        const fresh = [...ids].filter(id => !known.has(id));
        const items = [];
        for (let i = 0; i < fresh.length; i += 50) {
            const r = await yt('videos', { part: 'snippet,contentDetails,statistics,status', maxResults: '50', id: fresh.slice(i, i + 50).join(',') });
            quota += 1; items.push(...(r.items || []));
        }
        const groups = buildCandidates(items, rules, known, searchedBy, allTime ? 'views' : 'date');
        const body = {
            days: Number(req.days) || 0, searched: ids.size, alreadyHave: ids.size - fresh.length, quotaUsed: quota,
            groups: rules.map(r => ({ id: r.id, label: r.label, candidates: groups[r.id], more: Object.keys(next[r.id]).length > 0, tokens: next[r.id] }))
        };
        if (!loadMore) cache.set(cacheKey, { at: Date.now(), body });
        return json(200, body);
    } catch (e) {
        return json(502, { error: e.message });
    }
}
