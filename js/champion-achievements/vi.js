// Vi's achievements. One file per champion (see js/champion-achievements/index.js for the rules every file follows).
// Vi has no prestige skin in the game, so these award XP and a title only (noSkin).
// Vi's signatures: being first through the door (early voter), volume (steady heavy hitting), and landing the right call (backing
// the edit that wins). The last one is counted once a match has finished, so it appears the next time achievements are checked.

import { ddragonUrl } from '../arcane-config.js';
import { rule } from './templates.js';

const vi = (metric, target) => rule(metric, target, { packId: 'vi' });

export const VI_ACHIEVEMENTS = {
  'vi-door-breaker': {
    id: 'vi-door-breaker',
    name: 'Door Breaker',
    description: 'Be among the first 10 voters in 10 matches, with Vi as your champion',
    icon: ddragonUrl('img/spell/ViQ.png'),   // Vi's Vault Breaker; the profile and the post-vote modal fall back to a trophy if it fails to load
    xp: 300,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    noSkin: true,
    ...vi('early', 10)
  },

  'vi-right-call': {
    id: 'vi-right-call',
    name: 'Right Call',
    description: 'Back the winning edit in 15 finished matches, with Vi as your champion',
    icon: '🎯',
    xp: 250,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    noSkin: true,
    ...vi('backedWinner', 15)
  },

  'vi-heavy-hitter': {
    id: 'vi-heavy-hitter',
    name: 'Heavy Hitter',
    description: 'Cast 30 votes with Vi as your champion',
    icon: '👊',
    xp: 250,
    hidden: false,
    tier: 'gold',
    rarity: 'epic',
    noSkin: true,
    ...vi('votes', 30)
  }
};
