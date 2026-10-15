// Offline tests for js/brackets-groups.js and describeCup() (the brackets page's group stage view).   node tools/test-brackets-groups.mjs
import assert from 'node:assert/strict';
import { planGroupBuild, planKnockoutBuild, describeCup } from '../js/group-builder.js';
import { cupSummary, buildGroupViews, groupCounts, groupCardHtml, groupStageHtml, stageTabsHtml, knockoutNoteHtml, defaultStage, esc } from '../js/brackets-groups.js';

const CUP = 'jinx-cup-1';
const mk = n => ({
    id: `vid${String(n).padStart(8, '0')}`, videoId: `vid${String(n).padStart(8, '0')}`, title: `Jinx edit ${n}`, shortTitle: `Edit ${n}`, slug: `edit-${n}`,
    artist: `Creator ${n}`, channelId: `chan${n}`, year: 2026, status: 'ok', embedAllowed: true, flags: [], tournaments: [CUP],
    views: 1_000_000 - n * 1000, likes: 50_000 - n * 40
});
const plan = size => planGroupBuild({ cupId: CUP, cupName: 'Jinx Cup 1', entries: Array.from({ length: size }, (_, i) => mk(i + 1)), drawSeed: 's' });
const close = (m, v1, v2) => ({ ...m, status: 'completed', totalVotes: v1 + v2, song1: { ...m.song1, votes: v1 }, song2: { ...m.song2, votes: v2 }, winnerId: v1 > v2 ? m.song1.id : m.song2.id });
const finish = m => close(m, m.song1.seed < m.song2.seed ? 60 : 40, m.song1.seed < m.song2.seed ? 40 : 60);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

// A 16-edit cup mid-way: group A finished, group B live, C partly closed, D untouched.
const midway = () => {
    const p = plan(16);
    const ms = p.matches.map((m, i) => {
        if (m.group === 'A') return finish(m);
        if (m.group === 'B') return { ...m, status: 'live', totalVotes: 40, song1: { ...m.song1, votes: 30 }, song2: { ...m.song2, votes: 10 } };
        if (m.group === 'C' && m.matchday === 1) return finish(m);
        return m;
    });
    return { p, ms };
};

test('describeCup: single elimination is described the way the page always did', () => {
    const se = [{ round: 1, tournamentName: 'X' }, { round: 1 }, { round: 1 }, { round: 1 }, { round: 2 }, { round: 2 }, { round: 3 }];
    assert.deepEqual(describeCup(se), { format: 'single-elimination', isGroupCup: false, cupName: 'X', totalRounds: 3, entries: 8 });
});

test('describeCup: a group cup knows its size and rounds BEFORE the knockout exists', () => {
    const { ms } = midway(), d = describeCup(ms);
    assert.equal(d.isGroupCup, true); assert.equal(d.groups, 4); assert.equal(d.entries, 16); assert.equal(d.qualifiers, 8);
    assert.equal(d.totalRounds, 4); assert.equal(d.knockoutBuilt, false); assert.equal(d.cupName, 'Jinx Cup 1');
    assert.equal(describeCup(plan(128).matches).totalRounds, 7);
    assert.equal(describeCup(plan(8).matches).totalRounds, 3);
});

test('describeCup: knockoutBuilt flips once knockout matches exist', () => {
    const p = plan(16), done = p.matches.map(finish);
    const k = planKnockoutBuild({ tournament: p.tournament, matches: done });
    assert.equal(describeCup([...done, ...k.knockoutMatches]).knockoutBuilt, true);
    assert.equal(describeCup([...done, ...k.knockoutMatches]).totalRounds, 4);
});

test('group views: one per group, in order, with states and progress', () => {
    const v = buildGroupViews(midway().ms);
    assert.deepEqual(v.map(g => g.name), ['A', 'B', 'C', 'D']);
    assert.deepEqual(v.map(g => g.state), ['complete', 'live', 'idle', 'idle']);
    assert.deepEqual(v.map(g => g.played), [6, 0, 2, 0]);
    assert.equal(v[1].live, 6);
    assert.ok(v.every(g => g.rows.length === 4 && g.matches.length === 6));
    assert.deepEqual(groupCounts(v), { all: 4, live: 1, complete: 1 });
    const nums = v[0].matches.map(m => m.matchNumber); assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
});

