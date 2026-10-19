// node tools/test-notification-model.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isMoveOnCta, eventButtonUrl, achievementButtonUrl, EVENT_KINDS, tieBreakerCandidates, isStripAlert, eventGlyph, eventKind, isEventNotification, eventTag, eventUrl, eventChips, isStreakNotification, streakView, pickUnshown, isSocialNotification, isSocialTabItem, isFollowNotification, followQuip, followHeadline, FOLLOW_QUIPS, isFollowBack, FOLLOW_BACK_QUIPS, groupNotifications, isContentNotification, contentHeadline, contentQuote, contentCta, contentIcon, mentionWhere, CONTENT_PRIORITY } from '../js/notification-model.js';
let pass = 0; const t = (n, f) => { f(); console.log('  ok  ', n); pass++; };
const now = 1_000_000, cutoff = now - 600_000;
const n = (id, o) => ({ id, shownAsToast: false, timestamp: now - 60_000, expiresAt: now + 1e6, ...o });
t('keeps fresh unshown, newest first', () => {
    const r = pickUnshown([n('a', { timestamp: now - 120_000 }), n('b', { timestamp: now - 30_000 })], cutoff, now);
    assert.deepEqual(r.map(x => x.id), ['b', 'a']);
});
t('drops shown, old and expired', () => {
    const r = pickUnshown([n('s', { shownAsToast: true }), n('o', { timestamp: cutoff - 1 }), n('e', { expiresAt: now - 1 }), n('ok')], cutoff, now);
    assert.deepEqual(r.map(x => x.id), ['ok']);
});
t('empty / null input is safe', () => { assert.deepEqual(pickUnshown(null, cutoff, now), []); assert.deepEqual(pickUnshown([null], cutoff, now), []); });
t('social = ally or opponent', () => { assert.ok(isSocialNotification({ relationship: 'ally' })); assert.ok(isSocialNotification({ relationship: 'opponent' })); assert.ok(!isSocialNotification({ type: 'like' })); assert.ok(!isSocialNotification(null)); });
t('Social tab: follows (new-follower), likes, comments, mentions, replies and ally/rival alerts; not votes or achievements', () => {
    for (const type of ['new-follower', 'follow', 'like', 'comment', 'mention', 'reply']) assert.ok(isSocialTabItem({ type }), type);
    assert.ok(isSocialTabItem({ type: 'ally-vote', relationship: 'ally' })); assert.ok(isSocialTabItem({ type: 'rival-vote', relationship: 'opponent' }));
    for (const type of ['achievement', 'live-activity', 'causal-event']) assert.ok(!isSocialTabItem({ type }), type);
    assert.ok(!isSocialTabItem(null));
});
const L = (id, type, who, ts, extra = {}) => ({ id, type, triggerUsername: who, triggerUserId: who.toLowerCase(), targetUrl: '/feed.html#post-1', timestamp: ts, ...extra });
t('content notifications group per post and kind, not per person', () => {
    const g = groupNotifications([L('a', 'like', 'Kai', 1, { detail: 'my edit' }), L('b', 'like', 'Rex', 2, { detail: 'my edit' }), L('c', 'like', 'Mia', 3), L('d', 'like', 'Kai', 4, { targetUrl: '/feed.html#post-2' }), L('e', 'comment', 'Kai', 5, { detail: '"hi"' })]);
    assert.equal(g.length, 3);
    const likes1 = g.find(x => x.type === 'like' && x.targetUrl.endsWith('post-1'));
    assert.equal(likes1.count, 3); assert.deepEqual(likes1.users, ['Kai', 'Rex', 'Mia']); assert.equal(likes1.groupKind, 'content');
    assert.equal(likes1.detail, 'my edit');      // a later like without text does not blank the quote
    assert.ok(isContentNotification(likes1) && !isContentNotification({ type: 'achievement' }));
});
t('content headlines: one person, two, a crowd, repeat commenter, mention place', () => {
    const one = groupNotifications([L('a', 'like', 'Kai', 1)])[0];
    assert.equal(contentHeadline(one).headline, 'Kai liked your post');
    const two = groupNotifications([L('a', 'like', 'Kai', 1), L('b', 'like', 'Rex', 2)])[0];
    assert.equal(contentHeadline(two).headline, 'Kai and Rex liked your post');
    const crowd = groupNotifications(['Kai', 'Rex', 'Mia', 'Zed', 'Ana'].map((w, i) => L('i' + i, 'like', w, i + 1)))[0];
    const h = contentHeadline(crowd); assert.equal(h.headline, '5 people liked your post'); assert.equal(h.who, '5 people'); assert.equal(h.names, 'Kai, Rex, Mia +2 more');
    const twice = groupNotifications([L('a', 'comment', 'Kai', 1), L('b', 'comment', 'Kai', 2)])[0];
    assert.equal(contentHeadline(twice).headline, 'Kai commented 2 times on your post');
    assert.equal(contentHeadline(groupNotifications([L('a', 'reply', 'Kai', 1)])[0]).headline, 'Kai replied to your comment');
    const m = L('m', 'mention', 'Kai', 1, { message: '📢 Kai mentioned you in a reply', ctaText: 'View Reply' });
    assert.equal(mentionWhere(m), 'reply'); assert.equal(contentHeadline(groupNotifications([m])[0]).headline, 'Kai mentioned you in a reply');
    assert.equal(mentionWhere({ message: '', ctaText: 'View Comment' }), 'comment'); assert.equal(mentionWhere({}), 'post');
});
t('content quote: strips quotes, trims, skips placeholders; button text; priority order', () => {
    assert.equal(contentQuote({ detail: '"nice edit!"' }), 'nice edit!');
    assert.equal(contentQuote({ detail: 'your post' }), ''); assert.equal(contentQuote({}), '');
    const q = contentQuote({ detail: 'x'.repeat(300) }); assert.ok(q.length === 110 && q.endsWith('…'));
    assert.equal(contentCta({ type: 'like' }), 'View post'); assert.equal(contentCta({ type: 'comment', ctaText: 'View Comment' }), 'View comment'); assert.equal(contentCta({ type: 'mention', ctaText: 'View Reply' }), 'View reply'); assert.equal(contentCta({ type: 'mention' }), 'View post');
    assert.ok(CONTENT_PRIORITY.reply > CONTENT_PRIORITY.comment && CONTENT_PRIORITY.comment > CONTENT_PRIORITY.like);
});

