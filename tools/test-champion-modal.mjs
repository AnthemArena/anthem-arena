// Unit tests for js/champion-modal.js (pure helpers) and the Jinx modal lines.   node tools/test-champion-modal.mjs
import fs from 'node:fs';
import { pickModalKey, chooseModalLine, modalLinesFor, buildPostVoteModalHtml, MODAL_KEYS, TAG_FOR_KEY } from '../js/champion-modal.js';
let failed = 0;
const check = (name, ok, got) => { console.log((ok ? '  ok  ' : 'FAIL  ') + name + (ok ? '' : '   got: ' + JSON.stringify(got))); if (!ok) failed++; };

check('first vote ever wins over everything', pickModalKey({ isFirstEver: true, streak: 5, isUnderdog: true, isEarly: true }) === 'first-vote');
check('streak of 2+ beats underdog', pickModalKey({ streak: 2, isUnderdog: true }) === 'streak');
check('streak of 1 is not a streak', pickModalKey({ streak: 1 }) === 'default');
check('underdog beats early', pickModalKey({ isUnderdog: true, isEarly: true }) === 'underdog');
check('early beats close', pickModalKey({ isEarly: true, situationType: 'nailbiter' }) === 'early');
check('nail-biter / tied / losing-close / winning-close are "close"', ['nailbiter', 'tied', 'losing-close', 'winning-close'].every(s => pickModalKey({ situationType: s }) === 'close'));
check('losing-bad is "behind", dominating is "ahead"', pickModalKey({ situationType: 'losing-bad' }) === 'behind' && pickModalKey({ situationType: 'dominating' }) === 'ahead');
check('nothing known is "default"', pickModalKey({}) === 'default' && pickModalKey() === 'default');

const jinx = JSON.parse(fs.readFileSync(new URL('../champion-packs/jinx.json', import.meta.url)));
check('Jinx has lines for every key', MODAL_KEYS.every(k => Array.isArray(jinx.modal?.[k]) && jinx.modal[k].length >= 2), Object.keys(jinx.modal || {}));
check('every key has a tag entry', MODAL_KEYS.every(k => k in TAG_FOR_KEY));
check('no Jinx line leaves a placeholder after filling', MODAL_KEYS.every(k => jinx.modal[k].every((_, i) => !/[{}]/.test(chooseModalLine({ modal: { [k]: [jinx.modal[k][i]] } }, k, { pick: 'Edit', streak: 3 }, 'm')))));
check('the same match and key give the same line', chooseModalLine(jinx, 'early', {}, 'm1') === chooseModalLine(jinx, 'early', {}, 'm1'));
check('streak line fills the number', modalLinesFor({ modal: { streak: ['{streak} days'] } }, 'streak')[0] === '{streak} days' && chooseModalLine({ modal: { streak: ['{streak} days'] } }, 'streak', { streak: 4 }) === '4 days');
check('a pack without "modal" falls back to plain lines for every key', MODAL_KEYS.every(k => chooseModalLine({}, k, { pick: 'X', streak: 2 }).length > 0));
check('the lines never promise standings that may be wrong (no percentages)', MODAL_KEYS.every(k => jinx.modal[k].every(l => !l.includes('%'))));

const html = buildPostVoteModalHtml({
    situationType: 'early', line: 'Hi <b>there</b>', tag: 'Early voter', championName: 'Jinx', portraitUrl: 'https://x/y.jpg', splashUrl: 'https://x/s.jpg',
    voteTitle: 'Edit "A" <script>', songNameRaw: "It's A", shareContext: 'early',
    xp: { totalXP: 40, baseXP: 10, bonuses: [{ type: 'First vote today', xp: 30 }] },
    rank: { currentLevel: { title: 'Regular', level: 2 }, nextLevel: { level: 3 }, progressPercentage: 40, progressXP: 40, xpForNextLevel: 100 },
    next: { href: 'vote?match=g-b-match-2', label: 'Next match' }
});
check('html escapes the line and the title', !html.includes('<b>there</b>') && !html.includes('<script>'));
check('html has the primary Next match button and View all matches', html.includes('pvm-btn--primary') && html.includes('vote?match=g-b-match-2') && html.includes('View all matches'));
check('primary comes before the share row (actions above Ko-fi)', html.indexOf('pvm-actions') < html.indexOf('pvm-share') && html.indexOf('pvm-share') < html.indexOf('ko-fi.com'));
check('XP total, bonus chip and level bar are shown', html.includes('+40 XP') && html.includes('+30 First vote today') && html.includes('width:40%'));
check('no next match -> bracket button', buildPostVoteModalHtml({ xp: { totalXP: 10, baseXP: 10, bonuses: [] }, line: 'x', voteTitle: 'y' }).includes('See the bracket'));
check('share buttons carry the song through data-song (quotes safe)', html.includes('data-song="It&#39;s A"'));
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
