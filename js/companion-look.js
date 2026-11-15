// The skin each companion wears in alerts, bubbles and backdrops (see resolveLook in champion-unlocks.js).
// The person's choice is kept in localStorage.companionSkins ({ jinx: 37, vi: 0 }); their mastery comes from the saved
// per-companion XP and their achievements from localStorage, so it works the same on every page.
import { masteryLevel, resolveLook, SKIN_UNLOCKS, MAX_MASTERY } from './champion-unlocks.js';
import { readPackXp } from './xp-ledger.js';

const read = (storage, key, fallback) => { try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };

export const readLooks = (storage = globalThis.localStorage) => {
    const v = read(storage, 'companionSkins', {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};

// test-toasts.html can switch this on so every skin can be tried without earning it (it is never set anywhere else).
// The switch only lasts an hour (TEST_UNLOCK_KEY + 'At' holds when it was set), so a forgotten one cannot change the real site
// for long. Without that timestamp it counts as off.
export const TEST_UNLOCK_KEY = 'testUnlockAllSkins';
export const TEST_UNLOCK_HOURS = 1;
export function enableTestUnlock(storage = globalThis.localStorage, now = Date.now()) {
    try { storage.setItem(TEST_UNLOCK_KEY, '1'); storage.setItem(TEST_UNLOCK_KEY + 'At', String(now)); } catch { /* storage blocked */ }
}
export function disableTestUnlock(storage = globalThis.localStorage) {
    try { storage.removeItem(TEST_UNLOCK_KEY); storage.removeItem(TEST_UNLOCK_KEY + 'At'); } catch { /* storage blocked */ }
}
export function testUnlockOn(storage = globalThis.localStorage, now = Date.now()) {
    try {
        if (storage?.getItem(TEST_UNLOCK_KEY) !== '1') return false;
        const at = Number(storage.getItem(TEST_UNLOCK_KEY + 'At'));
        const on = Number.isFinite(at) && at > 0 && now - at < TEST_UNLOCK_HOURS * 3600 * 1000;
        if (!on) disableTestUnlock(storage);   // expired or never timed: clear it
        return on;
    } catch { return false; }
}
const ALL_SKIN_ACHIEVEMENTS = Object.values(SKIN_UNLOCKS).flatMap(p => p.skins).filter(sk => sk.achievement).map(sk => sk.achievement);

export function lookState(packId, storage = globalThis.localStorage) {
    if (testUnlockOn(storage)) return { level: MAX_MASTERY, achievements: ALL_SKIN_ACHIEVEMENTS };
    return { level: masteryLevel(readPackXp(storage)[packId]).level, achievements: read(storage, 'unlockedAchievements', []) };
}

// The skin number a companion pack wears right now (packs without skins keep their own portrait.skin).
export function lookSkin(pack, storage = globalThis.localStorage) {
    const id = pack?.id;
    if (!SKIN_UNLOCKS[id]) return pack?.portrait?.skin ?? 0;
    return resolveLook(id, readLooks(storage)[id], lookState(id, storage));
}

export function saveLook(packId, num, storage = globalThis.localStorage) {
    const looks = { ...readLooks(storage), [packId]: num };
    try { storage.setItem('companionSkins', JSON.stringify(looks)); } catch { /* storage blocked */ }
    return looks;
}