t('emote notifications: grouped per match and kind, headline by emote type, icon, button, Social tab', () => {
    const E = (id, who, ts, eventType) => ({ id, type: 'emote-received', eventType, triggerUsername: who, triggerUserId: who.toLowerCase(), targetUrl: '/vote.html?match=m1', detail: 'Game on! 🎮', timestamp: ts });
    const g = groupNotifications([E('a', 'Kai', 1, 'rivalry'), E('b', 'Rex', 2, 'rivalry'), E('c', 'Kai', 3, 'props')]);
    assert.equal(g.length, 2);
    const riv = g.find(x => x.eventType === 'rivalry');
    assert.equal(contentHeadline(riv).headline, 'Kai and Rex challenged you');
    assert.equal(contentHeadline(g.find(x => x.eventType === 'props')).headline, 'Kai gave you props');
    assert.equal(contentHeadline({ type: 'emote-received', eventType: 'thanks', users: ['Kai'] }).headline, 'Kai sent you thanks');
    assert.equal(contentHeadline({ type: 'emote-received', eventType: 'hype', users: ['A', 'B', 'C'], count: 3 }).headline, '3 people sent you hype');
    assert.equal(contentIcon(riv), '⚔️'); assert.equal(contentCta(riv), 'View match'); assert.equal(contentQuote(riv), 'Game on! 🎮');
    assert.ok(isSocialTabItem({ type: 'emote-received' })); assert.ok(CONTENT_PRIORITY['emote-received'] >= CONTENT_PRIORITY.reply);
});

t('likes / comments on an auto vote post say "pick" and open "View pick"', () => {
    const v = (id, who, type, ts) => ({ id, type, eventType: 'vote', triggerUsername: who, triggerUserId: who.toLowerCase(), targetUrl: '/feed.html#post-activity_1', detail: 'Main Attraction over Jinx Edit', timestamp: ts });
    const like = groupNotifications([v('a', 'Kai', 'like', 1)])[0];
    assert.equal(contentHeadline(like).headline, 'Kai liked your pick'); assert.equal(contentCta(like), 'View pick'); assert.equal(contentQuote(like), 'Main Attraction over Jinx Edit');
    const crowd = groupNotifications([v('a', 'Kai', 'like', 1), v('b', 'Rex', 'like', 2), v('c', 'Mia', 'like', 3)])[0];
    assert.equal(contentHeadline(crowd).headline, '3 people liked your pick');
    assert.equal(contentHeadline(groupNotifications([v('a', 'Kai', 'comment', 1)])[0]).headline, 'Kai commented on your pick');
    assert.equal(contentHeadline(groupNotifications([v('a', 'Kai', 'comment', 1), v('b', 'Kai', 'comment', 2)])[0]).headline, 'Kai commented 2 times on your pick');
    // a like on a normal post and one on a vote post of the same id never merge
    assert.equal(groupNotifications([v('a', 'Kai', 'like', 1), { ...v('b', 'Rex', 'like', 2), eventType: null }]).length, 2);
});

