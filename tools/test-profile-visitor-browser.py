# Browser test of what a profile shows about votes in LIVE matches, on the REAL profile page with the in-memory Firestore.
#   python3 tools/test-profile-visitor-browser.py        (screenshots go to /tmp/profile-shots)
# Rule under test: someone else's pick in a live match is hidden until you have voted in it too; closed matches show to everyone;
# the owner sees everything on their own page; vote posts read as one neutral sentence.
import os, sys, json, subprocess, threading, http.server, socketserver, functools, base64, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/profile-shots'
os.makedirs(SHOTS, exist_ok=True)
subprocess.run(['node', os.path.join(ROOT, 'tools/test-support/bracket-fixtures.mjs'), FIX], check=True, capture_output=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

FS = open(os.path.join(ROOT, 'tools/test-support/browser-firestore.js')).read()
APP = "export const initializeApp=()=>({});"
AUTH = "export const getAuth=()=>({currentUser:null});export const signInAnonymously=async()=>({});export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb(null),0);return()=>{}};export const signOut=async()=>({});"
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
failed = []
real = lambda errs: [e for e in errs if 'docChanges' not in e]
def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'   got: {got}'))
    if not ok: failed.append(name)

matches = json.load(open(f'{FIX}/groups-mid-16.json'))
live = [m for m in matches if m['status'] == 'live']
done = [m for m in matches if m['status'] == 'completed']
L1, L2, C1 = live[0], live[1], done[0]
title = lambda s: (s.get('shortTitle') or s['title'])
now = int(time.time() * 1000)

def vote(m, choice, ago, champ=None):
    d = dict(userId='u_owner', matchId=m['matchId'], choice=choice, timestamp=now - ago, tournamentId='jinx-cup-1', tournament='jinx-cup-1')
    if champ: d['championId'] = champ
    return (f"votes/v_{m['matchId']}", d)
def vpost(pid, m, choice, text):
    v, o = (m['song1'], m['song2']) if choice == 'song1' else (m['song2'], m['song1'])
    return (f'posts/{pid}', dict(postId=pid, userId='u_owner', username='Owner', avatar={'type': 'emoji', 'value': '🎵'}, type='vote', text=text, matchId=m['matchId'],
        votedSongName=title(v), opponentSongName=title(o), choice=choice, round=1, timestamp=now - 120000, privacy='public', likeCount=0, commentCount=0,
        matchState=dict(voteDiff=1, userPct=51, wasClose=True)))
PROFILE = ('profiles/u_owner', dict(username='Owner', avatar={'type': 'emoji', 'value': '🎵'}, companionId='jinx', createdAt=now - 86400000))
BASE = [PROFILE, vote(L1, 'song1', 3000), vote(L2, 'song2', 2000), vote(C1, 'song1', 1000)]
TYPED = ('posts/p-typed', dict(postId='p-typed', userId='u_owner', username='Owner', avatar={'type': 'emoji', 'value': '🎵'}, type='user_post', content='my own typed words', timestamp=now - 60000, privacy='public', likeCount=0, commentCount=0))
POSTS = [TYPED, vpost('p-live', L1, 'song1', 'just cast a deciding vote! A vs B is TOO close! ⚔️'), vpost('p-done', C1, 'song1', 'rallied behind it! Now dominating at 72%! 🚀')]

