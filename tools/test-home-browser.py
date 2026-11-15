# Optional browser test of the REAL homepage (index.html + js/home.js) with mocked Firebase and a mocked /api/matches.
# Needs Python + playwright with chromium:   pip install playwright && playwright install chromium
#   python3 tools/test-home-browser.py            (screenshots go to /tmp/home-shots)
# Fixtures come from tools/test-support/bracket-fixtures.mjs (the real builders and the real data/edits.json).
import os, sys, json, subprocess, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/home-shots'
os.makedirs(SHOTS, exist_ok=True)
subprocess.run(['node', os.path.join(ROOT, 'tools/test-support/bracket-fixtures.mjs'), FIX], check=True, capture_output=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

FS = open(os.path.join(ROOT, 'tools/test-support/browser-firestore.js')).read()
APP = "export const initializeApp=()=>({});"
AUTH = "export const getAuth=()=>({currentUser:null});export const signInAnonymously=async()=>({});export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb(null),0);return()=>{}};export const signOut=async()=>({});"
failed = []
EDITS = json.dumps([dict(e, tournaments=['jinx-cup-1']) for e in json.load(open(os.path.join(ROOT, 'data/edits.json')))[:30]])
import base64
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'   got: {got}'))
    if not ok: failed.append(name)

def load(browser, scenario, width=1280, height=900, mutate=None, scale=1, init=None, path='/'):
    matches = [] if scenario == 'none' else json.load(open(f'{FIX}/{scenario}.json'))
    if mutate: matches = mutate(matches)
    ctx = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=scale)
    if init: ctx.add_init_script(init)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif u.split('?')[0].endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif u.split('?')[0].endswith('/data/edits.json'): r.fulfill(body=EDITS, content_type='application/json')
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com'): r.fulfill(body=PNG, content_type='image/png')
        elif u.startswith('https://img.youtube.com'): r.fulfill(body='', content_type='image/jpeg')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}{path}')
    if path == '/': pg.wait_for_function("document.querySelectorAll('.home-pill').length && document.getElementById('homePill').textContent !== 'Loading…'", timeout=15000)
    pg.wait_for_timeout(300)
    return pg, errs

vis = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector({json.dumps(sel)});return !!e&&getComputedStyle(e).display!=='none'&&e.offsetParent!==null}})()")
txt = lambda pg, sel: pg.inner_text(sel).strip()



noscroll = lambda pg: pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
shown = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector({json.dumps(sel)});return !!e&&!e.hidden}})()")
OLD = ('Anthem Arena', 'League of Legends Music', 'Music Video', 'Coming soon')

