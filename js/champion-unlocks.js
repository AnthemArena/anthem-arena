// ========================================
// CHAMPION MASTERY + SKIN UNLOCKS (data and pure helpers)
// ========================================
// Each companion pack (Jinx, Vi, Caitlyn) has its own mastery level 1-10, filled by the XP earned while that companion is
// active (profile.packXp, see xp-ledger.js). Mastery unlocks that champion's skins; the rarest ones need a pack achievement.
// Skin numbers are Data Dragon's `num` (splash: .../champion/splash/<Id>_<num>.jpg). Chromas are never listed.
// The design and the reasons for the order are in docs/arcane_moments.md ("Champion mastery and skin unlocks").

// XP needed to REACH each mastery level (index 0 = level 1). Slow on purpose.
export const MASTERY_XP = [0, 100, 300, 600, 1000, 1600, 2400, 3500, 5000, 7500];
export const MAX_MASTERY = MASTERY_XP.length;

const m = (mastery, num, name) => ({ num, name, mastery });
const a = (achievement, num, name) => ({ num, name, achievement });

// `achievement` ids below are the pack achievements still to be added to js/achievements.js (the skins stay locked until then).
export const SKIN_UNLOCKS = {
    jinx: {
        championId: 'Jinx',
        skins: [
            m(1, 0, 'Classic'),
            m(2, 37, 'Arcane Enemy'),
            m(3, 1, 'Crime City'), m(3, 2, 'Firecracker'),
            m(4, 3, 'Zombie Slayer'), m(4, 12, 'Ambitious Elf'),
            m(5, 13, 'Odyssey'), m(5, 29, 'Heartseeker'),
            m(6, 20, 'PROJECT'), m(6, 51, 'Cafe Cuties'),
            m(7, 4, 'Star Guardian'), m(7, 65, 'Ocean Song'),
            m(8, 38, 'Battle Cat'),
            m(9, 62, 'T1'),
            m(10, 60, 'Arcane Fractured'),
            a('jinx-loose-cannon', 40, 'Prestige Battle Cat')
        ]
    },
    vi: {
        championId: 'Vi',
        skins: [
            m(1, 0, 'Classic'),
            m(2, 29, 'Arcane Undercity'),
            m(3, 1, 'Neon Strike'), m(3, 2, 'Officer'),
            m(4, 3, 'Debonair'), m(4, 4, 'Demon'),
            m(5, 5, 'Warring Kingdoms'), m(5, 11, 'PROJECT'),
            m(6, 12, 'Heartbreaker'),
            m(7, 30, 'Heartache'), m(7, 20, 'PsyOps'),
            m(8, 39, 'Primal Ambush'),
            m(9, 49, 'T1'),
            m(10, 48, 'Arcane Brawler')
        ]
    },
    caitlyn: {
        championId: 'Caitlyn',
        skins: [
            m(1, 0, 'Classic'),
            m(2, 28, 'Arcane Enforcer'),
            m(3, 5, 'Officer'), m(3, 2, 'Sheriff'),
            m(4, 1, 'Resistance'), m(4, 3, 'Safari'),
            m(5, 4, 'Arctic Warfare'), m(5, 6, 'Headhunter'),
            m(6, 11, 'Pulsefire'), m(6, 10, 'Lunar Wraith'),
            m(7, 13, 'Pool Party'), m(7, 19, 'Arcade'),
            m(8, 22, 'Battle Academia'), m(8, 30, 'Snow Moon'),
            m(9, 39, 'Heartthrob'), m(9, 54, 'Firecracker'), m(9, 48, 'DRX'),
            m(10, 50, 'Arcane Commander'),
            a('caitlyn-close-calls', 20, 'Prestige Arcade'),
            a('caitlyn-steady-aim', 29, 'Prestige Arcade (2022)'),
            a('caitlyn-deciding-shot', 51, 'Prestige Arcane Commander')
        ]
    }
};

const clean = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

// Mastery level and progress for an amount of pack XP.
export function masteryLevel(xp) {
    const total = clean(xp);
    let idx = 0;
    for (let i = MASTERY_XP.length - 1; i >= 0; i--) if (total >= MASTERY_XP[i]) { idx = i; break; }
    const isMax = idx === MASTERY_XP.length - 1;
    const floor = MASTERY_XP[idx], ceil = isMax ? floor : MASTERY_XP[idx + 1];
    return {
        level: idx + 1, xp: total, isMax,
        progressXp: isMax ? 0 : total - floor,
        neededXp: isMax ? 0 : ceil - floor,
        nextLevelXp: isMax ? null : ceil,
        percent: isMax ? 100 : Math.min(100, Math.floor(((total - floor) / (ceil - floor)) * 100))
    };
}

export const skinsFor = packId => SKIN_UNLOCKS[packId]?.skins || [];

// Is this skin unlocked? `state` = { level (mastery level), achievements (ids the person has) }.
export function isSkinUnlocked(skin, state = {}) {
    if (!skin) return false;
    if (skin.achievement) return (state.achievements || []).includes(skin.achievement);
    return clean(state.level) >= skin.mastery;
}

export function unlockedSkins(packId, state) {
    return skinsFor(packId).filter(s => isSkinUnlocked(s, state));
}

// What a level-up (from level `from` to level `to`) newly unlocks, for the level-up alert.
export function skinsUnlockedBetween(packId, from, to) {
    return skinsFor(packId).filter(s => !s.achievement && s.mastery > clean(from) && s.mastery <= clean(to));
}

// The next thing to work towards: the next mastery level that unlocks a skin, or null at the top.
export function nextUnlock(packId, level) {
    const next = skinsFor(packId).filter(s => !s.achievement && s.mastery > clean(level)).sort((x, y) => x.mastery - y.mastery)[0];
    return next ? { mastery: next.mastery, skins: skinsFor(packId).filter(s => !s.achievement && s.mastery === next.mastery) } : null;
}

// A skin the person may use as their look: falls back to the classic skin (0) when the saved one is not unlocked.
export function usableSkin(packId, wantedNum, state) {
    const skin = skinsFor(packId).find(s => s.num === wantedNum);
    return skin && isSkinUnlocked(skin, state) ? skin.num : 0;
}

// The look a companion has in alerts, bubbles and backdrops: the skin the person chose when it is unlocked (the classic skin
// 0 always is), otherwise the Arcane skin once it is unlocked (mastery 2), otherwise the classic skin.
export function resolveLook(packId, chosen, state) {
    const skins = skinsFor(packId);
    if (!skins.length) return 0;
    const open = num => { const sk = skins.find(x => x.num === num); return !!sk && isSkinUnlocked(sk, state); };
    if (Number.isInteger(chosen) && open(chosen)) return chosen;
    const arcane = skins.find(x => x.mastery === 2);
    return arcane && open(arcane.num) ? arcane.num : 0;
}