def load(browser, viewer, seed, voted_locally=(), w=1280, h=900):
    ctx = browser.new_context(viewport={'width': w, 'height': h})
    ids = (f"localStorage.setItem('username',{json.dumps(viewer)});localStorage.setItem('tournamentUserId','u_{viewer}');localStorage.setItem('userId','u_{viewer}');") if viewer else ''
    init = ids + "if(!sessionStorage.getItem('fs'))sessionStorage.setItem('fs'," + json.dumps(json.dumps(seed)) + ");"
    if voted_locally:
        init += "localStorage.setItem('userVotes',JSON.stringify({" + ','.join(json.dumps(i) + ":{songId:'song1'}" for i in voted_locally) + "}));"
    ctx.add_init_script(init)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif '/api/' in u: r.fulfill(status=404, body='{}', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com') or u.startswith('https://img.youtube.com'): r.fulfill(body=PNG, content_type='image/png')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/javascript')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/profile.html?user=Owner')
    try: pg.wait_for_selector('#recentVotes .vote-card', timeout=20000)
    except Exception: pass
    pg.wait_for_timeout(700)
    return pg, errs

def tab(pg, name):
    pg.click(f'.tab-btn[data-tab="{name}"]'); pg.wait_for_timeout(400)
txt = lambda pg, sel: pg.inner_text(sel) if pg.query_selector(sel) else ''
names = lambda m: [title(m['song1']), title(m['song2'])]

with sync_playwright() as p:
    b = p.chromium.launch()

    print('--- a visitor who has not voted ---')
    pg, errs = load(b, 'visitor', BASE + POSTS)
    rv = txt(pg, '#recentVotes')
    check('Recent Votes: two locked rows (the two live matches)', pg.locator('#recentVotes .vote-card.locked').count() == 2, pg.locator('#recentVotes .vote-card.locked').count())
    check('locked rows say where, in words, and nothing about the pick', 'Voted in' in rv and 'Vote in it to see who they picked' in rv and ' · ' in rv, rv[:200])
    check('no edit names from the live matches anywhere in Recent Votes', not any(n in rv for m in (L1, L2) for n in names(m)), rv[:300])
    check('locked rows show no thumbnails', pg.locator('#recentVotes .vote-card.locked img').count() == 0)
    check('the closed match shows its pick, labelled Their pick (not Your Choice)', 'Their pick' in rv and 'Your pick' not in rv and title(C1['song1']) in rv, rv[:300])
    tab(pg, 'votes')
    av = txt(pg, '#allVotes')
    check('Votes tab: the same two locked rows and no live edit names', pg.locator('#allVotes .vote-card.locked').count() == 2 and not any(n in av for m in (L1, L2) for n in names(m)), av[:200])
    check('vote count badge still counts all three', txt(pg, '#votesCount').strip() == '3', txt(pg, '#votesCount'))
    check('"Edits you backed most" is hidden when there is no real order (one pick each)', pg.evaluate("document.getElementById('favoriteSongs').closest('.overview-section').hidden"))
    tab(pg, 'posts')
    po = txt(pg, '#allUserPosts')
    import re
    check('Posts tab: only typed posts (no auto vote entries, nothing from live matches)', 'my own typed words' in po and 'voted for' not in po and 'voted in ' not in po and not any(n in po for m in (L1, L2) for n in names(m)), po[:300])
    check('Posts count counts typed posts only', txt(pg, '#postsCount').strip() == '1', txt(pg, '#postsCount'))
    check('no JS errors', not real(errs), real(errs))
    pg.screenshot(path=f'{SHOTS}/visitor.png', full_page=True)
    pg.context.close()

    print('--- a visitor who has voted in one of the live matches ---')
    pg, errs = load(b, 'visitor', BASE + POSTS, voted_locally=[L1['matchId']])
    rv = txt(pg, '#recentVotes')
    check('that match shows the pick, labelled Their pick', title(L1['song1']) in rv and 'Their pick' in rv, rv[:300])
    check('the other live match is still locked', pg.locator('#recentVotes .vote-card.locked').count() == 1 and title(L2['song2']) not in rv, rv[:300])
    tab(pg, 'posts')
    po = txt(pg, '#allUserPosts')
    check('still no auto vote entries after voting in a match', 'voted for' not in po and 'my own typed words' in po, po[:200])
    pg.context.close()

    print('--- a visitor, and the owner only has live votes: no empty heading ---')
    only_live = [PROFILE, vote(L1, 'song1', 3000), vote(L2, 'song2', 2000)]
    pg, errs = load(b, 'visitor', only_live)
    check('the whole Most Supported section is hidden', pg.evaluate("document.getElementById('favoriteSongs').closest('.overview-section').hidden"))
    pg.context.close()

    print('--- the owner backed one edit in three closed matches ---')
    rep = [PROFILE] + [vote(m, 'song1', 1000 * (i + 1)) for i, m in enumerate([m for m in done if m['song1']['id'] == done[0]['song1']['id']][:3])]
    pg, errs = load(b, 'owner', rep)
    fav = pg.evaluate("document.getElementById('favoriteSongs').closest('.overview-section').hidden")
    check('a real order (3 picks of one edit) shows the section with its vote count', (not fav) and '3 votes' in pg.evaluate("document.getElementById('favoriteSongs').innerText"), pg.evaluate("document.getElementById('favoriteSongs').innerText")[:200])
    pg.context.close()


    print('--- visitor view: wording, champions leak, report and block ---')
    CH = [PROFILE, vote(L1, 'song1', 3000, 'vi'), vote(L2, 'song2', 2000, 'vi'), vote(C1, 'song1', 1000, 'jinx')]
    pg, errs = load(b, 'visitor', CH + [TYPED])
    check('tile reads "Votes this cup" and the Votes badge shows the same number', 'votes this cup' in txt(pg, '.profile-stats-grid').lower() and txt(pg, '#statTotalVotes').strip() == txt(pg, '#votesCount').strip(), (txt(pg, '#statTotalVotes'), txt(pg, '#votesCount')))
    tab(pg, 'champions'); pg.wait_for_timeout(600)
    ch = txt(pg, '#championsContent')
    check('visitor: the champion counts leave out live matches (Vi has only live votes, so 0)', 'Votes by champion' in ch.replace('VOTES BY CHAMPION', 'Votes by champion') and pg.evaluate("[...document.querySelectorAll('.cm-share')].map(r => r.innerText.replace(/\\s+/g, ' ')).join('|')").count('1 vote') == 1, pg.evaluate("[...document.querySelectorAll('.cm-share')].map(r => r.innerText.replace(/\\s+/g, ' ')).join('|')"))
    check('visitor: the scope label says finished matches, all cups; pill says Their champion', 'finished matches, all cups' in ch.lower() and 'your champion' not in ch.lower(), ch[:300])
    tab(pg, 'participation'); pg.wait_for_timeout(500)
    jt = pg.evaluate("document.getElementById('journeyTitle').textContent").lower() + ' ' + txt(pg, '#tab-participation').lower()
    check('Journey reads in the third person for a visitor', "owner's journey" in jt and 'your arcane journey' not in jt and "you've voted" not in jt and 'voted' in jt, jt[:300])
    check('no insights panel for a visitor', not txt(pg, '#ownerInsights').strip())
    # header menu
    btn = pg.locator('#profileMoreBtn')
    check('"…" is beside Follow with a 44px target and a named button', btn.count() == 1 and btn.get_attribute('aria-label') == 'More actions for Owner' and btn.bounding_box()['width'] >= 44 and btn.bounding_box()['height'] >= 44)
    btn.click(); pg.wait_for_timeout(200)
    check('menu opens with Block', 'Block Owner' in txt(pg, '#profileMoreMenu') and btn.get_attribute('aria-expanded') == 'true')
    pg.click('#profileBlockBtn'); pg.wait_for_timeout(300)
    check('block asks first (a dialog)', pg.locator('#modDialog').count() == 1)
    pg.click('#modDialog .mod-send'); pg.wait_for_timeout(300)
    check('blocking stores the person in the shared block list', 'u_owner' in pg.evaluate("localStorage.getItem('blockedUsers') || ''"))
    check('menu now offers Unblock', 'Unblock Owner' in pg.evaluate("document.getElementById('profileMoreMenu').innerText"))
    tab(pg, 'posts')
    rb = pg.locator('#allUserPosts .report-post-btn')
    check('each post has a report menu, named', rb.count() >= 1 and pg.locator('#allUserPosts .post-menu-btn').first.get_attribute('aria-label') == "More actions for Owner's post")
    pg.locator('#allUserPosts .post-menu-btn').first.click(); rb.first.click(); pg.wait_for_timeout(300)
    check('Report opens the report dialog', pg.locator('#modDialog').count() == 1 and 'Report this post' in pg.inner_text('#modDialog'))
    check('no JS errors', not real(errs), real(errs))
    pg.context.close()


    print('--- DOM sweep: nothing about a live pick reaches a visitor, in any tab, attribute or hidden element ---')
    import html as H
    cl = set(); [cl.update(filter(None, [C1[k].get(f) for f in ('title', 'shortTitle', 'artist', 'videoId', 'id')])) for k in ('song1', 'song2')] if False else None
    closed_vals = set(v for k in ('song1', 'song2') for v in (C1[k].get('title'), C1[k].get('shortTitle'), C1[k].get('artist'), C1[k].get('videoId'), C1[k].get('id')) if v)
    forbidden = sorted(set(v for m in (L1, L2) for k in ('song1', 'song2') for v in (m[k].get('title'), m[k].get('shortTitle'), m[k].get('artist'), m[k].get('videoId'), m[k].get('id'), m[k].get('creatorUrl'), m[k].get('channelId')) if v and v not in closed_vals and len(v) > 3))
    SW = [PROFILE, vote(L1, 'song1', 3000), vote(L2, 'song2', 2000), vote(C1, 'song1', 1000), TYPED, vpost('p-live', L1, 'song1', 'x'), vpost('p-done', C1, 'song1', 'y')]
    def sweep(pg, label):
        seen = ''
        for t in ['overview', 'votes', 'posts', 'participation', 'champions', 'achievements']:
            if pg.query_selector(f'.tab-btn[data-tab="{t}"]'):
                tab(pg, t); pg.pause = None; pg.wait_for_timeout(700)
                # the whole page, minus the site-wide "new matches" bulletin, which shows every open match's thumbnails to everyone
                seen += H.unescape(pg.evaluate("(() => { const c = document.documentElement.cloneNode(true); c.querySelectorAll('[class*=\"nv-\"], #newMatchBulletin').forEach(e => e.remove()); return c.outerHTML; })()")) + '\n'
        return seen
    pg, errs = load(b, 'visitor', SW)
    seen = sweep(pg, 'visitor')
    leaks = [f for f in forbidden if f in seen]
    check('a visitor who has not voted: no title, creator, id or link of a live pick anywhere in the page (all tabs, attributes, hidden nodes)', not leaks, leaks[:3])
    tab(pg, 'participation'); pg.wait_for_timeout(500)
    ch = txt(pg, '#cupHistory')
    check('Cup History: locked rows say "Voted in Jinx Cup 1 · Group C · Match N", sorted by match number', ch.count('Voted in Jinx Cup 1 · Group') == 2 and 'Match' in ch, ch[:300])
    nums = pg.evaluate("[...document.querySelectorAll('#cupHistory .ch-locked .ch-pick')].map(e => +e.innerText.match(/Match (\\d+)/)[1])")
    check('locked rows are in match-number order', nums == sorted(nums) and len(nums) == 2, nums)
    check('Cup History labels the closed pick "Their pick", never "Your pick"', 'their pick' in ch.lower() and 'your pick' not in ch.lower(), ch[:300])
    pg.context.close()

    pg, errs = load(b, 'visitor', SW, voted_locally=[L1['matchId']])
    pg.reload(); pg.wait_for_timeout(900)
    seen = sweep(pg, 'voted')
    l1_names = [v for k in ('song1',) for v in (L1[k].get('title'),)]
    l2_leaks = [f for f in forbidden if f in seen and any(f == m[k].get(x) for m in (L2,) for k in ('song1', 'song2') for x in ('title', 'shortTitle', 'artist', 'videoId', 'id', 'creatorUrl', 'channelId'))]
    check('a visitor who voted in L1 still sees nothing about L2', not l2_leaks, l2_leaks[:3])
    tab(pg, 'participation'); pg.wait_for_timeout(500)
    ch = txt(pg, '#cupHistory')
    check('...and sees L1 as "Their pick" with its title, L2 locked', 'their pick' in ch.lower() and ch.count('Voted in Jinx Cup 1') == 1 and title(L1['song1']) in ch, ch[:400])
    pg.context.close()

    pg, errs = load(b, 'owner', SW)
    tab(pg, 'participation'); pg.wait_for_timeout(500)
    ch = txt(pg, '#cupHistory')
    check('owner: Cup History says "Your pick" and shows every title', 'your pick' in ch.lower() and 'their pick' not in ch.lower() and title(L1['song1']) in ch and 'Voted in Jinx Cup 1' not in ch, ch[:300])
    pg.context.close()


    print('--- a visitor with no profile: Follow shows and leads to the claim flow; locked rows are compact ---')
    pg, errs = load(b, None, [PROFILE, vote(L1, 'song1', 3000), vote(L2, 'song2', 2000), vote(C1, 'song1', 1000)])
    pg.evaluate("window.__claimed = 0; window.openSettingsModal = () => { window.__claimed++; }")
    fb = pg.locator('#followBtn, #profileFollowBtn')
    check('Follow is shown to a visitor with no profile', fb.count() == 1 and 'follow' in fb.first.inner_text().lower(), fb.count())
    before = pg.evaluate("window.__claimed")
    fb.first.click(); pg.wait_for_timeout(300)
    check('clicking it opens the same claim flow as the nav avatar (settings modal) and does not follow', pg.evaluate("window.__claimed") == before + 1 and 'following' not in fb.first.inner_text().lower(), (before, pg.evaluate("window.__claimed")))
    hts = pg.evaluate("[...document.querySelectorAll('#recentVotes .vote-card.locked')].map(e => e.getBoundingClientRect().height)")
    check('locked rows are compact (under 150px each)', len(hts) == 2 and all(h < 150 for h in hts), hts)
    nums = pg.evaluate("[...document.querySelectorAll('#recentVotes .vote-card.locked .vote-locked-text')].map(e => e.innerText)")
    check('the two locked rows are told apart by match number', len(set(nums)) == 2 and all('Match' in n for n in nums), nums)
    pg.click('.tab-btn[data-tab="votes"]'); pg.wait_for_timeout(400)
    col = pg.evaluate("(() => { const b = document.querySelector('.filter-btn.active'); return getComputedStyle(b).color; })()")
    check('the selected chip uses dark text (not pink on pink)', col.startswith('rgb(26'), col)
    pg.context.close()

    print('--- own page: counts everything, no menu ---')
    pg, errs = load(b, 'owner', CH + [TYPED])
    check('no "…" menu on your own profile', pg.locator('#profileMoreBtn').count() == 0)
    tab(pg, 'champions'); pg.wait_for_timeout(600)
    shares = pg.evaluate("[...document.querySelectorAll('.cm-share')].map(r => r.innerText.replace(/\\s+/g, ' ')).join('|')")
    check('own Champions tab still counts live votes (Vi 2, Jinx 1) and says all cups', '2 votes' in shares and '1 vote' in shares and 'all cups' in txt(pg, '#championsContent').lower() and 'your champion' in txt(pg, '#championsContent').lower(), shares)
    pg.context.close()

    print('--- a visitor with only live votes: no 0% bars ---')
    pg, errs = load(b, 'visitor', [PROFILE, vote(L1, 'song1', 3000, 'vi')])
    tab(pg, 'champions'); pg.wait_for_timeout(600)
    check('Champions: the votes-by-champion block is hidden, not 0% bars', pg.locator('.cm-spread').count() == 0 and pg.locator('.cm-card').count() >= 1)
    pg.context.close()

    print('--- a visitor on a profile with no votes: compact, readable empty state ---')
    pg, errs = load(b, 'visitor', [PROFILE])
    tab(pg, 'votes'); pg.wait_for_timeout(400)
    nc = txt(pg, '#allVotes')
    check('says who has not voted where', "Owner hasn't voted in Jinx Cup 1 yet." in nc, nc)
    check('the empty block is compact (under 160px) and the filter chips are hidden', pg.evaluate("document.querySelector('#allVotes .no-content').getBoundingClientRect().height") < 160 and pg.locator('.filter-buttons').is_hidden())
    pg.context.close()

    print('--- the owner on their own page ---')
    pg, errs = load(b, 'owner', BASE + POSTS)
    rv = txt(pg, '#recentVotes')
    check('no locked rows, every pick shown, labelled Your pick', pg.locator('#recentVotes .vote-card.locked').count() == 0 and 'Your pick' in rv and 'Their pick' not in rv and title(L1['song1']) in rv and title(L2['song2']) in rv, rv[:300])
    check('owner: with one pick per edit there is no order, so the section is hidden too', pg.evaluate("document.getElementById('favoriteSongs').closest('.overview-section').hidden"))
    check('cup naming: footer reads "Jinx Cup 1 · Group A", not the site name', 'jinx cup 1 · group' in rv.lower() and 'arcane moments' not in rv.lower(), rv[:300])
    check('tabs: tablist with one selected tab', pg.locator('[role=tablist] [role=tab][aria-selected=true]').count() == 1)
    check('filter chips carry aria-pressed', pg.locator('.vote-filter-group [aria-pressed], [role=group] button[aria-pressed]').count() >= 3)
    check('banner is back at its original height (480px)', pg.evaluate("document.querySelector('.profile-banner').getBoundingClientRect().height") == 480)
    tab(pg, 'participation')
    ins = txt(pg, '#ownerInsights')
    check('Journey: Voting Style is locked until 5 closed matches (this owner has 1)', 'unlocks after 5 closed matches' in ins.lower() and '1 of 5 closed' in ins and pg.locator('.insights-grid').count() == 0, ins[:300])
    check('Cup History no longer repeats Avg participation; picks are labelled Your pick', 'Avg participation' not in txt(pg, '#cupHistory') and ('your pick' in txt(pg, '#cupHistory').lower() or 'no cup history' in txt(pg, '#cupHistory').lower()), txt(pg, '#cupHistory')[:200])
    tab(pg, 'achievements')
    check('achievements: progress bars have progressbar role + values', all(pg.locator('.ach-progress').nth(i).get_attribute('aria-valuemax') for i in range(pg.locator('.ach-progress').count())))
    pg.wait_for_timeout(900)
    if pg.locator('.achievement-card--locked').count():
        check('locked card text is at full opacity', pg.evaluate("getComputedStyle(document.querySelector('.achievement-card--locked')).opacity") == '1', pg.evaluate("getComputedStyle(document.querySelector('.achievement-card--locked')).opacity"))
    else:
        check('locked achievements render (own view)', False, txt(pg, '#allAchievements')[:120])
    tab(pg, 'champions')
    check('Champions: "Your votes by champion" heading', 'your votes by champion' in txt(pg, '#tab-champions').lower() and 'vote spread' not in txt(pg, '#tab-champions').lower(), txt(pg, '#tab-champions')[:200])
    wear = pg.locator('#tab-champions button[data-action=wear]')
    check('skin buttons are named with champion and skin', wear.count() == 0 or all(wear.nth(i).get_attribute('aria-label').startswith('Wear ') and len(wear.nth(i).get_attribute('aria-label')) > 8 for i in range(wear.count())))
    tab(pg, 'posts')
    po = txt(pg, '#allUserPosts')
    check("the owner's Posts tab has the typed post and no auto vote entries", 'my own typed words' in po and 'voted for' not in po and 'TOO close' not in po, po[:300])
    check('no JS errors', not real(errs), real(errs))
    pg.screenshot(path=f'{SHOTS}/owner.png', full_page=True)
    pg.context.close()
    b.close()

httpd.shutdown()
print('FAILED: ' + ', '.join(failed) if failed else 'all profile visitor checks passed')
sys.exit(1 if failed else 0)
