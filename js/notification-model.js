// Pure helpers for notifications (no Firebase), so they can be tested.

// Notifications that should still pop up as a toast: not shown yet, newer than cutoff, not expired. Newest first.
export function pickUnshown(list, cutoffTime, now) {
    return (list || [])
        .filter(n => n && n.shownAsToast === false && n.timestamp > cutoffTime && (!n.expiresAt || n.expiresAt > now))
        .sort((a, b) => b.timestamp - a.timestamp);
}

// Ally / rival notifications get the champion look (portrait badge, pack colours) like their toast does.
export const isSocialNotification = n => n?.relationship === 'ally' || n?.relationship === 'opponent';

// Group the bell list. Ally/rival rows from people you FOLLOW stay one row per person ("Kai voted against you in 2 matches").
// From strangers they group per match ("3 people voted against you in <match>"), so the row always says what it is about.
// Everything else keeps the old per-person grouping.
export function groupNotifications(list, followingIds = new Set()) {
    const groups = new Map();
    for (const n of list || []) {
        const content = isContentNotification(n);
        const stranger = isSocialNotification(n) && !followingIds.has(n.triggerUserId);
        // Likes / comments / replies / mentions group per POST and kind, whoever did them ("3 people liked your post").
        const key = content ? `c|${n.type}|${n.eventType || ''}|${n.targetUrl || n.matchId || ''}`
            : stranger ? `m|${n.matchId}|${n.relationship}` : `u|${n.triggerUserId || 'system'}|${n.relationship || n.type}`;
        const entry = { matchId: n.matchId, matchTitle: n.matchTitle, detail: n.detail };
        const g = groups.get(key);
        if (!g) groups.set(key, { ...n, groupKind: content ? 'content' : stranger ? 'match' : 'user', count: 1, matches: [entry], ids: [n.id], users: [n.triggerUsername].filter(Boolean), avatars: n.triggerUsername ? [n.thumbnailUrl || null] : [], userIds: n.triggerUsername ? [n.triggerUserId || null] : [] });
        else {
            g.count++; g.matches.push(entry); g.ids.push(n.id);
            if (n.triggerUsername && !g.users.includes(n.triggerUsername)) { g.users.push(n.triggerUsername); g.avatars.push(n.thumbnailUrl || null); g.userIds.push(n.triggerUserId || null); }
            if (n.timestamp > g.timestamp) {
                g.timestamp = n.timestamp;
                if (content) { if (n.detail) g.detail = n.detail; g.triggerUsername = n.triggerUsername; g.triggerUserId = n.triggerUserId; }   // the row quotes the newest one
            }
        }
    }
    return [...groups.values()].sort((a, b) => b.timestamp - a.timestamp);
}

// The headline of a grouped social row. null = not a social group (caller keeps its own wording).
export function socialHeadline(n) {
    const name = n.triggerUsername || 'Someone';
    return `${name} voted ${n.relationship === 'ally' ? 'with' : 'against'} you`;
}

export function groupHeadline(g) {
    if (!isSocialNotification(g) || g.count < 2) return null;
    const what = g.relationship === 'ally' ? 'picked the same as you' : 'voted against you';
    if (g.groupKind === 'match') return { message: `${g.count} people ${what}`, detail: g.users.slice(0, 3).join(', ') + (g.users.length > 3 ? ` +${g.users.length - 3} more` : '') };
    return { message: `${g.triggerUsername || 'Someone'} ${what} in ${g.count} matches`, detail: null };
}

// ---- Social tab and follow notifications ----
// Types shown under the bell's Social tab. Follows are saved as 'new-follower' (older code looked for 'follow', so they never matched).
export const SOCIAL_TAB_TYPES = ['like', 'comment', 'new-follower', 'follow', 'mention', 'reply', 'emote-received'];
export const isFollowNotification = n => n?.type === 'new-follower' || n?.type === 'follow';
export const isSocialTabItem = n => !!n && (SOCIAL_TAB_TYPES.includes(n.type) || isSocialNotification(n));