test('"Qualified" and "Out" are only said for a FINISHED group', () => {
    const v = buildGroupViews(midway().ms);
    const a = groupCardHtml(v[0]), c = groupCardHtml(v[2]), b = groupCardHtml(v[1]);
    assert.equal((a.match(/gs-pill-in/g) || []).length, 2); assert.equal((a.match(/gs-pill-out/g) || []).length, 2);
    for (const html of [b, c]) { assert.ok(!html.includes('Qualified')); assert.ok(!html.includes('>Out<')); }
    assert.ok(c.includes('gs-in-position'));             // but the current top two are still highlighted
    assert.ok(a.includes('Finished')); assert.ok(c.includes('2 of 6 played')); assert.ok(b.includes('6 live'));
});

test('a group with live matches opens its match list; others stay closed', () => {
    const v = buildGroupViews(midway().ms);
    assert.ok(/<details class="gs-matches" open>/.test(groupCardHtml(v[1])));
    assert.ok(/<details class="gs-matches">/.test(groupCardHtml(v[0])));
    assert.ok(/<details class="gs-matches">/.test(groupCardHtml(v[3])));
});

test('percentages: shown for finished matches, hidden on live ones until the visitor has voted', () => {
    const v = buildGroupViews(midway().ms);
    assert.ok(/gs-pct/.test(groupCardHtml(v[0])));                                 // finished: shown
    const live = groupCardHtml(v[1]);
    assert.ok(!/gs-pct/.test(live));                                               // live: hidden (do not sway votes)
    assert.ok(/gs-pct/.test(groupCardHtml(v[1], { userVoted: () => true })));      // this visitor voted: shown
    assert.ok(live.includes('gs-tag-live') && groupCardHtml(v[3]).includes('gs-tag-soon') && groupCardHtml(v[0]).includes('gs-tag-done'));
});

test('match rows link to the vote page; winners are marked', () => {
    const v = buildGroupViews(midway().ms), html = groupCardHtml(v[0]);
    assert.equal((html.match(/href="vote\?match=jinx-cup-1-group-A-match-\d"/g) || []).length, 6);
    assert.equal((html.match(/gs-win/g) || []).length, 6);                         // one winner per finished match
});

