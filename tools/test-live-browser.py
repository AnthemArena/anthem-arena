# Optional browser test of the REAL live page (live.html + js/live.js) with a mocked /api/matches.
#   python3 tools/test-live-browser.py            (screenshots go to /tmp/live-shots)
import os, sys, json, subprocess, threading, http.server, socketserver, functools, re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/live-shots'
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
def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'   got: {got}'))
    if not ok: failed.append(name)

matches = json.load(open(f'{FIX}/groups-mid-16.json'))
live = sorted([m for m in matches if m['status'] == 'live'], key=lambda m: m['matchId'])
VOTED = live[0]['matchId']

def load(browser, width, height):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    votes = {VOTED: {'songId': 'song2', 'songTitle': 'x', 'opponentTitle': 'y', 'timestamp': 1}}
    ctx.add_init_script(f"localStorage.setItem('username','tester');localStorage.setItem('isPublic','true');localStorage.setItem('userVotes', JSON.stringify({json.dumps(votes)}));")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://img.youtube.com'):
            r.fulfill(body=open('/tmp/cover.jpg', 'rb').read(), content_type='image/jpeg')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/live.html')
    pg.wait_for_timeout(3500)
    return pg, errs

# a 4:3 stand-in for YouTube's thumbnail: black bars either side of a vertical picture
from PIL import Image, ImageDraw
im = Image.new('RGB', (480, 360), (0, 0, 0)); d = ImageDraw.Draw(im); d.rectangle([139, 0, 341, 360], fill=(150, 60, 140)); im.save('/tmp/cover.jpg')

rect = lambda pg, sel, n=0: pg.evaluate(f"(()=>{{const e=document.querySelectorAll({json.dumps(sel)})[{n}];if(!e)return null;const r=e.getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom}}}})()")

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        n_cards = pg.locator('#socialGrid .social-match-card').count()
        check(f'{tag}: the page shows the live matches you have not voted in ({len(live) - 1})', n_cards == len(live) - 1, n_cards)
        c = rect(pg, '#socialGrid .social-match-card img', 0)
        check(f'{tag}: covers are portrait (9:16), not landscape boxes', c and abs(c['w'] / c['h'] - 9 / 16) < 0.03, c)
        card = rect(pg, '#socialGrid .social-match-card')
        check(f'{tag}: covers stay inside their card', c['x'] >= card['x'] and c['r'] <= card['r'] and c['b'] <= card['b'], (c, card))
        check(f'{tag}: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        titles = pg.eval_on_selector_all('#socialGrid .social-match-card .song-details h3', 'els=>els.map(e=>e.textContent.trim())')
        check(f'{tag}: card titles show no trailing hashtags', titles and all(not re.search(r'#\w+\s*$', t) for t in titles), titles)
        hs = pg.eval_on_selector_all('#socialGrid .social-match-card .song-details h3', 'els=>els.map(e=>e.getBoundingClientRect().height)')
        lh = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#socialGrid .social-match-card .song-details h3')).lineHeight) || 24")
        check(f'{tag}: titles are two lines at most', all(x <= lh * 2 + 4 for x in hs), (hs, lh))
        src = pg.get_attribute('#socialGrid .social-match-card img', 'src')
        check(f'{tag}: covers use the sharper 4:3 thumbnail (hqdefault)', 'hqdefault' in src, src)
        pg.screenshot(path=f'{SHOTS}/live-{tag}.png')
        # the voted section (collapsed by default): open it and look at the pick
        voted = pg.locator('#votedGrid .social-match-card.voted').first
        check(f'{tag}: the match you voted in is listed under "Your Votes"', voted.count() == 1)
        if voted.count() and not voted.is_visible():
            pg.click('#votedToggle'); pg.wait_for_timeout(400)      # the section can be collapsed: open it
        voted.scroll_into_view_if_needed()
        if voted.count() and voted.is_visible():
            pick = pg.evaluate("(()=>{const c=document.querySelector('.social-match-card.voted');const a=c.querySelectorAll('img');return [a[0].classList.contains('user-pick'),a[1].classList.contains('user-pick'),getComputedStyle(a[0]).opacity,getComputedStyle(a[1]).opacity]})()")
            check(f'{tag}: on a voted card the picked cover is highlighted and the other is dimmed', pick[1] and not pick[0] and float(pick[0 + 2]) < 0.9 and float(pick[3]) == 1, pick)
            pg.screenshot(path=f'{SHOTS}/live-{tag}-voted.png')
        else:
            check(f'{tag}: the voted card can be seen', False)
        check(f'{tag}: no page errors', not errs, errs)
        pg.context.close()
    b.close()

print('\n' + ('ALL CHECKS PASSED' if not failed else f'{len(failed)} FAILED'))
sys.exit(1 if failed else 0)
