# Optional browser test of the REAL feed page (feed.html + js/feed-page.js) with mocked /api/activity and /api/matches:
# a vote post must name the edits by their short titles, with no hashtags and no "||" runs.
#   python3 tools/test-feed-browser.py            (screenshots go to /tmp/feed-shots)
import os, sys, json, subprocess, threading, http.server, socketserver, functools, re, base64, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/feed-shots'
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
def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'   got: {got}'))
    if not ok: failed.append(name)

RAW1 = 'Bro tried to rizz Jinx \U0001F480 - JINX EDIT || Britney Spears - Toxic #jinxedit #jinx #arcane #edit'
RAW2 = 'Jinx edit \U0001F499\U0001F525 #arcane #leagueoflegends #arcaneedit #jinx #jinxarcane #edit'
matches = json.load(open(f'{FIX}/groups-mid-16.json'))
m = next(x for x in matches if x['status'] == 'live')
m['song1'].update(title=RAW1); m['song1'].pop('shortTitle', None)
m['song2'].update(title=RAW2); m['song2'].pop('shortTitle', None)
activity = [{'activityId': 'a1', 'userId': 'u1', 'username': 'SwiftRanger194', 'avatar': 'default', 'matchId': m['matchId'], 'choice': 'song1',
             'songId': m['song1']['id'], 'songTitle': RAW1, 'timestamp': int(time.time() * 1000) - 7200000, 'tournamentId': m['tournament'], 'type': 'vote'}]

def load(browser, width, height):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    ctx.add_init_script("localStorage.setItem('username','tester');localStorage.setItem('isPublic','true');")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif path.endswith('/api/activity'): r.fulfill(body=json.dumps(activity), content_type='application/json')
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com') or u.startswith('https://img.youtube.com'): r.fulfill(body=PNG, content_type='image/png')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/feed.html')
    pg.wait_for_timeout(4000)
    return pg, errs

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        n = pg.locator('.vote-text-copy').count()
        check(f'{tag}: the vote post is on the page', n >= 1, n)
        if n:
            txt = pg.inner_text('.vote-text-copy')
            check(f'{tag}: "voted for ... over ..." uses short names', txt.strip() == 'voted for Bro tried to rizz Jinx \U0001F480 over Jinx edit \U0001F499\U0001F525', txt)
            check(f'{tag}: no hashtags and no || in the post line', '#' not in txt and '||' not in txt, txt)
            names = pg.eval_on_selector_all('.match-embed-card .song-name', 'els=>els.map(e=>e.textContent.trim())')
            check(f'{tag}: the match card names carry no hashtags either', names and all('#' not in x and '||' not in x for x in names), names)
        pg.click('.share-btn'); pg.wait_for_timeout(300)
        check(f'{tag}: share menu opens with the options', pg.locator('.share-menu .share-menu-item').count() >= 5, pg.locator('.share-menu .share-menu-item').count())
        check(f'{tag}: share menu is on screen', pg.evaluate("(()=>{const r=document.querySelector('.share-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0})()"))
        pg.evaluate("window.__copied=null;navigator.clipboard.writeText=t=>{window.__copied=t;return Promise.resolve()}")
        pg.click('.share-menu-item[data-act="link"]'); pg.wait_for_timeout(200)
        copied = pg.evaluate('window.__copied')
        check(f'{tag}: copy link gives the match link', copied and copied.endswith('/vote?match=' + m['matchId']), copied)
        pg.click('.filter-btn[data-filter="trending"]'); pg.wait_for_timeout(1500)
        check(f'{tag}: trending tab loads without errors', not errs, errs)
        check(f'{tag}: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check(f'{tag}: no page errors', not errs, errs)
        pg.screenshot(path=f'{SHOTS}/{tag}.png')
    b.close()
print('\nALL CHECKS PASSED' if not failed else f'\n{len(failed)} FAILED')
sys.exit(1 if failed else 0)