test('YouTube titles and creators are escaped everywhere', () => {
    const { ms } = midway();
    const evil = ms.map(m => m.group === 'A' && m.matchNumber === 1
        ? { ...m, song1: { ...m.song1, shortTitle: '<img src=x onerror=alert(1)>', artist: '"><script>x</script>' } } : m);
    const html = groupStageHtml(buildGroupViews(evil), describeCup(evil));
    assert.ok(!html.includes('<img src=x') && !html.includes('<script>x'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.equal(esc(`a&b<c>"d'`), 'a&amp;b&lt;c&gt;&quot;d&#39;');
});

test('a dead heat at the cut is explained on the card', () => {
    const p = plan(16), a = p.matches.filter(m => m.group === 'A');
    const [w, x, y, z] = [...new Set(a.flatMap(m => [m.song1.id, m.song2.id]))];
    const M = (i, j) => a.find(m => [m.song1.id, m.song2.id].sort().join() === [i, j].sort().join());
    const res = [[w, x, 60, 40], [w, y, 60, 40], [w, z, 60, 40], [x, y, 50, 49], [y, z, 50, 49], [z, x, 50, 49]]
        .map(([i, j, vi, vj]) => { const m = M(i, j); return close(m, m.song1.id === i ? vi : vj, m.song1.id === i ? vj : vi); });
    const ms = p.matches.map(m => m.group === 'A' ? res.find(r => r.matchId === m.matchId) : m);
    assert.ok(groupCardHtml(buildGroupViews(ms)[0]).includes('level on everything'));
    assert.ok(!groupCardHtml(buildGroupViews(midway().ms)[0]).includes('level on everything'));
});

test('stage section: header, filter chip counts, one card per group', () => {
    const { ms } = midway(), v = buildGroupViews(ms), info = describeCup(ms);
    const html = groupStageHtml(v, info);
    assert.equal((html.match(/class="gs-card"/g) || []).length, 4);
    assert.ok(html.includes('4 groups of 4') && html.includes('(8 edits)'));
    assert.ok(/data-filter="live"[^>]*>Live now <span class="gs-chip-count">1<\/span>/.test(html));
    assert.ok(/data-filter="complete"[^>]*>Finished <span class="gs-chip-count">1<\/span>/.test(html));
    assert.ok(/data-filter="all"[^>]*aria-pressed="true"/.test(html));
});

test('128 entrants: 32 cards, 6 match rows each', () => {
    const p = plan(128), html = groupStageHtml(buildGroupViews(p.matches), describeCup(p.matches));
    assert.equal((html.match(/class="gs-card"/g) || []).length, 32);
    assert.equal((html.match(/class="gs-match /g) || []).length, 192);
});

test('tabs: active tab, live count, knockout meta changes once built', () => {
    const { ms } = midway(), v = buildGroupViews(ms), info = describeCup(ms);
    const t = stageTabsHtml({ active: 'groups', info, groupViews: v });
    assert.ok(/class="stage-tab active"[^>]*data-stage="groups"[^>]*aria-selected="true"/.test(t));
    assert.ok(t.includes('1 live') && t.includes('after the groups'));
    assert.ok(stageTabsHtml({ active: 'knockout', info: { ...info, knockoutBuilt: true }, groupViews: v }).includes('8 edits'));
});

test('knockout note names the first round and offers the groups tab', () => {
    const html = knockoutNoteHtml(describeCup(midway().ms), 'Quarter-finals');
    assert.ok(html.includes('4 groups (8 in all)') && html.includes('Quarter-finals') && html.includes('data-stage="groups"'));
});

test('default tab: groups until the knockout has started', () => {
    const p = plan(16), done = p.matches.map(finish);
    assert.equal(defaultStage([{ round: 1 }], { isGroupCup: false }), null);                       // single elimination: no tabs
    assert.equal(defaultStage(midway().ms, describeCup(midway().ms)), 'groups');
    const k = planKnockoutBuild({ tournament: p.tournament, matches: done }).knockoutMatches;
    const built = [...done, ...k];
    assert.equal(defaultStage(built, describeCup(built)), 'knockout');                              // built, nothing open yet
    const withLive = [...done, ...k.map((m, i) => i === 0 ? { ...m, status: 'live' } : m)];
    assert.equal(defaultStage(withLive, describeCup(withLive)), 'knockout');
    const groupLive = [...done.map((m, i) => i === 0 ? { ...m, status: 'live' } : m), ...k];        // a group match reopened
    assert.equal(defaultStage(groupLive, describeCup(groupLive)), 'groups');
});

// ---------- info panel ----------
const names = { roundName: r => ({ 2: 'Quarter-finals', 3: 'Semi-finals', 4: 'Final' }[r] || `R${r}`), formatDate: d => `on ${d}` };
const sum = ms => cupSummary(ms, describeCup(ms), names);

test('info panel: groups upcoming, live, between groups, finished', () => {
    const p = plan(16), up = sum(p.matches);
    assert.equal(up.statusText, '📅 Group Stage Opens soon'); assert.equal(up.statusClass, 'status-upcoming');
    assert.equal(up.edits, 16); assert.equal(up.progress, '0 / 24 Group Matches'); assert.equal(up.format, 'Group Stage + Knockout');
    const dated = p.matches.map(m => m.matchNumber === 1 ? { ...m, date: '2026-11-01' } : m);
    assert.equal(sum(dated).statusText, '📅 Group Stage Opens on 2026-11-01');
    const live = sum(midway().ms);
    assert.equal(live.statusText, 'Group Stage - 6 Live Matches'); assert.equal(live.liveDot, true); assert.equal(live.statusClass, 'status-live');
    assert.equal(live.progress, '8 / 24 Group Matches');
    const oneLive = sum(p.matches.map((m, i) => i === 0 ? { ...m, status: 'live' } : m)); assert.equal(oneLive.statusText, 'Group Stage - 1 Live Match');
    const allDone = sum(p.matches.map(finish));
    assert.equal(allDone.statusText, '✅ Groups complete - knockout next'); assert.equal(allDone.progress, '24 / 24 Group Matches'); assert.notEqual(allDone.statusClass, 'status-completed');
});

test('info panel: a finished group stage is NOT reported as a finished tournament', () => {
    const done = plan(16).matches.map(finish);
    assert.ok(!sum(done).statusText.includes('Champion'));
});

test('info panel: knockout built, live, and champion', () => {
    const p = plan(16), done = p.matches.map(finish), k = planKnockoutBuild({ tournament: p.tournament, matches: done }).knockoutMatches;
    const built = [...done, ...k];
    const next = sum(built); assert.equal(next.statusText, '📅 Quarter-finals Opens soon'); assert.equal(next.progress, '24 / 31 Matches');
    const live = sum([...done, ...k.map(m => m.round === 2 && m.matchNumber <= 2 ? { ...m, status: 'live' } : m)]);
    assert.equal(live.statusText, 'Quarter-finals - 2 Live Matches');
    // play the whole knockout (first-listed side wins every match)
    let all = [...done, ...k.map(m => m)];
    for (const round of [2, 3, 4]) {
        all = all.map(m => {
            if (m.round !== round) return m;
            const fresh = all.filter(x => x.round === m.round - 1);
            const resolve = song => song.sourceMatch ? (all.find(x => x.matchId === song.sourceMatch).winnerId === all.find(x => x.matchId === song.sourceMatch).song1.id ? all.find(x => x.matchId === song.sourceMatch).song1 : all.find(x => x.matchId === song.sourceMatch).song2) : song;
            const filled = { ...m, song1: { ...resolve(m.song1), votes: 0 }, song2: { ...resolve(m.song2), votes: 0 } };
            return close(filled, 70, 30);
        });
    }
    const champ = sum(all);
    assert.match(champ.statusText, /^🏆 Champion: Edit \d+$/); assert.equal(champ.statusClass, 'status-completed'); assert.equal(champ.progress, '31 / 31 Matches');
});

test('voted state: tick on the pick, other edit dimmed, VOTED tag, counter "n/6 voted", header note', () => {
    const v = buildGroupViews(midway().ms);                       // group B (v[1]) is live: 6 open matches
    const b = v[1], id1 = b.matches[0].matchId, id2 = b.matches[1].matchId;
    const choices = { [id1]: 'song2', [id2]: 'song1' };
    const html = groupCardHtml(b, { userChoice: id => choices[id] || null });
    assert.ok(html.includes('2/6 voted') && html.includes('You voted 2/6') && html.includes('data-voted="2"'));
    assert.equal((html.match(/gs-tag-voted/g) || []).length, 2);                   // two voted rows get the quiet tag
    assert.equal((html.match(/gs-tag-live/g) || []).length, 4);                    // the other four still say Vote
    assert.equal((html.match(/gs-check/g) || []).length, 2);                       // one tick per voted match
    assert.equal((html.match(/gs-dimmed/g) || []).length, 2);                      // the edit not picked is dimmed
    const row1 = html.split('<li').find(x => x.includes(id1));                     // picked song2: the second side carries the tick
    assert.ok(row1.indexOf('gs-picked') > row1.indexOf('gs-vs'));
    assert.ok(row1.includes('gs-pct'));                                            // percentages appear on voted rows only
    assert.equal((html.match(/gs-pct/g) || []).length, 4);                         // 2 voted rows x 2 sides
});

test('voted state: nothing voted = no ticks, "0/6 voted", no pick styling', () => {
    const v = buildGroupViews(midway().ms);
    const html = groupCardHtml(v[1], { userChoice: () => null });
    assert.ok(html.includes('0/6 voted') && html.includes('You voted 0/6'));
    assert.ok(!/gs-check|gs-picked|gs-dimmed|gs-tag-voted|gs-pct/.test(html));
});

test('voted state: voted in every open match reads as done; finished groups have no header note; finished matches keep winner styling', () => {
    const v = buildGroupViews(midway().ms);
    const all = groupCardHtml(v[1], { userChoice: () => 'song1' });
    assert.ok(all.includes('gs-voted-all') && all.includes('6/6 voted'));
    const done = groupCardHtml(v[0], { userChoice: m => 'song1' });                // group A is finished
    assert.ok(!done.includes('gs-voted-note'));
    assert.equal((done.match(/gs-dimmed/g) || []).length, 0);                      // finished: no dimming, the winner is already marked
    assert.equal((done.match(/gs-win/g) || []).length, 6);
    assert.equal((done.match(/gs-check/g) || []).length, 6);                       // the pick is still ticked
    assert.ok(!groupCardHtml(v[3], { userChoice: () => null }).includes('gs-voted-note'));   // an upcoming group has nothing open: no note
});

test('voted state: the old yes/no option still works and an unknown stored value is not marked as a side', () => {
    const v = buildGroupViews(midway().ms);
    const yes = groupCardHtml(v[1], { userVoted: () => true });
    assert.ok(yes.includes('6/6 voted') && !yes.includes('gs-check'));
    const odd = groupCardHtml(v[1], { userChoice: () => 'banana' });
    assert.ok(odd.includes('6/6 voted') && !odd.includes('gs-check') && !odd.includes('gs-dimmed'));
});

test('counter: "n/6 voted" only while something is open or you have voted; otherwise it just says "6 matches"', () => {
    const v = buildGroupViews(midway().ms);
    assert.ok(groupCardHtml(v[1], {}).includes('0/6 voted'));                         // live group, nothing voted yet
    assert.ok(groupCardHtml(v[0], { userChoice: () => null }).includes('>6 matches<'));   // finished group, you voted in none of it
    assert.ok(!groupCardHtml(v[0], { userChoice: () => null }).includes('0/6 voted'));
    assert.ok(groupCardHtml(v[3], { userChoice: () => null }).includes('>6 matches<'));   // group that has not opened yet
    assert.ok(groupCardHtml(v[0], { userChoice: () => 'song1' }).includes('6/6 voted')); // finished group you did vote in
});

console.log(`\n${passed} tests passed`);
