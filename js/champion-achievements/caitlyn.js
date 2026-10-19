// Caitlyn's achievements. One file per champion (see js/champion-achievements/index.js for the rules every file follows).
// Ids start with the pack id. Read per-champion numbers from stats.byChampion.caitlyn (votes cast with Caitlyn active); the
// general vote numbers (stats.underdogVotes ...) count every vote whoever the companion was.

import { rule } from './templates.js';

const caitlyn = (metric, target, opts) => rule(metric, target, { packId: 'caitlyn', ...opts });

export const CAITLYN_ACHIEVEMENTS = {
  'caitlyn-close-calls': {
    id: 'caitlyn-close-calls',
    name: 'Close Calls',
    description: 'Vote in 10 close matches with Caitlyn as your champion. Unlocks Prestige Arcade',
    icon: '🔎',
    xp: 250,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    ...caitlyn('close', 10)
  },

  'caitlyn-steady-aim': {
    id: 'caitlyn-steady-aim',
    name: 'Steady Aim',
    description: 'Vote 7 days in a row with Caitlyn as your champion. Unlocks Prestige Arcade (2022)',
    icon: '🏹',
    xp: 250,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    ...caitlyn('streak', 7)
  },

  'caitlyn-deciding-shot': {
    id: 'caitlyn-deciding-shot',
    name: 'Deciding Shot',
    description: 'Cast the vote that breaks a tied match, whoever your champion is. Unlocks Prestige Arcane Commander for Caitlyn',
    icon: '🔫',
    xp: 500,
    hidden: false,
    tier: 'legendary',
    rarity: 'legendary',
    ...caitlyn('deciding', 1, { scope: 'all' })   // counts every vote, whoever the companion was
  }
};
