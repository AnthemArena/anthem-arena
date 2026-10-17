// Looks up what an ally/rival alert needs to be drawn: the voter's avatar (their profile; saved notifications never kept it)
// and the picture of each edit (from the cached match list). Never throws and never waits long: a toast must not be held up.
import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAllMatches } from './api-client.js';
import { avatarSrc, viewerAvatarSrc, fallbackAvatarFor, matchEdits } from './notification-visuals.js';

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

async function matchById(matchId) {
    if (!matchId) return null;
    if (Date.now() - matchesCache.at > 5 * 60 * 1000) {
        try { const list = await withTimeout(getAllMatches(), 3000); if (Array.isArray(list)) matchesCache = { at: Date.now(), list }; } catch { /* keep the old list */ }
    }
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
        const yourKey = JSON.parse(localStorage.getItem('userVotes') || '{}')[n.matchId]?.songId;
        out.edits = matchEdits(await matchById(n.matchId), yourKey, n.relationship);
    } catch (e) { console.warn('social context failed', e); }
    return out;
}

export async function enrichSocial(list) {
    await Promise.all((list || []).filter(n => n.relationship === 'ally' || n.relationship === 'opponent').map(async n => { n.nv = await socialContextFor(n); }));
    return list;
}
