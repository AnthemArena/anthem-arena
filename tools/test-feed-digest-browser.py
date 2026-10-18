# Optional browser test: a flood of automatic vote posts collapses into one digest row (see tools/test-feed-browser.py for the base).
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
activity = [dict(activity[0], activityId=f'a{i}', username=f'Voter{i}', timestamp=activity[0]['timestamp'] - i * 1000) for i in range(6)]

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
    try: pg.wait_for_selector('.feed-vote-digest', timeout=20000)   # the feed fills in after the match list and activity arrive
    except Exception: pass
    pg.wait_for_timeout(500)
    return pg, errs

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        check(f'{tag}: six votes in a row collapse into one digest row', pg.locator('.feed-vote-digest').count() == 1, pg.locator('.feed-vote-digest').count())
        check(f'{tag}: no vote cards shown until expanded', pg.locator('.vote-text-copy:visible').count() == 0)
        txt = pg.inner_text('.vote-digest-text') if pg.locator('.vote-digest-text').count() else ''
        check(f'{tag}: digest says who and how many', 'cast 6 votes' in txt and 'Voter0' in txt, txt)
        pg.click('.vote-digest-toggle'); pg.wait_for_timeout(500)
        check(f'{tag}: clicking shows the six votes', pg.locator('.vote-digest-items .feed-post').count() == 6, pg.locator('.vote-digest-items .feed-post').count())
        check(f'{tag}: posts tab exists', pg.locator('.filter-btn[data-filter="posts"]').count() == 1)
        check(f'{tag}: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check(f'{tag}: no page errors', not errs, errs)
    b.close()
print('\nALL CHECKS PASSED' if not failed else f'\n{len(failed)} FAILED')
sys.exit(1 if failed else 0)
