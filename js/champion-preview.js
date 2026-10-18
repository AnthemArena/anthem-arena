// Settings > Your Champion > "Preview alert": each press shows the next sample alert in the champion's own voice
// (match alerts, welcome, achievement, level-up, mastery-up). The samples use made-up songs and the button only closes the
// card, so a preview never opens a page. Sample shapes follow test-toasts.html.
import { ACHIEVEMENTS } from './achievements.js';
import { SKIN_UNLOCKS } from './champion-unlocks.js';
import { getChampionSplashUrl, ddragonUrl } from './arcane-config.js';

const THUMB = 'https://img.youtube.com/vi/C3GouGa0noM/mqdefault.jpg';
const NAMES = { jinx: 'Jinx', vi: 'Vi', caitlyn: 'Caitlyn' };

const matchAlert = (type, data, extra) => ({ voice, dismiss }) => {
    const m = voice.alert(type, { songTitle: 'GODS', ...data });
    return {
        type, matchId: 'preview', song: 'GODS', opponent: 'RISE', thumbnailUrl: THUMB, ...extra,
        message: m?.message || `${type}`, detail: m?.detail || '', cta: m?.cta || 'Close preview', ctaAction: dismiss, duration: 6000
    };
};

// label = what the button says next to the step count
export const PREVIEW_STEPS = [
    { id: 'nailbiter', label: 'Nail-biter', build: matchAlert('nailbiter', { voteDiff: 2, voteDiffPlural: 's', userPct: 49, opponentPct: 51 }, { voteDiff: 2, userPct: 49, opponentPct: 51, priority: 2 }) },
    { id: 'winning', label: 'Winning', build: matchAlert('winning', { userPct: 72, opponentPct: 28, voteDiff: 44 }, { userPct: 72, opponentPct: 28, priority: 4 }) },
    { id: 'comeback', label: 'Comeback', build: matchAlert('comeback', { userPct: 55, opponentPct: 45 }, { userPct: 55, opponentPct: 45, priority: 3 }) },
    {
        id: 'welcome', label: 'Welcome back', build: ({ voice, dismiss }) => {
            const w = voice.custom('welcome-back');
            return { priority: 1, type: 'welcome', welcomeType: 'back', matchId: 'preview', thumbnailUrl: THUMB, message: w?.message || 'Welcome back.', detail: w?.detail || '', cta: w?.cta || 'Close preview', ctaAction: dismiss, duration: 6000 };
        }
    },
    {
        id: 'achievement', label: 'Achievement', build: ({ voice, dismiss }) => {
            const a = ACHIEVEMENTS.spark || { name: 'Spark', description: 'Vote on 3 consecutive days', xp: 50, rarity: 'common' };
            const m = voice.achievement('spark', { name: a.name, description: a.description, xp: a.xp, rarity: a.rarity });
            return {
                priority: 2, type: 'achievement', matchId: 'achievement-preview', thumbnailUrl: ddragonUrl('img/item/3041.png'),
                icon: '🏆', achievementName: a.name, rarity: a.rarity,
                message: m?.message || `Achievement unlocked: ${a.name}`, detail: m?.detail || `${a.description} • +${a.xp} XP`, cta: m?.cta || 'Close preview', ctaAction: dismiss, duration: 6000
            };
        }
    },
    {
        id: 'level-up', label: 'Level up', build: ({ voice, dismiss }) => {
            const m = voice.achievement('level-up', { rank: 'Streetwise', xp: 100 });
            return { type: 'level-up', level: 5, message: m?.message || 'New Arcane rank!', detail: m?.detail || 'You reached Streetwise.', cta: m?.cta || 'Close preview', ctaAction: dismiss, duration: 6000 };
        }
    },
    {
        id: 'mastery-up', label: 'Mastery up', build: ({ voice, packId, dismiss }) => {
            const table = SKIN_UNLOCKS[packId];
            const unlocked = (table?.skins || []).filter(s => !s.achievement && s.mastery === 3);
            const m = voice.achievement('mastery-up', { rank: `${NAMES[packId] || packId} Mastery 3`, xp: 100 });
            return {
                type: 'mastery-up', level: 3, packId, message: m?.message || `${NAMES[packId] || packId} Mastery 3!`,
                detail: unlocked.length ? `Unlocked: ${unlocked.map(s => s.name).join(', ')}` : (m?.detail || 'Mastery 3'),
                strip: unlocked.length ? { thumbs: unlocked.slice(0, 3).map(s => getChampionSplashUrl(table.championId, s.num)), more: 0 } : null,
                cta: m?.cta || 'Close preview', ctaAction: dismiss, duration: 6000
            };
        }
    }
];

// index wraps around. `voice` = { alert(type, data), achievement(id, data), custom(type) } (the champion loader's lookups).
export function buildPreview(index, { voice, packId, dismiss }) {
    const i = ((Number(index) || 0) % PREVIEW_STEPS.length + PREVIEW_STEPS.length) % PREVIEW_STEPS.length;
    const step = PREVIEW_STEPS[i];
    return { step, number: i + 1, total: PREVIEW_STEPS.length, bulletin: step.build({ voice, packId, dismiss }) };
}