export const FOLLOW_QUIPS = [
    'New fan detected. Try to keep up!',
    'Someone is watching. Good. Make it a show!',
    'Another one joins the chaos!',
    'Looks like you made an impression.'
];
// Stable per notification (same row always shows the same line), spread by a simple hash of the id/username.
export function followQuip(n, quips = isFollowBack(n) ? FOLLOW_BACK_QUIPS : FOLLOW_QUIPS) {
    const key = String(n?.id || n?.triggerUserId || n?.triggerUsername || '');
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return quips[h % quips.length];
}
// A follow that reciprocates one of yours is saved with the message "<name> followed you back" (see follow-system.js).
export const isFollowBack = n => /followed you back/i.test(n?.message || '');
export const FOLLOW_BACK_QUIPS = [
    "It's mutual. Now we're talking!",
    'Two of you now. Double the chaos!',
    'They followed you back. Go cause some trouble together!'
];
export const followHeadline = n => `${n?.triggerUsername || 'Someone'} followed you${isFollowBack(n) ? ' back' : ''}`;


// ---- Likes, comments, replies and mentions (the "content" notifications) ----
export const CONTENT_TYPES = ['like', 'comment', 'reply', 'mention', 'emote-received'];     // emote-received: a reaction someone sent you (eventType = thanks / props / rivalry / hype)
export const isContentNotification = n => CONTENT_TYPES.includes(n?.type);
const CONTENT_ICONS = { like: '❤️', comment: '💬', reply: '💬', mention: '📢' };      // (↩️ drew as a blue box on Windows)
const EMOTE_ICONS = { thanks: '🤝', props: '👊', rivalry: '⚔️', hype: '🔥' };
export const contentIcon = n => (n?.type === 'emote-received' ? (EMOTE_ICONS[n.eventType] || '✨') : CONTENT_ICONS[n?.type]) || '🔔';
const EMOTE_ACTIONS = { thanks: 'sent you thanks', props: 'gave you props', rivalry: 'challenged you', hype: 'sent you hype' };
// Most direct first: a reply to you beats a comment or mention, which beat a like. Used to pick the one toast to show.
export const CONTENT_PRIORITY = { 'emote-received': 8, reply: 8, comment: 7, mention: 7, like: 6 };

// Where a mention happened ("in a post / comment / reply"), read from the saved wording.
export function mentionWhere(n) {
    const m = /\bin an? (post|comment|reply)\b/i.exec(n?.message || '') || /View (Post|Comment|Reply)/i.exec(n?.ctaText || '');
    return m ? m[1].toLowerCase() : 'post';
}

// "Kai liked your post" / "Kai and Rex liked your post" / "3 people liked your post". who + action are split so the toast
// can put the name on its own line.
export function contentHeadline(g) {
    const users = g?.users?.length ? g.users : [g?.triggerUsername].filter(Boolean);
    const people = users.length || 1;
    const count = g?.count || 1;
    const who = people === 1 ? (users[0] || 'Someone') : people === 2 ? `${users[0]} and ${users[1]}` : `${people} people`;
    let action;
    const thing = g?.eventType === 'vote' ? 'pick' : 'post';       // a like / comment on an auto vote post is on the voter's pick
    if (g?.type === 'like') action = `liked your ${thing}`;
    else if (g?.type === 'comment') action = people === 1 && count > 1 ? `commented ${count} times on your ${thing}` : `commented on your ${thing}`;
    else if (g?.type === 'reply') action = people === 1 && count > 1 ? `replied ${count} times to your comment` : 'replied to your comment';
    else if (g?.type === 'emote-received') action = EMOTE_ACTIONS[g.eventType] || 'sent you a reaction';
    else if (g?.type === 'mention') action = people >= 3 ? 'mentioned you' : `mentioned you in a ${mentionWhere(g)}`;
    else action = 'sent you something';
    const names = people >= 3 ? users.slice(0, 3).join(', ') + (people > 3 ? ` +${people - 3} more` : '') : '';
    return { who, action, headline: `${who} ${action}`, names };
}