with sync_playwright() as p:
    b = p.chromium.launch()
    for label, w, h in (('desktop', 1280, 900), ('phone', 375, 740)):
        print(f'--- {label}: live cup ---')
        pg, errs = load(b, 'groups-mid-16', w, h)
        check('one status line: cup and group (the heading says how many need a vote)', ' is live' in txt(pg, '#homePill') and 'need your vote' not in txt(pg, '#homePill'), txt(pg, '#homePill'))
        check('Watch & Vote jumps to the open matches below', pg.locator('#homeActions a').first.get_attribute('href') == '#vote')
        check('stats strip shows', shown(pg, '#homeStats') and pg.locator('#homeStats div').count() == 3)
        check('open matches sit right under the hero, as cards that open the vote page', vis(pg, '#vote') and pg.locator('#vote .social-match-card').count() >= 1 and pg.evaluate("document.querySelector('#vote').getBoundingClientRect().top < document.querySelector('#recent').getBoundingClientRect().top"), pg.locator('#vote .social-match-card').count())
        check('no activity ticker or mini feed on the homepage', not pg.locator('.activity-ticker, .mini-activity-feed').count())
        check('live cards show no vote results (spoiler free)', not pg.locator('#vote .social-match-card:not(.voted) .progress-bar-fill, #vote .social-match-card:not(.voted) [class*=pct]').count())
        check('latest results show', shown(pg, '#recent') and pg.locator('#recent li').count() >= 1)
        check('most voted edits shown once votes exist', 'Most voted' in txt(pg, '#popular') and pg.locator('#popular .edit-card').count() >= 1, txt(pg, '#popular')[:60])
        check('new edits shows 6', pg.locator('#newest .edit-card').count() == 6, pg.locator('#newest .edit-card').count())
        check('results name the creators', pg.locator('#recent .result-text small').count() >= 2 and pg.locator('#recent .result-text small').first.inner_text().strip() != '')
        check('edit cards open that edit in the gallery', pg.locator('#newest a.edit-card').first.get_attribute('href').startswith('/music-gallery?watch='))
        check('hero buttons are on the first screen', pg.evaluate("document.querySelector('#homeActions a').getBoundingClientRect().bottom < window.innerHeight"))
        if w < 500:
            tops = pg.eval_on_selector_all('#homeStats div', 'els=>els.map(e=>Math.round(e.getBoundingClientRect().top))')
            check('stats sit in one row on a phone', len(set(tops)) == 1, tops)
        check('no hashtags in any name', '#' not in pg.inner_text('main'))
        check('no old wording', not any(k in pg.inner_text('main') for k in OLD), pg.inner_text('main')[:150])
        check('title is Arcane Moments', 'Arcane Moments' in pg.title(), pg.title())
        check('no sideways scroll', noscroll(pg))
        check('no JS errors', not [e for e in errs if 'docChanges' not in e], errs)
        pg.screenshot(path=f'{SHOTS}/{label}-live.png', full_page=True)
        pg.context.close()


    print('--- homepage batch: audience, blind cards, status line, Your Votes ---')
    live = [m for m in json.load(open(f'{FIX}/groups-mid-16.json')) if m['status'] == 'live']
    LIVE_N = len(live)
    first_live = live[0]
    voted_init = "localStorage.setItem('userVotes', JSON.stringify({" + json.dumps(first_live['matchId']) + ": {songId: 'song1', timestamp: Date.now()}}))"
    for label, w, h in (('desktop', 1280, 900), ('phone', 375, 740), ('small phone', 360, 740)):
        pg, errs = load(b, 'groups-mid-16', w, h)
        check(f'{label}: zero votes: full hero (visible title, no second logo tile)', vis(pg, '.home-title') and pg.evaluate("document.querySelector('h1').getBoundingClientRect().width") > 100 and pg.locator('.home-logo').count() == 0 and not pg.evaluate("document.querySelector('.home-hero').classList.contains('is-compact')"))
        check(f'{label}: zero votes: "How it works" sits right under the hero', pg.evaluate("document.getElementById('how').previousElementSibling.classList.contains('home-hero')") and pg.locator('.how-list li').count() == 4)
        check(f'{label}: the heading counts every live match', txt(pg, '.unvoted-header').startswith(str(LIVE_N)) and 'Need Your Vote' in txt(pg, '.unvoted-header'), txt(pg, '.unvoted-header'))
        check(f'{label}: no ticking banner, pill is not a live region', pg.locator('.countdown-banner').count() == 0 and pg.get_attribute('#homePill', 'aria-live') is None)
        check(f'{label}: one VS per card', pg.locator('#vote .social-match-card').first.locator('.social-vs, .vs-divider').count() == 1)
        check(f'{label}: unvoted cards show no creator or year', pg.locator('#vote .social-match-card .song-details p').count() == 0 and not any(c in pg.inner_text('#vote') for c in ('•',)))
        check(f'{label}: stat tile has a unit', 'matches live' in txt(pg, '#homeStats'), txt(pg, '#homeStats'))
        check(f'{label}: no progress bar at zero votes, heading count still works', pg.evaluate("document.querySelector('.progress-container').hidden") and txt(pg, '.unvoted-header').startswith(str(LIVE_N)), txt(pg, '.unvoted-header'))
        check(f'{label}: step 2 says votes are final and results come after voting', 'Votes are final' in txt(pg, '.how-list') and 'once you' in txt(pg, '.how-list'))
        claim = pg.locator('.profile-claim-state')
        check(f'{label}: first visit: small outlined profile button, no glowing card', claim.count() == 1 and 'is-small' in claim.get_attribute('class') and pg.locator('.claim-title').count() == 0 and pg.get_attribute('.claim-avatar', 'aria-label') == 'Set your username and avatar')
        bb = pg.evaluate("(()=>{const b=document.querySelector('.claim-avatar').getBoundingClientRect(),c=getComputedStyle(document.querySelector('.claim-avatar'));return [b.width,b.height,c.borderTopWidth,c.borderTopColor]})()")
        check(f'{label}: the small button is a visible circle with a pink outline', abs(bb[0]-bb[1]) < 1 and 36 <= bb[0] <= 48 and bb[2] == '2px' and bb[3] != 'rgba(0, 0, 0, 0)', bb)
        check(f'{label}: the bell stays, with a name and keyboard access', pg.get_attribute('#notificationBell', 'aria-label') == 'Notifications' and pg.get_attribute('#notificationBell', 'tabindex') == '0')
        # titles sit under their own thumbnail: left entry on the left, title below its picture and inside its column
        geo = pg.evaluate("""(()=>[...document.querySelectorAll('#socialGrid .social-match-card')].map(c=>{const s=[...c.querySelectorAll('.social-side')].map(e=>{const i=e.querySelector('img').getBoundingClientRect(),t=e.querySelector('h3'),r=t.getBoundingClientRect(),q=e.getBoundingClientRect();return {l:q.left,below:r.top>=i.bottom-1,inside:r.left>=q.left-1&&r.right<=q.right+1,cut:t.scrollHeight>t.clientHeight+1}});return s}))()""")
        check(f'{label}: each title is under its own thumbnail, first entry on the left', all(len(c) == 2 and c[0]['l'] < c[1]['l'] and all(x['below'] and x['inside'] for x in c) for c in geo), geo[:1])
        cut = sum(x['cut'] for c in geo for x in c); tot = sum(len(c) for c in geo)
        check(f'{label}: no title is cut short ({tot} checked)', cut == 0, cut)
        check(f'{label}: no sideways scroll on the cards', noscroll(pg))
        pg.context.close()

        pg, errs = load(b, 'groups-mid-16', w, h, init=voted_init)
        check(f'{label}: a voter gets the compact hero (title only visually hidden, still the one h1)', pg.locator('h1').count() == 1 and pg.evaluate("document.querySelector('h1').getBoundingClientRect().width") <= 2 and 'Arcane Moments' in pg.evaluate("document.querySelector('h1').textContent") and vis(pg, '#homeStats') and vis(pg, '#homeActions'))
        check(f'{label}: "How it works" moves to the bottom for a voter', pg.evaluate("document.querySelector('.home-page').lastElementChild.id === 'how'") and not pg.evaluate("document.getElementById('how').classList.contains('is-strip')"))
        check(f'{label}: the heading counts one fewer after a vote', txt(pg, '.unvoted-header').startswith(str(LIVE_N - 1)), txt(pg, '.unvoted-header'))
        check(f'{label}: the queue starts on the first screen (desktop)', w < 500 or pg.evaluate("document.querySelector('#unvotedSection .social-match-card').getBoundingClientRect().top < window.innerHeight"))
        vc = pg.locator('#votedGrid .social-match-card').first
        check(f'{label}: after the vote the card shows creator and year, and "Your pick" as text', vc.locator('.song-details p').count() == 2 and 'Your pick' in vc.inner_text() and vc.locator('.your-pick').count() == 1, vc.inner_text())
        check(f'{label}: no "founding member" badge on voted cards', pg.evaluate("getComputedStyle(document.querySelector('#votedGrid .social-match-card'), '::before').content") in ('none', 'normal'), pg.evaluate("getComputedStyle(document.querySelector('#votedGrid .social-match-card'), '::before').content"))
        check(f'{label}: unvoted cards still show no creator', pg.locator('#unvotedSection .social-match-card .song-details p').count() == 0)
        check(f'{label}: progress bar sits right under the heading once there is a vote', pg.evaluate("(()=>{const h=document.querySelector('.unvoted-header'),p=document.querySelector('.progress-container');return !p.hidden&&p.previousElementSibling===h&&p.getBoundingClientRect().top-h.getBoundingClientRect().bottom<40})()"))
        check(f'{label}: after one vote the full profile card appears', pg.locator('.claim-title').count() == 1 and pg.locator('.claim-avatar').count() == 0)
        pg.screenshot(path=f'{SHOTS}/{label}-voter.png', full_page=True)
        if w > 500:
            tg = pg.locator('#votedToggle')
            check(f'{label}: Your Votes is a button that starts expanded', tg.evaluate("e=>e.tagName") == 'BUTTON' and tg.get_attribute('aria-expanded') == 'true' and tg.get_attribute('aria-controls') == 'votedGrid')
            pg.focus('#votedToggle'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
            check(f'{label}: Enter closes it and says so', tg.get_attribute('aria-expanded') == 'false' and not vis(pg, '#votedGrid'))
            pg.keyboard.press('Space'); pg.wait_for_timeout(100)
            check(f'{label}: Space opens it again', tg.get_attribute('aria-expanded') == 'true' and vis(pg, '#votedGrid'))
            check(f'{label}: the button has a readable name', 'Your Votes' in pg.evaluate("document.getElementById('votedHeading').innerText"))
            pg.locator('#unvotedSection .social-match-card').first.focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
            check(f'{label}: a card opens from the keyboard', '/vote' in pg.url, pg.url)
        check(f'{label}: no JS errors', not [e for e in errs if 'docChanges' not in e], errs)
        pg.context.close()


    print('--- phone voter: the queue first, header taps, pill, dates ---')
    votes3 = "localStorage.setItem('userVotes', JSON.stringify({" + ','.join(json.dumps(m['matchId']) + ": {songId: 'song1'}" for m in live[:3]) + "}))"
    named = "localStorage.setItem('username','Tester');localStorage.setItem('tournamentUsername','Tester');localStorage.setItem('avatar',JSON.stringify({type:'emoji',value:'\U0001F9D9'}));"
    for w in (393, 360):
        pg, errs = load(b, 'groups-mid-16', w, 760, init=votes3 + ';' + named)
        L = f'phone {w} voter'
        check(f'{L}: tagline and the second button are gone, the primary button stays', not vis(pg, '.home-lead') and not vis(pg, '.home-actions .btn-ghost') and vis(pg, '.home-actions .btn-primary'))
        tops = pg.eval_on_selector_all('#homeStats div', 'els=>els.map(e=>Math.round(e.getBoundingClientRect().top))')
        check(f'{L}: the numbers are one line', len(set(tops)) == 1 and pg.locator('#homeStats div').count() >= 2, tops)
        check(f'{L}: the heading and the top of the first card are on the first screen', pg.evaluate("(()=>{const h=document.querySelector('.unvoted-header').getBoundingClientRect(),c=document.querySelector('#unvotedSection .social-match-card').getBoundingClientRect();return h.bottom<innerHeight&&c.top<innerHeight-60})()"), pg.evaluate("[document.querySelector('.unvoted-header').getBoundingClientRect().bottom,document.querySelector('#unvotedSection .social-match-card').getBoundingClientRect().top,innerHeight]"))
        parts = pg.eval_on_selector_all('#homePill .pill-part', 'els=>els.map(e=>[e.getBoundingClientRect().top,e.getBoundingClientRect().height])')
        check(f'{L}: the status pill breaks between its parts, not inside one', all(h < 30 for t, h in parts), parts)
        taps = pg.evaluate("""(()=>['.mobile-menu-toggle','.notification-bell','.nav-avatar-btn'].map(s=>{const r=document.querySelector(s)?.getBoundingClientRect();return [s,r?Math.round(r.width):0,r?Math.round(r.height):0]}))()""")
        check(f'{L}: header tap areas are at least 44px', all(wd >= 44 and ht >= 44 for s_, wd, ht in taps), taps)
        check(f'{L}: bell, account and menu buttons have names', pg.get_attribute('#notificationBell', 'aria-label') == 'Notifications' and bool(pg.get_attribute('#navAvatarBtn', 'aria-label')) and pg.get_attribute('.mobile-menu-toggle', 'aria-label') == 'Menu')
        check(f'{L}: the menu button says whether it is open', pg.get_attribute('.mobile-menu-toggle', 'aria-expanded') == 'false')
        pg.click('.mobile-menu-toggle'); pg.wait_for_timeout(150)
        check(f'{L}: ...and flips when opened', pg.get_attribute('.mobile-menu-toggle', 'aria-expanded') == 'true')
        pg.click('.mobile-menu-toggle'); pg.wait_for_timeout(150)
        check(f'{L}: ...and back when closed', pg.get_attribute('.mobile-menu-toggle', 'aria-expanded') == 'false')
        check(f'{L}: with 3 votes, "Your Votes" starts collapsed on a phone and says so', pg.get_attribute('#votedToggle', 'aria-expanded') == 'false' and not vis(pg, '#votedGrid'))
        pg.click('#votedToggle'); pg.wait_for_timeout(100)
        check(f'{L}: it opens when asked', pg.get_attribute('#votedToggle', 'aria-expanded') == 'true' and vis(pg, '#votedGrid'))
        meta = pg.eval_on_selector_all('#newest .edit-meta', 'els=>els.map(e=>[e.textContent.trim(),Math.round(e.getBoundingClientRect().height)])')
        check(f'{L}: dates are one line and just the month and year', meta and all(h < 24 and 'Uploaded' not in t_ and len(t_) <= 9 for t_, h in meta), meta)
        check(f'{L}: gallery link has an arrow', '\u2192' in txt(pg, '#newest .more'), txt(pg, '#newest .more'))
        check(f'{L}: no sideways scroll', noscroll(pg))
        check(f'{L}: no JS errors', not [e for e in errs if 'docChanges' not in e], errs)
        pg.screenshot(path=f'{SHOTS}/phone{w}-voter-top.png')
        pg.context.close()
        pg, errs = load(b, 'groups-mid-16', w, 760, init=votes3)
        check(f'{L}: the full Claim Your Profile card (after a vote, no username yet) fits the header on one short line', noscroll(pg) and pg.evaluate("document.querySelector('.profile-claim-state').getBoundingClientRect().height") < 60 and pg.evaluate("document.querySelector('.mobile-menu-toggle').getBoundingClientRect().right <= innerWidth"))
        pg.context.close()
        pg, errs = load(b, 'groups-mid-16', w, 760)
        pg.screenshot(path=f'{SHOTS}/phone{w}-firstvisit.png', full_page=False)
        check(f'phone {w} first visit: no sideways scroll, header buttons 44px', noscroll(pg) and pg.evaluate("(()=>{const r=document.querySelector('.claim-avatar').getBoundingClientRect(),m=document.querySelector('.mobile-menu-toggle').getBoundingClientRect();return r.width>=44&&r.height>=44&&m.width>=44&&m.height>=44})()"))
        pg.context.close()

    print('--- showcase rows hide live-match edits ---')
    def all_open(ms):   # no finished matches, so the "Most watched" row (not "Most voted") is the one shown
        return [dict(m, status='upcoming', winnerId=None) if m['status'] == 'completed' else m for m in ms]
    pg, errs = load(b, 'groups-mid-16', mutate=all_open)
    liveids = set()
    for m in live: liveids |= {m['song1']['id'], m['song2']['id'], m['song1'].get('videoId'), m['song2'].get('videoId')}
    hrefs = pg.eval_on_selector_all('#popular a.edit-card', 'els=>els.map(e=>decodeURIComponent(e.getAttribute("href").split("watch=")[1]))')
    check('most watched has no edit from a live match', 'Most watched' in txt(pg, '#popular') and hrefs and not (set(hrefs) & liveids), hrefs)
    check('view counts are compact', not pg.evaluate("/\\d,\\d{3}/.test(document.getElementById('popular').innerText)") and 'YouTube' not in txt(pg, '#popular'), txt(pg, '#popular')[:200])
    cards = pg.eval_on_selector_all('#newest a.edit-card', 'els=>els.map(e=>[decodeURIComponent(e.getAttribute("href").split("watch=")[1]), e.querySelectorAll("i").length])')
    check('newest cards of live-match edits show no creator, the others do', all((n == 0) == (i in liveids) for i, n in cards), cards)
    check('eyebrow says Newest uploads', 'newest uploads' in txt(pg, '#newest').lower(), txt(pg, '#newest')[:60])
    pg.context.close()

    print('--- few votes: two tiles, centred ---')
    def no_votes(ms):
        for m in ms:
            for k in ('song1', 'song2'): m[k] = dict(m[k], votes=0)
            m['totalVotes'] = 0
        return ms
    pg, errs = load(b, 'groups-mid-16', mutate=no_votes)
    tiles = pg.eval_on_selector_all('#homeStats div', 'els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.left,r.right]})')
    vw = pg.evaluate('innerWidth')
    check('under the vote threshold the tile is gone: two tiles, no placeholder', len(tiles) == 2 and 'votes cast' not in txt(pg, '#homeStats'), txt(pg, '#homeStats'))
    check('the two tiles are centred on the page', len(tiles) == 2 and abs((tiles[0][0] + tiles[1][1]) / 2 - vw / 2) < 3, tiles)
    pg.context.close()

    print('--- the share band is profile-only ---')
    pg, errs = load(b, 'groups-mid-16')
    check('home has no share band (it moved to the profile page)', pg.locator('#profileShareBand').count() == 0 and pg.locator('.footer-cta-banner').count() == 0)
    pg.context.close()

    print('--- gallery opens a linked edit ---')
    first = json.loads(EDITS)[0]['id']
    pg, errs = load(b, 'groups-mid-16', path=f'/music-gallery.html?watch={first}')
    pg.wait_for_timeout(800)
    check('player dialog is open for the linked edit', pg.evaluate("document.getElementById('watchDialog').open"))
    check('it plays the right video', first in pg.evaluate("document.getElementById('watchFrame').src"), pg.evaluate("document.getElementById('watchFrame').src"))
    pg.context.close()

    print('--- no matches built yet ---')
    pg, errs = load(b, 'none')
    check('says opening soon', 'Opening soon' in txt(pg, '#homePill'), txt(pg, '#homePill'))
    check('no stats strip, no match blocks, no empty open-matches block', not shown(pg, '#homeStats') and not shown(pg, '#recent') and not vis(pg, '#vote'))
    check('popular falls back to YouTube views', 'Most watched' in txt(pg, '#popular') and ' views' in txt(pg, '#popular') and 'YouTube' not in txt(pg.locator('#popular .edit-meta').first.evaluate_handle('e=>e.parentElement').as_element() and pg, '#popular .edit-meta'), txt(pg, '#popular')[:80])
    check('How it works is always there', shown(pg, '#how') and pg.locator('.how-list li').count() == 4)
    check('no JS errors', not [e for e in errs if 'docChanges' not in e], errs)
    pg.context.close()

    print('--- drawn, nothing played ---')
    pg, errs = load(b, 'groups-upcoming-16')
    check('says voting opens soon', 'voting opens soon' in txt(pg, '#homePill'), txt(pg, '#homePill'))
    check('no open-matches block when nothing is live', not vis(pg, '#vote'))
    pg.context.close()

    print('--- groups finished, knockout not open ---')
    pg, errs = load(b, 'groups-done-16')
    check('between rounds message', 'next matches open soon' in txt(pg, '#homePill'), txt(pg, '#homePill'))
    check('results listed', shown(pg, '#recent'))
    pg.context.close()

    print('--- cup finished ---')
    def finished(ms):
        out = []
        for m in ms:
            if m.get('roundLabel') == 'Final':
                m = dict(m, status='completed', winnerId=m['song1']['id'])
            elif m.get('stage') != 'group' and m['status'] != 'completed':
                m = dict(m, status='completed', winnerId=m['song1']['id'])
            out.append(m)
        return out
    pg, errs = load(b, 'knockout-live-16', mutate=finished)
    check('champion block shows', shown(pg, '#champion') and 'complete' in txt(pg, '#homePill'), txt(pg, '#homePill'))
    check('no live "Vote now" button when finished', 'Watch & Vote' not in pg.inner_text('#homeActions'))
    pg.screenshot(path=f'{SHOTS}/desktop-finished.png', full_page=True)
    pg.context.close()
    b.close()

httpd.shutdown()
print('FAILED: ' + ', '.join(failed) if failed else 'all homepage browser checks passed')
sys.exit(1 if failed else 0)
