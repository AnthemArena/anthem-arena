// Looks up what an ally/rival alert needs to be drawn: the voter's avatar (their profile; saved notifications never kept it)
// and the picture of each edit (from the cached match list). Never throws and never waits long: a toast must not be held up.
import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAllMatches } from './api-client.js';
import { avatarSrc, viewerAvatarSrc, fallbackAvatarFor, matchEdits, eventEdits } from './notification-visuals.js';
import { isContentNotification, isEventNotification, isStreakNotification } from './notification-model.js';

const avatarCache = new Map();          // userId -> url | null
let matchesCache = { at: 0, list: [] };
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

async function profileAvatar(userId) {
    if (!userId) return null;
    if (avatarCache.has(userId)) return avatarCache.get(userId);
    let src = null;
    try {
        const snap = await withTimeout(getDoc(doc(db, 'profiles', userId)), 2500);
        if (snap && snap.exists()) src = avatarSrc(snap.data().avatar);
    } catch { /* offline or no profile */ }
    avatarCache.set(userId, src);
    return src;
}

let matchesInflight = null;
let matchesFetch = null;            // the real request; it keeps running after a caller gives up, and fills the cache when it lands
function startMatchesFetch() {
    matchesFetch = matchesFetch || Promise.resolve().then(() => getAllMatches()).then(list => {
        if (Array.isArray(list)) matchesCache = { at: Date.now(), list };
        return list;
    }).catch(() => null).finally(() => { matchesFetch = null; });
    return matchesFetch;
}

// Resolves true once the match list is available (waits up to ms for a slow request)
export async function matchesLoaded(ms = 10000) {
    if (matchesCache.list.length) return true;
    await withTimeout(startMatchesFetch(), ms);
    return matchesCache.list.length > 0;
}

// The sample alerts on test-toasts.html use made-up match ids; show the first real match instead so the pictures can be checked.
const isSampleMatch = id => /^test-(?!round-opening)/.test(String(id || ''));

async function matchById(matchId) {
    if (!matchId) return null;
    if (Date.now() - matchesCache.at > 5 * 60 * 1000) {
        // One request shared by every row; a slow one is not abandoned (see startMatchesFetch)
        matchesInflight = matchesInflight || withTimeout(startMatchesFetch(), 3000).finally(() => { matchesInflight = null; });
        await matchesInflight;
    }
    if (isSampleMatch(matchId)) return matchesCache.list[0] || null;
    return matchesCache.list.find(m => (m.matchId || m.id) === matchId) || null;
}

// n: an ally/rival notification (or group). Returns what the renderers read as n.nv
export async function socialContextFor(n) {
    const out = { theirSrc: null, yourSrc: viewerAvatarSrc() || fallbackAvatarFor(localStorage.getItem('username')), edits: null, avatars: null };
    try {
        out.theirSrc = avatarSrc(n.thumbnailUrl) || await profileAvatar(n.triggerUserId) || fallbackAvatarFor(n.triggerUsername);
        if (n.userIds && n.userIds.length > 1) {
            out.avatars = await Promise.all(n.userIds.map(async (id, i) => (id && await profileAvatar(id)) || avatarSrc((n.avatars || [])[i]) || fallbackAvatarFor((n.users || [])[i])));
        }
        if (n.relationship === 'ally' || n.relationship === 'opponent') {      // only vote alerts draw the two edits
            const yourKey = isSampleMatch(n.matchId) ? 'song1' : JSON.parse(localStorage.getItem('userVotes') || '{}')[n.matchId]?.songId;
            out.edits = matchEdits(await matchById(n.matchId), yourKey, n.relationship);
            if (!out.edits) console.debug('social context: no edit pictures', { matchId: n.matchId, yourKey, haveMatches: matchesCache.list.length });
        }
    } catch (e) { console.warn('social context failed', e); }
    return out;
}

// A match-event alert (danger, closing, match result ...): the two edit pictures with the viewer's own pick marked, as n.nv.edits.
export async function eventContextFor(n) {
    const out = { edits: null };
    try {
        if (!n?.matchId) return out;
        const yourKey = isSampleMatch(n.matchId) ? 'song1' : JSON.parse(localStorage.getItem('userVotes') || '{}')[n.matchId]?.songId;
        out.edits = eventEdits(await matchById(n.matchId), yourKey);
    } catch (e) { console.warn('event context failed', e); }
    return out;
}

export async function enrichSocial(list) {
    await Promise.all((list || []).filter(n => n.relationship === 'ally' || n.relationship === 'opponent' || n.type === 'new-follower' || n.type === 'follow' || isContentNotification(n) || isEventNotification(n) || isStreakNotification(n)).map(async n => { n.nv = isEventNotification(n) ? await eventContextFor(n) : await socialContextFor(n); }));
    return list;
}