t('follow back: message detected, headline says "followed you back", own quip pool', () => {
    const fb = { id: 'x1', triggerUsername: 'Kai', message: 'Kai followed you back' };
    assert.ok(isFollowBack(fb)); assert.ok(!isFollowBack({ message: 'Kai started following you' })); assert.ok(!isFollowBack(null));
    assert.equal(followHeadline(fb), 'Kai followed you back');
    assert.ok(FOLLOW_BACK_QUIPS.includes(followQuip(fb))); assert.ok(!FOLLOW_QUIPS.includes(followQuip(fb)));
});

t('follow notifications: type check, headline, stable quip', () => {
    assert.ok(isFollowNotification({ type: 'new-follower' })); assert.ok(isFollowNotification({ type: 'follow' })); assert.ok(!isFollowNotification({ type: 'like' }));
    assert.equal(followHeadline({ triggerUsername: 'Kai' }), 'Kai followed you'); assert.equal(followHeadline({}), 'Someone followed you');
    const a = followQuip({ id: 'abc123' }); assert.equal(a, followQuip({ id: 'abc123' })); assert.ok(FOLLOW_QUIPS.includes(a));
    assert.ok(FOLLOW_QUIPS.includes(followQuip(null)));
});
t('every match-event alert type has a tag and a colour rule', () => {
    for (const [type, k] of Object.entries(EVENT_KINDS)) {
        assert.ok(k.tag && k.tag.length < 30, type);
        assert.ok(k.tone === null || /^#[0-9a-f]{6}$/i.test(k.tone), type);
        assert.ok(isEventNotification({ type }));
    }
    assert.equal(eventKind({ type: 'like' }), null); assert.equal(eventKind({ type: 'toString' }), null); assert.equal(eventKind(null), null);
});
t('event tags say a little more when the data is there', () => {
    assert.equal(eventTag({ type: 'round-opening', round: 3 }), 'Round 3 is open');
    assert.equal(eventTag({ type: 'round-opening' }), 'New round');
    assert.equal(eventTag({ type: 'new-matches', round: 2 }), 'New matches in round 2');
    assert.equal(eventTag({ type: 'closing', severityTier: 'final' }), 'Last chance to vote');
    assert.equal(eventTag({ type: 'closing', severityTier: '3h' }), 'Closing soon');
    assert.equal(eventTag({ type: 'danger' }), 'Your pick is behind');
});
t('event links: matches you voted in open with the share panel, others do not', () => {
    assert.equal(eventUrl({ type: 'danger', matchId: 'm 1' }), '/vote.html?match=m%201&share=1');
    assert.equal(eventUrl({ type: 'winning', matchId: 'm1', targetUrl: '/vote.html?match=m1' }), '/vote.html?match=m1&share=1');
    assert.equal(eventUrl({ type: 'winning', matchId: 'm1', targetUrl: '/vote.html?match=m1&share=1' }), '/vote.html?match=m1&share=1');
    assert.equal(eventUrl({ type: 'match-won', matchId: 'm1', targetUrl: '/vote.html?match=m1' }), '/vote.html?match=m1');
    assert.equal(eventUrl({ type: 'novotes', matchId: 'm1' }), '/vote.html?match=m1');
    assert.equal(eventUrl({ type: 'round-opening', targetUrl: '/vote.html' }), '/matches.html');
    assert.equal(eventUrl({ type: 'welcome', targetUrl: '/vote.html' }), '/matches.html'); assert.equal(eventUrl({ type: 'encouragement' }), '/matches.html');
    assert.equal(eventUrl({ type: 'closing', targetUrl: '/#vote' }), '/#vote');
    assert.equal(eventUrl({ type: 'round-opening' }), '/matches.html');
});
t('event chips: percentages for a voted match, match count for a new round', () => {
    assert.deepEqual(eventChips({ type: 'danger', userPct: 38, opponentPct: 62 }), ['38% vs 62%']);
    assert.deepEqual(eventChips({ type: 'round-opening', matchCount: 8 }), ['8 matches']);
    assert.deepEqual(eventChips({ type: 'new-matches', matchCount: 1 }), ['1 match']);
    assert.deepEqual(eventChips({ type: 'closing' }), []);
    assert.deepEqual(eventChips({ type: 'closing', severityTier: 'final' }), ['Last chance']);
    assert.deepEqual(eventChips({ type: 'round-opening', round: 2, matchCount: 8 }), ['Round 2', '8 matches']);
    assert.deepEqual(eventChips({ type: 'encouragement', encouragementType: 'urgent' }), ['Closing soon']);
    assert.deepEqual(eventChips({ type: 'danger', voteDiff: 15, userPct: 43, opponentPct: 57 }), ['Behind by 15', '43% vs 57%']);
    assert.deepEqual(eventChips({ type: 'comeback', voteDiff: 5 }), ['Ahead by 5']);
    assert.deepEqual(eventChips({ type: 'nailbiter', voteDiff: 1 }), ['1 vote apart']);
    assert.deepEqual(eventChips({ type: 'nailbiter', voteDiff: 0, userPct: 50, opponentPct: 50 }), ['50% vs 50%']);
    assert.ok(isStripAlert({ type: 'welcome' }) && isStripAlert({ type: 'encouragement' }) && isStripAlert({ type: 'round-opening' }) && !isStripAlert({ type: 'danger' }));
    for (const k of ['danger', 'nailbiter', 'winning', 'comeback', 'round-opening', 'new-matches', 'match-won', 'match-lost', 'welcome', 'encouragement']) assert.equal(EVENT_KINDS[k].quiet, true, k);
    for (const k of ['closing', 'novotes', 'lowvotes']) assert.ok(!EVENT_KINDS[k].quiet, k);
    for (const k of Object.keys(EVENT_KINDS)) assert.ok(typeof eventGlyph({ type: k }) === 'string', k);
    assert.equal(eventGlyph({ type: 'round-opening' }), '', 'round opening has no symbol');
    assert.equal(eventGlyph({ type: 'something-new' }), 'VS');
    assert.equal(eventGlyph({ type: 'danger' }), '▼'); assert.equal(eventGlyph({ type: 'winning' }), '▲'); assert.equal(eventGlyph({ type: 'match-lost' }), '✕'); assert.equal(eventGlyph({ type: 'nope' }), 'VS');
});
t('welcome and encouragement are event cards with their own tags', () => {
    assert.equal(eventTag({ type: 'welcome', welcomeType: 'first-time' }), 'Welcome');
    assert.equal(eventTag({ type: 'welcome', welcomeType: 'comeback' }), 'Welcome back');
    assert.equal(eventTag({ type: 'welcome' }), 'Welcome');
    assert.equal(eventTag({ type: 'encouragement', encouragementType: 'gentle' }), 'Still deciding?');
    assert.equal(eventTag({ type: 'encouragement', encouragementType: 'urgent' }), 'Closing soon');
    assert.equal(eventUrl({ type: 'encouragement', targetUrl: '/matches.html' }), '/matches.html');
});
t('streaks: recognised, drawn as ally / rival, headline names the person and the run, button goes to the profile', () => {
    const a = { type: 'streak', relationship: 'ally-streak', triggerUsername: 'Mia Lee', streakCount: 10 };
    assert.ok(isStreakNotification(a)); assert.ok(isStreakNotification({ ...a, relationship: 'rival-streak' }));
    assert.ok(!isStreakNotification({ type: 'streak', relationship: 'ally' })); assert.ok(!isStreakNotification({ type: 'like' })); assert.ok(!isStreakNotification(null));
    assert.deepEqual(streakView(a), { relationship: 'ally', headline: 'Mia Lee has voted with you 10 matches in a row', profileUrl: '/profile.html?user=Mia%20Lee' });
    assert.equal(streakView({ ...a, relationship: 'rival-streak', streakCount: 20 }).headline, 'Mia Lee has voted against you 20 matches in a row');
    assert.equal(streakView({ ...a, relationship: 'rival-streak' }).relationship, 'opponent');
    assert.equal(streakView({ relationship: 'ally-streak' }).headline, 'Someone has voted with you again and again');
});
t('tie-breaker: only exact ties in matches you have not voted in, open, with enough votes; once per step', () => {
    const H = 3600000;
    const m = (id, a, b) => ({ matchId: id, song1: { votes: a }, song2: { votes: b } });
    const left = { A: 20 * H, B: 2 * H, C: 5 * H, D: 4 * H, E: 3 * H, F: -1, G: 9 * H, H: null };
    const msLeftOf = x => left[x.matchId];
    const matches = [m('A', 12, 12), m('B', 11, 11), m('C', 12, 11), m('D', 3, 3), m('E', 10, 10), m('F', 20, 20), m('G', 15, 15), m('H', 15, 15)];
    let r = tieBreakerCandidates(matches, { userVotes: { G: { songId: 'song1' } }, seen: {}, msLeftOf });
    assert.deepEqual(r.ties.map(x => [x.matchId, x.tier, x.score]), [['B', 'final', 11], ['E', 'final', 10], ['A', 'tied', 12]], 'soonest first; the last 3 hours is the final step');
    assert.deepEqual([...r.covered].sort(), ['A', 'B', 'E'], 'covered = every open tie you could vote in (not voted-in G, not 1 apart C, not low D, not closed F, not unknown H)');
    r = tieBreakerCandidates(matches, { userVotes: {}, seen: { 'B:final': 1, 'A:tied': 1 }, msLeftOf });
    assert.deepEqual(r.ties.map(x => x.matchId), ['E', 'G'], 'announced steps are skipped (G is now open to vote in)');
    assert.ok(r.covered.has('B') && r.covered.has('A'), 'but stay covered, so the closing alert leaves them alone');
    assert.deepEqual(tieBreakerCandidates([], { msLeftOf }).ties, []);
});
t('tie-breaker alert: tag, symbol, chips, link, both edits', () => {
    const n = { type: 'tiebreaker', matchId: 'm9', severityTier: 'tied', score: '24–24' };
    assert.ok(!isEventNotification({ type: 'match-tied' }), 'a match can no longer close level, so there is no tied-result alert');
    assert.ok(isEventNotification(n) && EVENT_KINDS.tiebreaker.both && EVENT_KINDS.tiebreaker.quiet);
    assert.equal(eventTag(n), 'Tie-breaker needed'); assert.equal(eventTag({ ...n, severityTier: 'final' }), 'Last chance to break the tie');
    assert.equal(eventGlyph(n), '=');
    assert.deepEqual(eventChips(n), ['Level at 24–24']); assert.deepEqual(eventChips({ ...n, severityTier: 'final' }), ['Level at 24–24', 'Last chance']);
    assert.equal(eventUrl(n), '/vote.html?match=m9');
});
t('move-on labels are told apart from look-at-this labels', () => {
    for (const s of ['Next match', 'Next target', 'Keep going', 'Keep hunting', 'Continue', 'Carry on', 'On to the next round', 'Press on', 'Light another', 'Encore', 'Run it again']) assert.ok(isMoveOnCta(s), s);
    for (const s of ['See the result', 'View achievements', 'See all', 'Gloat', 'Show me', 'Take a bow', 'View progress', 'Revenge', 'Rally some votes', '']) assert.ok(!isMoveOnCta(s), s);
});
t('button targets: results open the match, move-on labels open the matches list, achievements open the profile tab', () => {
    assert.equal(eventButtonUrl({ type: 'match-won', matchId: 'm1', cta: 'See the result' }), '/vote.html?match=m1');
    assert.equal(eventButtonUrl({ type: 'match-won', matchId: 'm1', cta: 'Next match' }), '/matches.html');
    assert.equal(eventButtonUrl({ type: 'match-lost', matchId: 'm1', ctaText: 'On to the next round' }), '/matches.html');
    assert.equal(eventButtonUrl({ type: 'match-lost', matchId: 'm1', cta: 'View Bracket' }), '/brackets.html');
    assert.equal(eventButtonUrl({ type: 'danger', matchId: 'm1', cta: 'Next match' }), '/vote.html?match=m1&share=1');   // only results are rerouted
    assert.equal(achievementButtonUrl({ type: 'achievement', cta: 'Next match', targetUrl: '/profile#achievements' }), '/matches.html');
    assert.equal(achievementButtonUrl({ type: 'achievement', cta: 'View achievements', targetUrl: '/profile#achievements' }), '/profile#achievements');
    assert.equal(achievementButtonUrl({ type: 'achievement', cta: 'See all' }), '/profile#achievements');
});
t('already-voted alerts (danger / nailbiter) never tell the player to vote (button or line)', () => {
    const bad = /^(cast a vote|make the pick|pick one|cast it|choose a fate|pick a present|pick a suitor|pick the direction|pick the heading|laugh and vote)$/i;
    for (const f of fs.readdirSync(new URL('../champion-packs/', import.meta.url))) {
        if (!f.endsWith('.json') || f.includes('manifest')) continue;
        const pack = JSON.parse(fs.readFileSync(new URL('../champion-packs/' + f, import.meta.url), 'utf8'));
        for (const type of ['danger', 'nailbiter']) for (const m of pack.alerts?.[type]?.messages || []) { assert.ok(!bad.test(m.cta || ''), `${f} ${type}: ${m.cta}`); assert.ok(!/\b(go vote|cast (it|your vote)|offer your vote|pick (one|yours|a target|a torch)|decide for me|and decide)\b/i.test(m.message || ''), `${f} ${type}: ${m.message}`); }
    }
});
console.log(`${pass} passed`);
