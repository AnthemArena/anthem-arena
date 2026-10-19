// Jinx's achievements. One file per champion (see js/champion-achievements/index.js for the rules every file follows).
// Ids start with the pack id. Rules come from ./templates.js and count votes cast with Jinx active unless scope 'all' is given.
// Jinx's signatures: backing the underdog, and backing the side that is losing.

import { rule } from './templates.js';

const jinx = (metric, target) => rule(metric, target, { packId: 'jinx' });

export const JINX_ACHIEVEMENTS = {
  'jinx-loose-cannon': {
    id: 'jinx-loose-cannon',
    name: 'Loose Cannon',
    description: 'Back 10 underdogs with Jinx as your champion. Unlocks Prestige Battle Cat',
    icon: '💣',
    xp: 200,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    ...jinx('underdog', 10)
  },

  'jinx-chaos-agent': {
    id: 'jinx-chaos-agent',
    name: 'Chaos Agent',
    description: 'Back 5 edits that were behind 60-40 or worse when you voted, with Jinx as your champion',
    icon: '🌀',
    xp: 250,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    noSkin: true,
    ...jinx('againstTide', 5)
  }
};