// The words to show under the headline: the post that was liked, or what they wrote. Empty when there is nothing real to quote.
export function contentQuote(g, max = 110) {
    let t = String(g?.detail || '').trim();
    if (!t || t === 'your post') return '';
    t = t.replace(/^["“](.*)["”]$/s, '$1').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
// One consistent wording whatever older notifications saved ("View Comment" vs "View comment").
export const contentCta = g => g?.type === 'emote-received' ? 'View match' : g?.type === 'mention' ? `View ${mentionWhere(g)}` : ({ like: g?.eventType === 'vote' ? 'View pick' : 'View post', comment: 'View comment', reply: 'View reply' }[g?.type] || 'View');

// ---------- Match-event alerts (danger, nailbiter, winning, comeback, closing, no/low votes, round open, match result) ----------
// One look for all of them (js/notification-visuals.js eventToastHtml / eventRowHtml): the match's two edits with the viewer's pick
// ringed in the colour below, a small tag line, the champion's words in a bubble, one button. tone null = the champion pack's colour.
export const EVENT_KINDS = {
    danger:           { tag: 'Your pick is behind', tone: '#ff5a5f', share: true, quiet: true },
    'danger-repeat':  { tag: 'Your pick is behind', tone: '#ff5a5f', share: true, quiet: true },
    nailbiter:        { tag: 'Too close to call',   tone: '#ffb020', share: true, both: true, quiet: true },
    winning:          { tag: 'Your pick is winning', tone: '#4ade80', share: true, quiet: true },
    comeback:         { tag: 'Comeback',            tone: '#4ade80', share: true, quiet: true },
    tiebreaker:       { tag: 'Tie-breaker needed', tone: '#ffb020', both: true, quiet: true },
    closing:          { tag: 'Closing soon',        tone: '#ffb020' },
    novotes:          { tag: 'Needs a first vote',  tone: null },
    lowvotes:         { tag: 'Needs more votes',    tone: null },
    'round-opening':  { tag: 'New round',           tone: null, quiet: true },
    'new-matches':    { tag: 'New matches',         tone: null, quiet: true },
    'match-won':      { tag: 'Your pick won',       tone: '#4ade80', outcome: 'won', quiet: true },
    'match-lost':     { tag: 'Your pick lost',      tone: '#f87171', outcome: 'lost', quiet: true },
    'match-tied':     { tag: 'Tied match',          tone: '#a5b4fc', outcome: 'tied', both: true, quiet: true },
    welcome:          { tag: 'Welcome',             tone: null, quiet: true },
    encouragement:    { tag: 'Still deciding?',     tone: null, quiet: true }
};
export const eventKind = n => (n && Object.prototype.hasOwnProperty.call(EVENT_KINDS, n.type)) ? EVENT_KINDS[n.type] : null;
export const isEventNotification = n => !!eventKind(n);

// The small line above the champion's words. Closing and round alerts say a little more when the data is there.
export function eventTag(n) {
    const k = eventKind(n);
    if (!k) return '';
    if (n.type === 'tiebreaker') return n.severityTier === 'final' ? 'Last chance to break the tie' : k.tag;
    if (n.type === 'closing') return n.severityTier === 'final' ? 'Last chance to vote' : 'Closing soon';
    if (n.type === 'round-opening') return n.round ? `Round ${n.round} is open` : k.tag;
    if (n.type === 'new-matches') return n.round ? `New matches in round ${n.round}` : k.tag;
    if (n.type === 'welcome') return n.welcomeType && n.welcomeType !== 'first-time' ? 'Welcome back' : k.tag;
    if (n.type === 'encouragement') return n.encouragementType === 'urgent' ? 'Closing soon' : k.tag;
    return k.tag;
}

// Which alerts are about a match the viewer must have voted in (the test page pretends so for its sample alerts).
export const VOTED_KINDS = ['danger', 'danger-repeat', 'nailbiter', 'winning', 'comeback', 'match-won', 'match-lost', 'match-tied'];
// Alerts that show a strip of the edits that are open (round opening, new matches, welcome, still deciding).
export const isStripAlert = n => !!n && (n.type === 'round-opening' || n.type === 'new-matches' || n.type === 'welcome' || n.type === 'encouragement');
export const isRoundAlert = n => !!n && (n.type === 'round-opening' || n.type === 'new-matches');

// The symbol in the middle of the picture (between the two edits, or alone in a circle when there is no match to show).
// It says the state at a glance so the alert needs no heading: ▼ behind, ▲ ahead, = too close / tied, ⇄ flipped, ✓ won, ✕ lost.
const EVENT_GLYPHS = {
    danger: '▼', 'danger-repeat': '▼', nailbiter: '=', winning: '▲', comeback: '⇄',
    closing: '⏳', tiebreaker: '=', novotes: 'VS', lowvotes: 'VS', 'round-opening': '▶', 'new-matches': '+',
    'match-won': '✓', 'match-lost': '✕', 'match-tied': '=', welcome: '👋', encouragement: '👀'
};
export const eventGlyph = n => (n && EVENT_GLYPHS[n.type]) || 'VS';

// Matches you have not voted in that are exactly level and still open. covered = every such match (the closing-soon alert leaves
// them alone); ties = the ones not yet announced at their current step ('tied', or 'final' inside the last hours), soonest first.
export function tieBreakerCandidates(matches, { userVotes = {}, seen = {}, msLeftOf, minVotes = 10, finalMs = 3 * 3600000 } = {}) {
    const covered = new Set(), ties = [];
    for (const match of matches || []) {
        const matchId = match.matchId || match.id;
        if (!matchId || userVotes[matchId]) continue;
        const v1 = match.song1?.votes || 0, v2 = match.song2?.votes || 0;
        if (v1 !== v2 || v1 + v2 < minVotes) continue;
        const msLeft = msLeftOf ? msLeftOf(match) : null;
        if (msLeft === null || msLeft === undefined || msLeft <= 0) continue;
        covered.add(matchId);
        const tier = msLeft <= finalMs ? 'final' : 'tied';
        if (seen[`${matchId}:${tier}`]) continue;
        ties.push({ match, matchId, msLeft, tier, score: v1 });
    }
    ties.sort((a, b) => a.msLeft - b.msLeft);
    return { ties, covered };
}

// Where the button (and the alert itself) goes. A match you already voted in opens with the share panel in view.
export function eventUrl(n) {
    const k = eventKind(n);
    if (isStripAlert(n)) return '/matches.html';          // these show several edits: the list is the place to pick from
    let url = n?.targetUrl || (n?.matchId ? `/vote.html?match=${encodeURIComponent(n.matchId)}` : '/vote.html');
    if (k?.share && n?.matchId && /^\/vote(\.html)?\?/.test(url) && !/[?&]share=/.test(url)) url += '&share=1';
    return url;
}

// A few facts as small chips under the champion's words (percentages for a match you voted in, the number of new matches).
export function eventChips(n) {
    const chips = [];
    const diff = Number.isFinite(n?.voteDiff) ? n.voteDiff : null;
    if (diff != null) {
        if (n.type === 'danger' || n.type === 'danger-repeat') { if (diff > 0) chips.push(`Behind by ${diff}`); }
        else if (n.type === 'winning' || n.type === 'comeback') { if (diff > 0) chips.push(`Ahead by ${diff}`); }
        else if (n.type === 'nailbiter') { if (diff > 0) chips.push(`${diff} vote${diff === 1 ? '' : 's'} apart`); }
    }
    if (n?.type === 'tiebreaker' && n.score) chips.push(`Level at ${n.score}`);
    if (n?.type === 'tiebreaker' && n.severityTier === 'final') chips.push('Last chance');
    if (n?.type === 'closing' && n.severityTier === 'final') chips.push('Last chance');
    if (n?.type === 'encouragement' && n.encouragementType === 'urgent') chips.push('Closing soon');
    if ((n?.type === 'round-opening' || n?.type === 'new-matches') && n.round) chips.push(`Round ${n.round}`);
    if (Number.isFinite(n?.userPct) && Number.isFinite(n?.opponentPct)) chips.push(`${n.userPct}% vs ${n.opponentPct}%`);
    if ((n?.type === 'round-opening' || n?.type === 'new-matches') && n.matchCount) chips.push(`${n.matchCount} ${n.matchCount === 1 ? 'match' : 'matches'}`);
    return chips;
}

// ---------- Streaks ("10 matches in a row with Kai") ----------
// Saved as type 'streak' with relationship 'ally-streak' / 'rival-streak'. They are drawn like the ally / rival cards, with a profile button.
export const isStreakNotification = n => !!n && n.type === 'streak' && (n.relationship === 'ally-streak' || n.relationship === 'rival-streak');
export function streakView(n) {
    const ally = n?.relationship === 'ally-streak';
    const who = n?.triggerUsername || n?.username || 'Someone';
    const count = Number(n?.streakCount) > 0 ? Number(n.streakCount) : null;
    const run = count ? `${count} matches in a row` : 'again and again';
    return {
        relationship: ally ? 'ally' : 'opponent',
        headline: `${who} has voted ${ally ? 'with' : 'against'} you ${run}`,
        profileUrl: `/profile.html?user=${encodeURIComponent(who)}`
    };
}
