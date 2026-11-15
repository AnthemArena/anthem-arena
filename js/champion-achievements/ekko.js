// Ekko's achievements. One file per champion (see js/champion-achievements/index.js for the rules every file follows).
// Ids start with the pack id. Per-champion numbers come from stats.byChampion.ekko (votes cast with Ekko active); the general
// vote numbers count every vote, whoever the companion was. Budget: 250 + 250 + 500 = 1,000 XP.

import { rule } from './templates.js';

const ekko = (metric, target, opts) => rule(metric, target, { packId: 'ekko', ...opts });

export const EKKO_ACHIEVEMENTS = {
  'ekko-ahead-of-time': {
    id: 'ekko-ahead-of-time',
    name: 'Ahead of Time',
    description: 'Be among the first 10 voters in 10 matches, with Ekko as your champion',
    icon: '⏳',
    xp: 250,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    noSkin: true,
    ...ekko('early', 10)
  },

  'ekko-second-chances': {
    id: 'ekko-second-chances',
    name: 'Second Chances',
    description: 'Back an edit that was behind and came back, 5 times, with Ekko as your champion',
    icon: '🔁',
    xp: 250,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    noSkin: true,
    ...ekko('againstTide', 5)
  },

  'ekko-zero-hour': {
    id: 'ekko-zero-hour',
    name: 'Zero Hour',
    description: 'Cast the vote that breaks a tied match, whoever your champion is. Unlocks Prestige Star Guardian for Ekko',
    icon: '🕰️',
    xp: 500,
    hidden: false,
    tier: 'legendary',
    rarity: 'legendary',
    ...ekko('deciding', 1, { scope: 'all' })
  }
};
