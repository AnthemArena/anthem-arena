// ========================================
// CHAMPION ACHIEVEMENTS: one file per champion
// ========================================
// Rules every champion file follows (tools/test-achievement-registry.mjs enforces them):
//   - the object key and `id` are the same, and start with the pack id ("vi-door-breaker"). General achievements never do.
//   - they read per-champion numbers from stats.byChampion.<packId> (votes cast with that companion active), so a new
//     champion can never change what a general achievement counts.
//   - a small budget: at most MAX_PER_CHAMPION achievements and MAX_XP_PER_CHAMPION XP in total, so ten champions cannot
//     outweigh the general set (or the level curve).
//   - an achievement either unlocks a skin (named in that pack's SKIN_UNLOCKS, js/champion-unlocks.js, and the other way round)
//     or says `noSkin: true` (XP and a title only). Prestige skins are only for champions that have a real one in the game.
//   - conditions come from the shared rules in ./templates.js (rule('early', 10, { packId })), so a rule is written and tested once.
// To add a champion: create js/champion-achievements/<packId>.js and add one line below. Nothing else is edited.

import { JINX_ACHIEVEMENTS } from './jinx.js';
import { CAITLYN_ACHIEVEMENTS } from './caitlyn.js';
import { VI_ACHIEVEMENTS } from './vi.js';

export const MAX_PER_CHAMPION = 5;
export const MAX_XP_PER_CHAMPION = 1000;

const FILES = {
    jinx: JINX_ACHIEVEMENTS,
    caitlyn: CAITLYN_ACHIEVEMENTS,
    vi: VI_ACHIEVEMENTS
};

export const CHAMPION_IDS = Object.keys(FILES);

// Every entry is stamped with its champion and the shared category, so a file cannot mislabel itself.
export const CHAMPION_ACHIEVEMENTS = Object.fromEntries(
    Object.entries(FILES).map(([packId, list]) => [packId, Object.fromEntries(
        Object.entries(list).map(([id, a]) => [id, { ...a, champion: packId, category: 'companions' }])
    )])
);

export const CHAMPION_ACHIEVEMENTS_FLAT = Object.assign({}, ...Object.values(CHAMPION_ACHIEVEMENTS));
