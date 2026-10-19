// Jinx's achievements. One file per champion (see js/champion-achievements/index.js for the rules every file follows).
// Ids start with the pack id. Read per-champion numbers from stats.byChampion.jinx (votes cast with Jinx active); the
// general vote numbers (stats.underdogVotes ...) count every vote whoever the companion was.

export const JINX_ACHIEVEMENTS = {
  'jinx-loose-cannon': {
    id: 'jinx-loose-cannon',
    name: 'Loose Cannon',
    description: 'Vote for 10 underdogs, whoever your champion is. Unlocks Prestige Battle Cat for Jinx',
    icon: '💣',
    xp: 200,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.underdogVotes >= 10,
    progress: (stats) => ({ current: stats.underdogVotes, target: 10 })
  }
};
