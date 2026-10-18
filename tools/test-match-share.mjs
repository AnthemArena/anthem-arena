import fs from 'fs';
import { shareKind, buildMatchShare, targetsFor, SHARE_KINDS, SHARE_VARS, shareLines } from '../js/match-share.js';
let bad = 0; const ck = (c, m) => { console.log(c ? '  ok ' : 'FAIL', m); if (!c) bad++; };
const k = o => shareKind({ hasVoted: true, status: 'live', total: 50, ...o });
ck(shareKind({ hasVoted: false, status: 'live', pickVotes: 9, otherVotes: 1, total: 99 }) === 'invite', 'not voted -> invite (numbers stay hidden)');
ck(k({ status: 'completed', pickVotes: 9, otherVotes: 1 }) === 'voted', 'finished -> voted');
ck(k({ total: 5, pickVotes: 3, otherVotes: 2 }) === 'early', 'under 10 votes -> early');
ck(k({ pickVotes: 20, otherVotes: 20 }) === 'tied', 'tied');
ck(k({ pickVotes: 20, otherVotes: 22 }) === 'nailbiter' && k({ pickVotes: 22, otherVotes: 20 }) === 'nailbiter', 'within 2 -> nailbiter');
ck(k({ pickVotes: 20, otherVotes: 24 }) === 'losing-close', 'behind by 3-5');
ck(k({ pickVotes: 20, otherVotes: 40 }) === 'losing-bad', 'behind by 6+');
ck(k({ pickVotes: 52, otherVotes: 48 }) === 'winning-close', 'ahead within 10%');
ck(k({ pickVotes: 80, otherVotes: 20 }) === 'dominating', 'ahead by more');

const jinx = JSON.parse(fs.readFileSync(new URL('../champion-packs/jinx.json', import.meta.url), 'utf8'));
for (const kind of SHARE_KINDS) {
    const lines = shareLines(jinx, kind);
    ck(lines.length >= 3, `jinx has 3+ lines for ${kind}`);
    for (const l of lines) for (const ph of l.match(/\{(\w+)\}/g) || [])
        if (!SHARE_VARS[kind].includes(ph.slice(1, -1))) ck(false, `${kind}: unknown placeholder ${ph} in "${l}"`);
}
const base = { matchId: 'cup-1-group-A-match-2', origin: 'https://arcanemoments.netlify.app/', a: 'Edit A | Maker', b: 'Edit B', pick: 'Edit A | Maker', other: 'Edit B', pickVotes: 7, otherVotes: 20, total: 27 };
for (const kind of SHARE_KINDS) {
    for (const pack of [jinx, null]) {
        const s = buildMatchShare({ ...base, kind, pack });
        ck(!/[{}]/.test(s.text) && s.text.length > 10 && s.text.length < 260, `${kind}${pack ? '' : ' (fallback)'}: filled text "${s.text.slice(0, 50)}…"`);
    }
}
const s = buildMatchShare({ ...base, kind: 'losing-bad', pack: jinx });
ck(s.url === 'https://arcanemoments.netlify.app/vote?match=cup-1-group-A-match-2&ref=share', 'link is the match with a share tag');
ck(s.text.includes('13') && !s.text.includes('Maker'), 'diff filled; title cut to the first part');
ck(s.targets.x.includes(encodeURIComponent(s.url)) && s.targets.whatsapp.startsWith('https://wa.me/?text='), 'targets carry the link');
const inv = buildMatchShare({ ...base, kind: 'invite', pack: jinx });
ck(!/\d/.test(inv.text), 'invite text has no numbers');
ck(!/[.!?]\s+[.!?]/.test(buildMatchShare({ ...base, kind: 'voted', pack: null, pick: 'Loud name!!', other: 'Other...' }).text) && !buildMatchShare({ ...base, kind: 'voted', pack: null, pick: 'Loud name!!' }).text.includes('!!'), 'trailing punctuation on names is dropped')
ck(buildMatchShare({ ...base, kind: 'nope' }).kind === 'voted', 'unknown kind falls back');
ck(buildMatchShare({ ...base, kind: 'voted', pack: jinx, bump: 1 }).text !== buildMatchShare({ ...base, kind: 'voted', pack: jinx }).text, 'bump moves to another line');
ck(targetsFor('hi there', 'https://x.y/z').reddit.includes('title=hi%20there'), 'targetsFor rebuilds from edited text');
process.exit(bad ? 1 : 0);
