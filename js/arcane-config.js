// ========================================
// ARCANE MOMENTS - SHARED CONFIG
// ========================================

export const ARCANE_CONFIG = {
    tournamentId: 'arcane-test-01',
    tournamentName: 'Arcane Moments',

    dataDragonVersion: '14.24.1',
    dataDragonChampionCdn:
        'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/',
    dataDragonSplashCdn:
        'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/',

    // Characters available for Arcane profile/avatar features.
    characters: [
        'Jinx',
        'Vi',
        'Caitlyn',
        'Ekko',
        'Jayce',
        'Viktor',
        'Heimerdinger',
        'Mel',
        'Vander',
        'Silco',
        'Powder',
        'Mylo',
        'Claggor',
        'Marcus'
    ]
};

// Companion packs are the characters that currently have
// personality-driven notification content.
export const COMPANION_PACKS = [
    {
        id: 'jinx',
        name: 'Jinx',
        championId: 'Jinx',
        enabled: true
    },
    {
        id: 'vi',
        name: 'Vi',
        championId: 'Vi',
        enabled: true
    },
    {
        id: 'caitlyn',
        name: 'Caitlyn',
        championId: 'Caitlyn',
        enabled: true
    }
];

export function getArcaneCharacter(name) {
    if (!name) return null;

    return ARCANE_CONFIG.characters.find(
        character => character.toLowerCase() === name.toLowerCase()
    ) || null;
}

export function getCompanionPack(id) {
    if (!id) return null;

    return COMPANION_PACKS.find(
        pack => pack.id.toLowerCase() === id.toLowerCase() && pack.enabled
    ) || null;
}

export function getChampionImageUrl(championId) {
    if (!championId) return null;

    return `${ARCANE_CONFIG.dataDragonChampionCdn}${championId}.png`;
}

export function getChampionSplashUrl(championId, skinNumber = 0) {
    if (!championId) return null;

    return `${ARCANE_CONFIG.dataDragonSplashCdn}${championId}_${skinNumber}.jpg`;
}