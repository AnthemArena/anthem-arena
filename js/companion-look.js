// The skin each companion wears in alerts, bubbles and backdrops (see resolveLook in champion-unlocks.js).
// The person's choice is kept in localStorage.companionSkins ({ jinx: 37, vi: 0 }); their mastery comes from the saved
// per-companion XP and their achievements from localStorage, so it works the same on every page.
import { masteryLevel, resolveLook, SKIN_UNLOCKS } from './champion-unlocks.js';
import { readPackXp } from './xp-ledger.js';

const read = (storage, key, fallback) => { try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };

export const readLooks = (storage = globalThis.localStorage) => {
    const v = read(storage, 'companionSkins', {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};

export function lookState(packId, storage = globalThis.localStorage) {
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
