// The alert shown when somebody picks their champion (Settings, or "Use" on the Champions tab): the standard event card in
// that champion's voice, with the skin they now wear. Same card family as level-up and mastery-up (js/global-notifications.js).
import { SKIN_UNLOCKS, masteryLevel } from './champion-unlocks.js';
import { getChampionSplashUrl } from './arcane-config.js';
import { readPackXp } from './xp-ledger.js';

const NAMES = { jinx: 'Jinx', vi: 'Vi', caitlyn: 'Caitlyn' };

// Pure: the bulletin object. `voiced` = what the champion's pack says ({ message, detail, cta }, may be null).
export function championSelectedBulletin({ packId, skinNum = 0, mastery = 1, voiced = null }) {
    const table = SKIN_UNLOCKS[packId];
    const name = NAMES[packId] || packId;
    const skin = table?.skins.find(s => s.num === skinNum);
    return {
        type: 'champion-selected',
        packId,
        message: voiced?.message || `${name} is now your champion.`,
        detail: [name, skin && skin.num !== 0 ? skin.name : null, `Mastery ${mastery}`].filter(Boolean).join(' · '),
        strip: table ? { thumbs: [getChampionSplashUrl(table.championId, skinNum)], more: 0 } : null,
        cta: voiced?.cta || 'View champions',
        duration: 6000
    };
}

// Shows it; falls back to the small notification when the alert system is not on this page.
export function announceChampionSelected(packId, skinNum = 0, storage = globalThis.localStorage) {
    const mastery = masteryLevel(readPackXp(storage)[packId]).level;
    const voiced = window.championLoader?.getAchievementMessage?.('champion-selected', { rank: `${NAMES[packId] || packId} Mastery ${mastery}`, xp: 0 });
    const bulletin = championSelectedBulletin({ packId, skinNum, mastery, voiced });
    if (window.showBulletin) window.showBulletin({ ...bulletin, ctaAction: () => { window.location.href = '/profile#champions'; } });
    else window.showNotification?.(bulletin.message, 'success');
}

// ---- Shown after Save ----------------------------------------------------------------------------------------------
// Saving reloads the profile page, which would cut a pop-up short. So Settings leaves a note for the next page load,
// which shows the card once the alert system is ready.
const PENDING_KEY = 'championSelectedPending';

export function markChampionSelected(packId, skinNum = 0, storage = globalThis.sessionStorage) {
    try { storage.setItem(PENDING_KEY, JSON.stringify({ packId, skinNum })); } catch { /* storage blocked: no alert, nothing lost */ }
}

// Reads and clears the note; null when there is none (or it is not a champion with levels).
export function takePendingChampion(storage = globalThis.sessionStorage) {
    try {
        const raw = storage.getItem(PENDING_KEY);
        if (!raw) return null;
        storage.removeItem(PENDING_KEY);
        const { packId, skinNum } = JSON.parse(raw);
        return SKIN_UNLOCKS[packId] ? { packId, skinNum: Number.isFinite(Number(skinNum)) ? Number(skinNum) : 0 } : null;
    } catch { return null; }
}

// Waits (up to ~8 s) for the alert system and the champion's voice, then shows the card.
export function announcePendingChampion(storage = globalThis.sessionStorage) {
    const pending = takePendingChampion(storage);
    if (!pending) return false;
    let tries = 0;
    const attempt = () => {
        const ready = window.showBulletin && window.championLoader?.getCurrentPack?.();
        if (ready || (window.showBulletin && tries >= 40)) announceChampionSelected(pending.packId, pending.skinNum);   // no voice by then: plain words
        else if (++tries <= 40) setTimeout(attempt, 200);
    };
    attempt();
    return true;
}
