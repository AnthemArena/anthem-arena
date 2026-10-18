// node tools/test-notification-visuals.mjs
import assert from 'node:assert/strict';
import { withoutLeadingGlyph, eventLeadHtml, eventRowHtml, eventToastHtml, eventEdits, hexToRgba, darken, socialRowHtml, contentRowHtml, contentToastHtml, followRowHtml, followToastHtml, toastHeadlineHtml, avatarSrc, viewerAvatarSrc, championBadgeUrl, fallbackAvatarFor, matchEdits, editsPairHtml, accentFor, markFor, escapeHtml, circleHtml, pairHtml, stackHtml, toastHtml, profileSplashUrl, splashFromAvatarSrc } from '../js/notification-visuals.js';
let pass = 0; const t = (n, f) => { f(); console.log('  ok  ', n); pass++; };

t('avatarSrc handles url, object, JSON string, emoji, nothing', () => {
    assert.equal(avatarSrc('https://x/y.png'), 'https://x/y.png');
    assert.equal(avatarSrc({ type: 'url', value: 'https://x/a.png' }), 'https://x/a.png');
    assert.equal(avatarSrc({ type: 'champion', imageUrl: 'https://x/c.png' }), 'https://x/c.png');
    assert.equal(avatarSrc(JSON.stringify({ type: 'url', value: 'https://x/j.png' })), 'https://x/j.png');
    assert.ok(avatarSrc({ type: 'emoji', value: '🎵' }).startsWith('data:image/svg+xml'));
    assert.ok(avatarSrc('🎵').startsWith('data:image/svg+xml'));
    assert.equal(avatarSrc(null), null); assert.equal(avatarSrc({}), null); assert.equal(avatarSrc('{bad json'), null);
});
t('a raw object never becomes "[object Object]"', () => assert.ok(!String(avatarSrc({ type: 'url', value: 'https://x/a.png' })).includes('object')));
t('viewer avatar comes from storage', () => {
    const st = { getItem: k => (k === 'avatar' ? JSON.stringify({ type: 'url', value: 'https://x/me.png' }) : null) };
    assert.equal(viewerAvatarSrc(st), 'https://x/me.png'); assert.equal(viewerAvatarSrc({ getItem: () => null }), null);
});
t('champion badge is the pack icon', () => {
    assert.equal(championBadgeUrl({ icon: 'https://x/Jinx.png', portrait: { skin: 37 } }), 'https://x/Jinx.png');
    assert.equal(championBadgeUrl(null), null);
});
t('fallback avatar is stable per name and always an Arcane champion icon', () => {
    assert.equal(fallbackAvatarFor('FierceWatcher229'), fallbackAvatarFor('FierceWatcher229'));
    assert.match(fallbackAvatarFor('Kai'), /img\/champion\/(Vi|Caitlyn|Ekko|Jayce|Viktor|Heimerdinger|Jinx)\.png$/);
    assert.match(fallbackAvatarFor(undefined), /champion\//);
    const seen = new Set(['a', 'bb', 'Kai', 'Mia', 'Zed', 'Rook', 'Nova', 'Vex', 'Lux2'].map(fallbackAvatarFor)); assert.ok(seen.size >= 3);
});
t('match edits: song order kept, rival picked the other side, ally the same', () => {
    const m = { song1: { videoId: 'AAAAAAAAAAA' }, song2: { id: 'BBBBBBBBBBB' } };
    const r = matchEdits(m, 'song1', 'opponent');
    assert.equal(r.left.thumb, 'https://img.youtube.com/vi/AAAAAAAAAAA/mqdefault.jpg'); assert.equal(r.right.thumb, 'https://img.youtube.com/vi/BBBBBBBBBBB/mqdefault.jpg');
    assert.equal(r.yourKey, 'song1'); assert.equal(r.theirKey, 'song2');
    const a = matchEdits(m, 'song2', 'ally'); assert.equal(a.yourKey, 'song2'); assert.equal(a.theirKey, 'song2');
    assert.equal(matchEdits(m, undefined, 'ally'), null); assert.equal(matchEdits(null, 'song1', 'ally'), null); assert.equal(matchEdits({ song1: {}, song2: {} }, 'song1', 'ally'), null);
});
t('edits pair: picks ringed, other dimmed, avatars on the picked edits', () => {
    const m = { song1: { videoId: 'AAAAAAAAAAA' }, song2: { videoId: 'BBBBBBBBBBB' } };
    const rival = editsPairHtml({ edits: matchEdits(m, 'song1', 'opponent'), theirSrc: 'https://x/t.png', theirName: 'Kai', yourSrc: 'https://x/y.png', relationship: 'opponent', size: 40, accent: '#ff69b4' });
    assert.equal((rival.match(/nv-pick/g) || []).length, 2); assert.ok(!rival.includes('nv-dim')); assert.ok(rival.includes('VS'));
    assert.ok(!rival.includes('nv-who') && !rival.includes('nv-you>'));
    const ally = editsPairHtml({ edits: matchEdits(m, 'song2', 'ally'), theirSrc: null, theirName: 'Kai', yourSrc: null, relationship: 'ally', size: 40, accent: '#4ade80' });
    assert.equal((ally.match(/nv-pick/g) || []).length, 1); assert.equal((ally.match(/nv-dim/g) || []).length, 1);
    assert.ok(!ally.includes('YOU'));
});
t('a badge picture sits on the avatar', () => {
    const h = circleHtml('https://x/a.png', 'Kai', 40, { badge: 'https://x/thumb.jpg' });
    assert.ok(h.includes('nv-badge') && h.includes('https://x/thumb.jpg'));
    assert.ok(!circleHtml('https://x/a.png', 'Kai', 40).includes('nv-badge'));
});
t('accent and marker', () => { assert.equal(accentFor('ally', { color: '#fff' }), '#4ade80'); assert.equal(accentFor('opponent', { color: '#e91e63' }), '#e91e63'); assert.equal(accentFor('opponent', null), '#ff69b4'); assert.equal(markFor('ally'), '='); assert.equal(markFor('opponent'), 'VS'); });
t('names and text are escaped', () => {
    assert.equal(escapeHtml('<b>"x"&'), '&lt;b&gt;&quot;x&quot;&amp;');
    const h = circleHtml('https://x/a.png" onerror="alert(1)', '<img>', 40);
    assert.ok(!h.includes('" onerror="alert(1)')); assert.ok(h.includes('&lt;'));
});
t('pair, stack and toast render the pieces', () => {
    const p = pairHtml({ theirSrc: 'https://x/a.png', theirName: 'Kai', yourSrc: null, relationship: 'opponent', size: 40, accent: '#ff69b4' });
    assert.ok(p.includes('VS') && p.includes('nv-you-rival') && p.includes('>K<'));
    assert.ok(pairHtml({ theirSrc: null, theirName: 'Kai', yourSrc: null, relationship: 'ally', size: 40, accent: '#4ade80' }).includes('>=<'));
    assert.equal((stackHtml([null, null, null, null], ['A', 'B', 'C', 'D']).match(/nv-stacked/g) || []).length, 3);
    const t1 = toastHtml({ relationship: 'opponent', triggerUsername: 'Kai' }, { theirSrc: null, yourSrc: null, jinxSrc: 'https://x/j.jpg', accent: '#ff69b4', headline: 'Kai voted against you', quip: 'Boom <3', cta: 'Challenge' });
    assert.ok(t1.includes('Kai') && t1.includes('voted against you') && t1.includes('Boom &lt;3') && t1.includes('handleBulletinCTA') && t1.includes('openBulletinMatch'));
});
t('toast headline puts the name on one line and the action under it', () => {
    const h = toastHeadlineHtml('FierceWatcher229 voted against you', 'https://x/a.png', 'FierceWatcher229', '#ff69b4');
    assert.ok(h.includes('nv-toast-name">FierceWatcher229<') && h.includes('nv-toast-action">voted against you<'));
    assert.ok(toastHeadlineHtml('Someone voted with you', null, 'Kai', '#fff').includes('Someone voted with you'));   // name not at the start: whole text kept
});
t('follow row and toast: name, quip, right button, safe text', () => {
    const n = { id: 'x1', type: 'new-follower', triggerUserId: 'u9', triggerUsername: 'Kai<b>', targetUrl: '/profile.html?user=Kai' };
    const row = followRowHtml(n, { headline: 'Kai<b> followed you', quip: 'New fan detected.', timeAgo: '5m ago', championPack: { id: 'jinx', color: '#ff69b4', icon: 'https://x/j.png' }, theirSrc: null });
    assert.ok(row.includes('data-action="follow-back"') && row.includes('data-user-id="u9"') && row.includes('Follow back') && row.includes('New fan detected.'));
    assert.ok(!row.includes('Kai<b>') && row.includes('Kai&lt;b&gt;'));
    const already = followRowHtml(n, { headline: 'Kai followed you', quip: '', timeAgo: '', championPack: null, alreadyFollowing: true });
    assert.ok(already.includes('data-action="navigate"') && already.includes('View profile') && !already.includes('follow-back'));
    const toast = followToastHtml(n, { theirSrc: null, jinxSrc: 'https://x/j.png', accent: '#ff69b4', quip: 'Another one joins the chaos!', cta: 'Follow back', headline: 'Kai followed you back' });
    assert.ok(toast.includes('handleBulletinCTA') && toast.includes('followed you back') && toast.includes('Another one joins the chaos!') && toast.includes('nv-follow-face'));
});
t('content row and toast: faces, headline, quote escaped, one button that opens the post', () => {
    const n = { id: 'a', ids: ['a', 'b', 'c'], type: 'like', triggerUsername: 'Kai', targetUrl: '/feed.html#post-1', read: false };
    const parts = { who: '3 people', action: 'liked your post', headline: '3 people liked your post', names: 'Kai, Rex, Mia' };
    const row = contentRowHtml(n, { parts, quote: 'my <b>edit</b>', icon: '❤️', cta: 'View post', timeAgo: '5m ago', championPack: { id: 'jinx', color: '#ff69b4' }, srcs: [null, null, null], names: ['Kai', 'Rex', 'Mia'] });
    assert.ok(row.includes('3 people liked your post') && row.includes('Kai, Rex, Mia') && row.includes('nv-stack') && row.includes('unread'));
    assert.ok(row.includes('data-id="a,b,c"') && row.includes('data-action="navigate"') && row.includes('data-url="/feed.html#post-1"') && row.includes('View post'));
    assert.ok(row.includes('my &lt;b&gt;edit&lt;/b&gt;') && !row.includes('<b>edit'));
    const solo = contentRowHtml({ ...n, ids: ['a'] }, { parts: { who: 'Kai', action: 'liked your post', headline: 'Kai liked your post', names: '' }, quote: '', icon: '❤️', cta: 'View post', timeAgo: '', championPack: null, srcs: [null], names: ['Kai'] });
    assert.ok(!solo.includes('nv-stack') && !solo.includes('class="nv-content"'));
    const toast = contentToastHtml(n, { parts, quote: 'Great <i>edit</i>', icon: '❤️', cta: 'View post', accent: '#ff69b4', srcs: [null, null, null], names: ['Kai', 'Rex', 'Mia'] });
    assert.ok(toast.includes('handleBulletinCTA') && toast.includes('3 people') && toast.includes('liked your post') && toast.includes('Great &lt;i&gt;edit&lt;/i&gt;') && toast.includes('View post'));
});
t('rows never use bare class names the feed stylesheet styles (a "comment" class turned the bell row into a flex row)', () => {
    const tokens = html => new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/)));
    const bad = ['comment', 'like', 'reply', 'mention', 'content', 'follow', 'emote-received'];
    const n = { id: 'a', ids: ['a'], triggerUsername: 'Kai', targetUrl: '/feed.html#post-1' };
    const parts = { who: 'Kai', action: 'x', headline: 'Kai x', names: '' };
    for (const type of ['like', 'comment', 'reply', 'mention', 'emote-received']) {
        const row = tokens(contentRowHtml({ ...n, type }, { parts, quote: 'q', icon: '💬', cta: 'View', timeAgo: '', championPack: null, srcs: [null], names: ['Kai'] }));
        for (const b of bad) assert.ok(!row.has(b), `${type} row has bare class "${b}"`);
        assert.ok(row.has('nv-row') && row.has(`nv-kind-${type}`));
    }
    const follow = tokens(followRowHtml(n, { headline: 'h', quip: '', timeAgo: '', championPack: null }));
    for (const b of bad) assert.ok(!follow.has(b), `follow row has bare class "${b}"`);
});
t('profile splash: chosen champion, auto-match avatar, default gradient falls back to the cup champion', () => {
    const store = o => ({ getItem: k => (k in o ? o[k] : null) });
    const J = { id: 'jinx' };
    assert.match(profileSplashUrl(J, store({ banner: JSON.stringify({ type: 'champion', championId: 'Vi' }) })), /Vi_0\.jpg$/);
    assert.match(profileSplashUrl(J, store({ avatar: JSON.stringify({ type: 'url', name: "Kai'Sa" }) })), /KaiSa_0\.jpg$/);
    assert.match(profileSplashUrl(J, store({ banner: JSON.stringify({ type: 'default' }), avatar: JSON.stringify({ type: 'url', name: 'Vi' }) })), /Jinx_0\.jpg$/);
    assert.match(profileSplashUrl(J, store({})), /Jinx_0\.jpg$/);
});
t('splash from a champion avatar address; other pictures give null', () => {
    assert.match(splashFromAvatarSrc('https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Heimerdinger.png'), /splash\/Heimerdinger_0\.jpg$/);
    assert.match(splashFromAvatarSrc('https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Vi_0.jpg'), /splash\/Vi_0\.jpg$/);
    assert.equal(splashFromAvatarSrc('data:image/svg+xml,abc'), null);
    assert.equal(splashFromAvatarSrc(null), null);
});
t('an ally / rival row opens the match, and its button opens the profile', () => {
    const n = { id: 'a1', relationship: 'ally', triggerUsername: 'Mia', matchTitle: 'A vs B', targetUrl: '/vote.html?match=m1', ctaUrl: '/profile.html?user=Mia', ctaAction: 'navigate', ctaText: 'View profile', detail: 'hi', read: false };
    const html = socialRowHtml(n, { headline: null, timeAgo: '1m', championPack: { id: 'jinx' } });
    assert.ok(/class="notification-item nv-row[^"]*"[^>]*data-url="\/vote\.html\?match=m1"/.test(html.replace(/\s+/g, ' ')), 'row opens the match');
    assert.ok(/<button class="notification-item-cta"[^>]*data-action="navigate"[^>]*data-url="\/profile\.html\?user=Mia">View profile<\/button>/.test(html.replace(/\s+/g, ' ')), 'button opens the profile');
    const old = socialRowHtml({ ...n, ctaUrl: undefined, ctaText: 'View match' }, { headline: null, timeAgo: '1m', championPack: null });
    assert.ok(old.includes('data-url="/vote.html?match=m1">View match</button>'), 'without a profile url the button falls back to the match');
});
t('colour helpers', () => {
    assert.equal(hexToRgba('#ff0000', 0.5), 'rgba(255,0,0,0.5)'); assert.equal(hexToRgba('nonsense', 1), 'rgba(255,105,180,1)');
    assert.equal(darken('#ff8000', 0.5), '#804000'); assert.equal(darken('x'), '#c2185b');
});
t('event pictures: your pick ringed and the other dimmed; a match with no vote shows both evenly; no pictures gives null', () => {
    const m = { song1: { videoId: 'aaaaaaaaaaa' }, song2: { videoId: 'bbbbbbbbbbb' } };
    const e = eventEdits(m, 'song2'); assert.equal(e.theirKey, 'song2'); assert.equal(e.neutral, false);
    assert.equal(eventEdits(m, undefined).neutral, true);
    assert.equal(eventEdits(null, 'song1'), null); assert.equal(eventEdits({ song1: {}, song2: {} }, 'song1'), null);
    const html = editsPairHtml({ edits: e, relationship: 'event', size: 40, accent: '#4ade80' }).replace(/\s+/g, ' ');
    assert.ok(/nv-edit nv-dim"[^>]*><img src="[^"]*aaaaaaaaaaa/.test(html) && /nv-edit nv-pick"[^>]*--nv-ring:#4ade80/.test(html), html);
    assert.ok(!editsPairHtml({ edits: eventEdits(m, undefined), relationship: 'event', size: 40, accent: '#fff' }).includes('nv-dim'));
});
t('event toast: tag, bubble, chips, one button; the whole card and the button both call handleBulletinCTA', () => {
    const html = eventToastHtml({ type: 'danger' }, { tag: 'Your pick is behind', glyph: '▼', edits: eventEdits({ song1: { videoId: 'aaaaaaaaaaa' }, song2: { videoId: 'bbbbbbbbbbb' } }, 'song1'), accent: '#ff5a5f', jinxSrc: 'https://x/j.png', quip: 'Down 12. <b>hi</b>', detail: 'Fix it', chips: ['38% vs 62%'], cta: 'Share the match' });
    assert.ok(!html.includes('nv-event-tag'), 'no heading line');
    assert.ok(/aria-label="Your pick is behind"/.test(html) && html.includes('nv-mark-event') && html.includes('>▼<'), 'the symbol sits between the two edits');
    assert.ok(html.includes('Share the match') && html.includes('38% vs 62%') && html.includes('Fix it'));
    assert.ok(html.includes('Down 12. &lt;b&gt;hi&lt;/b&gt;'), 'text is escaped');
    assert.equal((html.match(/handleBulletinCTA/g) || []).length, 2); assert.equal((html.match(/<button/g) || []).length, 2);
    const bare = eventToastHtml({ type: 'round-opening' }, { tag: 'Round 2 is open', edits: null, accent: '#ff69b4', jinxSrc: null, quip: 'Go', cta: 'Start' });
    assert.ok(!bare.includes('nv-edits') && bare.includes('nv-glyph'), 'no match: the symbol alone in a circle');
});
t('the champion line drops a symbol the picture already shows', () => {
    assert.equal(withoutLeadingGlyph('👋 Welcome back!', '👋'), 'Welcome back!');
    assert.equal(withoutLeadingGlyph('👀 Still deciding?', '👀'), 'Still deciding?');
    assert.equal(withoutLeadingGlyph('▼ Down 12', '▼'), 'Down 12');
    assert.equal(withoutLeadingGlyph('🚨 In danger', '▼'), '🚨 In danger');
    assert.equal(withoutLeadingGlyph('Welcome back!', '👋'), 'Welcome back!');
    assert.equal(withoutLeadingGlyph('👋', '👋'), '👋');
    assert.equal(withoutLeadingGlyph('Plain', 'VS'), 'Plain');
    assert.ok(!eventToastHtml({ type: 'welcome' }, { tag: 'Welcome back', glyph: '👋', accent: '#f0f', jinxSrc: null, quip: '👋 Hi again', cta: 'Go' }).includes('👋 Hi again'));
});
t('event lead: symbol between the edits, or alone; VS stays plain', () => {
    const e = eventEdits({ song1: { videoId: 'aaaaaaaaaaa' }, song2: { videoId: 'bbbbbbbbbbb' } }, 'song2');
    assert.ok(eventLeadHtml({ glyph: '=', label: 'Too close', edits: e, accent: '#fb0', size: 60 }).includes('>=<'));
    assert.ok(!eventLeadHtml({ glyph: 'VS', label: 'x', edits: e, accent: '#fb0' }).includes('nv-mark-event'));
    const alone = eventLeadHtml({ glyph: '✓', label: 'Your pick won', edits: null, accent: '#4ade80', size: 40 });
    assert.ok(alone.includes('nv-glyph') && alone.includes('>✓<') && !alone.includes('nv-edit '));
});
t('event row: opens the match from the row and from the button, with the tag, the match and the champion line', () => {
    const n = { id: 'e1', type: 'match-won', matchTitle: 'A vs B', read: false };
    const html = eventRowHtml(n, { tag: 'Your pick won', edits: null, accent: '#4ade80', jinxSrc: 'https://x/j.png', quip: 'Told you.', timeAgo: '2m ago', championPack: { id: 'vi' }, cta: 'Nice', url: '/vote.html?match=m1' }).replace(/\s+/g, ' ');
    assert.ok(/class="notification-item nv-row nv-event-row unread"[^>]*data-url="\/vote\.html\?match=m1"/.test(html));
    assert.ok(html.includes('Your pick won') && html.includes('2m ago · A vs B') && html.includes('Told you.'));
    assert.ok(/data-action="navigate" data-url="\/vote\.html\?match=m1">Nice<\/button>/.test(html));
});
console.log(`${pass} passed`);
