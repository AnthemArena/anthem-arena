// ========================================
// ARCANE MOMENTS - SHARED CONFIG
// ========================================

// THE one place the Data Dragon version lives. Only the versioned assets use it (champion squares, profile icons, spells, items,
// runes); splash and tile art are unversioned. To update: node tools/check-ddragon.mjs shows the newest version and checks that
// our icons exist there, then change this one line.
export const DATA_DRAGON_VERSION = '14.24.1';
export const ddragonUrl = path => `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/${path}`;
// Any versioned Data Dragon url (saved in a pack file, say) with the current version in it; other urls come back unchanged.
export const withCurrentVersion = url => (typeof url === 'string' ? url.replace(/^(https:\/\/ddragon\.leagueoflegends\.com\/cdn\/)\d+\.\d+\.\d+(\/)/, `$1${DATA_DRAGON_VERSION}$2`) : url);

export const ARCANE_CONFIG = {
    tournamentId: 'jinx-cup-1',
    tournamentName: 'Arcane Moments',

    // The character this cup is themed around. Drives the speech-bubble portrait and lines on the vote page, and the
    // companion/toast pack for anyone who has not chosen their own (companion ids, see COMPANION_PACKS below).
    cupChampion: 'jinx',

    dataDragonVersion: DATA_DRAGON_VERSION,
    dataDragonChampionCdn: ddragonUrl('img/champion/'),
    dataDragonSplashCdn:
        'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/',
    dataDragonTileCdn:
        'https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/',

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

// Square crop of a skin (a face, not a full-body splash). Skin 0 is the default look.
export function getChampionTileUrl(championId, skinNumber = 0) {
    if (!championId) return null;

    return `${ARCANE_CONFIG.dataDragonTileCdn}${championId}_${skinNumber}.jpg`;
}

// Companion id of this cup's champion; falls back to Jinx if the configured pack is missing or disabled.
export function getCupChampionId() {
    return getCompanionPack(ARCANE_CONFIG.cupChampion)?.id || 'jinx';
}

export function getChampionSplashUrl(championId, skinNumber = 0) {
    if (!championId) return null;

    return `${ARCANE_CONFIG.dataDragonSplashCdn}${championId}_${skinNumber}.jpg`;
}
// Exposed for classic (non-module) scripts such as modal.js.
if (typeof window !== 'undefined') {
    window.ARCANE_TOURNAMENT_ID = ARCANE_CONFIG.tournamentId;
    window.ARCANE_CUP_CHAMPION = getCupChampionId();
}
