# Phone layout of the profile (393px and 360px), own page and visitor, on the REAL page with the in-memory Firestore.
#   python3 tools/test-profile-mobile-browser.py        (screenshots go to /tmp/profile-shots)
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


import html as H
done6 = [m for m in done][:6]
CLOSED = [vote(m, 'song1', 1000 * (i + 1), 'jinx') for i, m in enumerate(done6)]
LIVE = [vote(L1, 'song1', 9000, 'jinx'), vote(L2, 'song2', 8000, 'vi')]
OWN = [PROFILE] + CLOSED + LIVE
FEW = [PROFILE] + CLOSED[:3] + LIVE

def noscroll(pg): return pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")

with sync_playwright() as p:
    b = p.chromium.launch()
    print('--- own page at 1280px: Voting Style grid, labels, note ---')
    pg, errs = load(b, 'owner', OWN + [TYPED], w=1280, h=900)
    tab(pg, 'participation'); pg.wait_for_timeout(800)
    ins = txt(pg, '#ownerInsights')
    cols = pg.evaluate("getComputedStyle(document.querySelector('.insights-grid')).gridTemplateColumns.split(' ').length")
    check('desktop: four columns, "Group stage" as the furthest-round unit, Provisional note naming Influential votes', cols == 4 and 'Group stage' in ins and 'Provisional' in ins and 'Influential' in ins.split('Provisional')[1].split('FURTHEST')[0] if 'Provisional' in ins else False, (cols, ins[:500]))
    check('desktop: the vote rows show the full card, no toggle', pg.locator('.vote-row-toggle').first.is_hidden() if pg.locator('.vote-row-toggle').count() else True)
    pg.context.close()

    for W in (393, 360):
        print(f'--- own page at {W}px ---')
        pg, errs = load(b, 'owner', OWN + [TYPED], w=W, h=844)
        tabs = pg.evaluate("[...document.querySelectorAll('.tabs-nav .tab-btn')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; })")
        check(f'{W}: six tabs in one row (same top), each at least 44px tall', len(tabs) == 6 and len(set(t[0] for t in tabs)) == 1 and all(t[1] >= 44 for t in tabs), tabs)
        check(f'{W}: no Top Moments tab', pg.locator('.tab-btn[data-tab="songs"]').count() == 0)
        check(f'{W}: tab strip scrolls sideways, page does not', pg.evaluate("(() => { const n = document.querySelector('.tabs-nav'); return n.scrollWidth > n.clientWidth; })()") and noscroll(pg))
        check(f'{W}: tab roles and one selected tab', pg.locator('[role=tablist] [role=tab][aria-selected=true]').count() == 1)
        check(f'{W}: the Posts badge is hidden at 0, shown with posts', pg.locator('#postsCount').is_visible())   # one typed post seeded
        pg.click('.tab-btn[data-tab="votes"]'); pg.wait_for_timeout(500)
        rows = pg.locator('#allVotes .vote-row')
        check(f'{W}: one compact row per vote (under 90px), card collapsed', rows.count() >= 8 and rows.first.bounding_box()['height'] < 90 and rows.first.locator('.vote-row-detail').is_hidden(), rows.first.bounding_box())
        tg = rows.first.locator('.vote-row-toggle')
        check(f'{W}: row toggle is 44px+ with aria-expanded=false', tg.bounding_box()['height'] >= 44 and tg.get_attribute('aria-expanded') == 'false')
        y = pg.evaluate("window.scrollY")
        tg.click(); pg.wait_for_timeout(200)
        check(f'{W}: tapping opens the full card (Your pick), aria-expanded=true', tg.get_attribute('aria-expanded') == 'true' and rows.first.locator('.vote-row-detail').is_visible() and 'your pick' in rows.first.locator('.vote-row-detail').inner_text().lower())
        lay = pg.evaluate("(() => { const d = document.querySelector('#allVotes .vote-row-detail:not([hidden])'); if (!d) return null; const s = [...d.querySelectorAll('.vote-song')].map(e => e.getBoundingClientRect()); const th = [...d.querySelectorAll('.vote-song-thumbnail')].map(e => e.getBoundingClientRect().width); return { header: getComputedStyle(d.querySelector('.vote-header')).display, tops: s.map(r => Math.round(r.top)), lefts: s.map(r => Math.round(r.left)), th, h: Math.round(d.getBoundingClientRect().height), over: d.scrollWidth > d.clientWidth + 1, titles: [...d.querySelectorAll('.vote-song-title')].map(e => [getComputedStyle(e).whiteSpace, e.scrollWidth <= e.clientWidth + 1, e.getBoundingClientRect().left >= d.getBoundingClientRect().left - 1]) }; })()")
        check(f'{W}: expanded row drops the card header, shows the two edits side by side with small thumbnails, no overflow', lay and lay['header'] == 'none' and len(set(lay['tops'])) == 1 and lay['lefts'][0] != lay['lefts'][1] and all(w <= 80 for w in lay['th']) and not lay['over'] and lay['h'] < 320 and all(w == 'normal' and fit and inside for w, fit, inside in lay['titles']), lay)
        pg.screenshot(path=f'{SHOTS}/m{W}-expanded.png')
        tg.click(); pg.wait_for_timeout(200)
        check(f'{W}: and closes again', tg.get_attribute('aria-expanded') == 'false' and rows.first.locator('.vote-row-detail').is_hidden())
        chips = pg.evaluate("[...document.querySelectorAll('.filter-btn')].filter(b => b.offsetParent !== null).map(b => Math.round(b.getBoundingClientRect().height))")
        check(f'{W}: filter chips are 44px+', chips and all(h >= 44 for h in chips), chips)
        check(f'{W}: no horizontal page scroll on Votes', noscroll(pg))
        pg.screenshot(path=f'{SHOTS}/m{W}-votes.png')
        pg.click('.tab-btn[data-tab="participation"]'); pg.wait_for_timeout(900)
        check(f'{W}: Journey is the cup row (its own bar and "N of M voted"); the separate card is gone', pg.locator('.participation-overview').is_hidden() and pg.locator('.rounds-breakdown').is_hidden() and pg.locator('#cupHistory .ch-cup .ch-bar[role=progressbar]').count() >= 1 and 'voted' in txt(pg, '#cupHistory') and 'cup entered' not in txt(pg, '#cupHistory').lower(), txt(pg, '#cupHistory')[:200])
        check(f'{W}: Voting Style tiles show (6 closed votes) with the note above them', pg.locator('.insights-grid').count() == 1 and pg.evaluate("(() => { const n = document.querySelector('.insights-note'), g = document.querySelector('.insights-grid'); return !!n && !!(n.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING); })()"))
        gb = pg.locator('#shareStatsBtn').bounding_box()
        check(f'{W}: Generate Stats Image is 44px+', gb['height'] >= 44, gb)
        check(f'{W}: "Group stage" tile text is small (under 1.3rem)', pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.insight-value.is-text')).fontSize)") < 21)
        check(f'{W}: Cup History meta no longer repeats the participation %', '% of matches' not in txt(pg, '#cupHistory'), txt(pg, '#cupHistory')[:200])
        pg.screenshot(path=f'{SHOTS}/m{W}-journey.png', full_page=True)
        ca = pg.evaluate("(() => { const a = document.querySelector('.cta-actions'); if (!a) return null; return { cols: getComputedStyle(a).gridTemplateColumns.split(' ').length, hs: [...a.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().height)), txt: [...a.querySelectorAll('button')].map(b => b.innerText.trim()), over: a.scrollWidth > a.clientWidth + 1 }; })()")
        check(f'{W}: share buttons are a 2-column grid (Post, Reddit, Copy link), 44px+, short labels, no clipping', ca and ca['cols'] == 2 and all(h >= 44 for h in ca['hs']) and [t.lower() for t in ca['txt']] == ['post', 'reddit', 'copy link'] and not ca['over'], ca)
        pg.click('.tab-btn[data-tab="champions"]'); pg.wait_for_timeout(700)
        rowsn = pg.locator('.cm-share').count()
        check(f'{W}: Champions hides zero rows (only Jinx and Vi have votes)', rowsn == 2, rowsn)
        check(f'{W}: "All cups" is a subtitle, not wrapped beside the title', pg.locator('p.cm-scope').count() == 1)
        wear = pg.evaluate("[...document.querySelectorAll('.cm-act')].map(b => Math.round(b.getBoundingClientRect().height))")
        check(f'{W}: Wear pills are 44px+', all(h >= 44 for h in wear), wear)
        check(f'{W}: no horizontal page scroll on Champions', noscroll(pg))
        pg.click('.tab-btn[data-tab="posts"]'); pg.wait_for_timeout(400)
        pg.context.close()

        print(f'--- own page at {W}px: Wear opens settings with Save in reach ---')
        pg, errs = load(b, 'owner', OWN + [TYPED], w=W, h=852)
        tab(pg, 'champions'); pg.wait_for_timeout(1500)
        pg.locator('.cm-act').first.click(); pg.wait_for_timeout(2500)
        sv = pg.evaluate("(() => { const q = s => document.querySelector(s); const b = q('.btn-save'), c = q('.btn-cancel'); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const body = q('.settings-modal-body').getBoundingClientRect(), act = q('.form-actions').getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= innerHeight, h: Math.round(r.height), hit: !!hit && (hit === b || b.contains(hit)), sameRow: Math.abs(b.getBoundingClientRect().top - c.getBoundingClientRect().top) < 4, flush: Math.abs(act.bottom - body.bottom) <= 1 }; })()")
        check(f'{W}: after Wear, Save is on screen, 44px+, tappable (nothing over it), beside Cancel, bar flush with the window bottom', sv['inView'] and sv['h'] >= 44 and sv['hit'] and sv['sameRow'] and sv['flush'], sv)
        pg.context.close()

        print(f'--- own page at {W}px, only 3 closed votes ---')
        pg, errs = load(b, 'owner', FEW, w=W, h=844)
        tab(pg, 'participation'); pg.wait_for_timeout(700)
        check(f'{W}: Voting Style says what unlocks it, with a progress line, and shows no tiles or New Voter card', 'unlocks after 5 closed matches' in txt(pg, '#ownerInsights').lower() and '3 of 5 closed' in txt(pg, '#ownerInsights') and pg.locator('.insights-grid').count() == 0 and pg.locator('.insights-taste').count() == 0, txt(pg, '#ownerInsights')[:200])
        tab(pg, 'posts'); pg.wait_for_timeout(300)
        check(f'{W}: empty Posts has an owner line and a Go vote link', 'Post about a match after you vote' in txt(pg, '#allUserPosts') and pg.locator('#allUserPosts a.btn-go-vote').count() == 1 and pg.locator('#postsCount').is_hidden())
        pg.screenshot(path=f'{SHOTS}/m{W}-few.png')
        pg.context.close()

        print(f'--- own page at {W}px, only live votes (nothing closed yet) ---')
        pg, errs = load(b, 'owner', [PROFILE] + LIVE, w=W, h=844)
        tab(pg, 'votes'); pg.wait_for_timeout(500)
        check(f'{W}: Votes chips are hidden when every vote is live (nothing to filter)', pg.locator('.filter-buttons').is_hidden(), pg.locator('.filter-buttons').count())
        tab(pg, 'participation'); pg.wait_for_timeout(700)
        ti = txt(pg, '#ownerInsights')
        check(f'{W}: Voting Style shows "0 of 5 closed · 2 votes waiting" and one message only', '0 of 5 closed · 2 votes waiting' in ti and 'new voter' not in ti.lower() and '(you have' not in ti, ti[:250])
        gen = pg.locator('#shareStatsBtn')
        hint_id = gen.get_attribute('aria-describedby')
        check(f'{W}: Generate Stats Image is aria-disabled with its hint linked, and still 44px+', gen.get_attribute('aria-disabled') == 'true' and hint_id and 'first match closes' in pg.evaluate("(id) => document.getElementById(id)?.textContent || ''", hint_id) and gen.bounding_box()['height'] >= 44)
        check(f'{W}: the stats image data counts closed matches only (no closed votes, so it is not offered)', pg.evaluate("document.getElementById('shareStatsBtn').getAttribute('aria-disabled')") == 'true')
        pg.context.close()

        print(f'--- visitor at {W}px: locked rows stay locked, nothing leaks ---')
        closed_vals = set(v for k in ('song1', 'song2') for m in done6 for v in (m[k].get('title'), m[k].get('shortTitle'), m[k].get('artist'), m[k].get('videoId'), m[k].get('id')) if v)
        forbidden = sorted(set(v for m in (L1, L2) for k in ('song1', 'song2') for v in (m[k].get('title'), m[k].get('shortTitle'), m[k].get('artist'), m[k].get('videoId'), m[k].get('id'), m[k].get('creatorUrl'), m[k].get('channelId')) if v and v not in closed_vals and len(v) > 3))
        pg, errs = load(b, 'visitor', OWN, w=W, h=844)
        seen = ''
        for t in ['overview', 'votes', 'posts', 'participation', 'champions', 'achievements']:
            tab(pg, t); pg.wait_for_timeout(600)
            seen += H.unescape(pg.evaluate("(() => { const c = document.documentElement.cloneNode(true); c.querySelectorAll('[class*=\"nv-\"]').forEach(e => e.remove()); return c.outerHTML; })()")) + '\n'
        leaks = [f for f in forbidden if f in seen]
        check(f'{W}: no title, creator, id or link of a live pick anywhere (all tabs, attributes, hidden nodes, compact rows included)', not leaks, leaks[:3])
        tab(pg, 'votes'); pg.wait_for_timeout(300)
        check(f'{W}: locked rows have no toggle and no detail panel', pg.locator('#allVotes .vote-card.locked').count() == 2 and pg.locator('#allVotes .vote-card.locked .vote-row-toggle, #allVotes .vote-card.locked .vote-row-detail').count() == 0)
        pg.evaluate("document.querySelectorAll('.vote-row-toggle').forEach(t => t.click())"); pg.wait_for_timeout(300)
        seen2 = H.unescape(pg.evaluate("(() => { const c = document.documentElement.cloneNode(true); c.querySelectorAll('[class*=\"nv-\"]').forEach(e => e.remove()); return c.outerHTML; })()"))
        leaks2 = [f for f in forbidden if f in seen2]
        check(f'{W}: with every row expanded, still no live pick anywhere (locked rows have nothing to expand)', not leaks2 and pg.locator('#allVotes .vote-card.locked').count() == 2, leaks2[:3])
        check(f'{W}: no horizontal page scroll (visitor)', noscroll(pg))
        pg.context.close()
    b.close()

httpd.shutdown()
print('FAILED: ' + ', '.join(failed) if failed else 'all profile mobile checks passed')
sys.exit(1 if failed else 0)
