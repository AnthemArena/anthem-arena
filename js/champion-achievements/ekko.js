// Ekko's achievements. One file per champion (see js/champion-achievements/index.js for the rules every file follows).
// Ids start with the pack id. Per-champion numbers come from stats.byChampion.ekko (votes cast with Ekko active); the general
// vote numbers count every vote, whoever the companion was. Budget: 250 + 250 + 500 = 1,000 XP. The names and toast lines come from the Ekko pack (champion-packs/ekko.json).

import { rule } from './templates.js';

const ekko = (metric, target, opts) => rule(metric, target, { packId: 'ekko', ...opts });

export const EKKO_ACHIEVEMENTS = {
  'ekko-timekeeper': {
    id: 'ekko-timekeeper',
    name: 'Timekeeper',
    description: 'Vote in 10 close matches with Ekko as your champion',
    icon: '⏳',
    xp: 250,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    noSkin: true,
    ...ekko('close', 10)
  },

  'ekko-second-chance': {
    id: 'ekko-second-chance',
    name: 'Second Chance',
    description: 'Back an edit that was behind and came back, 5 times, with Ekko as your champion',
    icon: '🔁',
    xp: 250,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    noSkin: true,
    ...ekko('againstTide', 5)
  },

  'ekko-firelight': {
    id: 'ekko-firelight',
    name: 'Firelight',
    description: 'Share 15 times, whoever your champion is. Unlocks Prestige Star Guardian for Ekko',
    icon: '🔥',
    xp: 500,
    hidden: false,
    tier: 'legendary',
    rarity: 'legendary',
    ...ekko('shares', 15, { scope: 'all' })   // counts every share, whoever the companion was
  }
};
