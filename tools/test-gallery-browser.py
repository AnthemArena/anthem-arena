# Optional browser test of the REAL edits gallery (music-gallery.html + js/music-gallery.js) with mocked /api/matches and edits.json.
#   python3 tools/test-gallery-browser.py            (screenshots go to /tmp/gallery-shots)
import os, sys, json, subprocess, threading, http.server, socketserver, functools, re, base64
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/gallery-shots'
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

matches = json.load(open(f'{FIX}/groups-mid-16.json'))
songs = {}
for m in matches:
    for k in ('song1', 'song2'):
        s = m[k]
        if s['id'] not in songs: songs[s['id']] = s
edits = [{'id': s['id'], 'videoId': s['videoId'], 'title': s['title'], 'shortTitle': s.get('shortTitle') or s['title'], 'artist': s['artist'],
          'creatorUrl': '', 'channelId': s.get('channelId', ''), 'characters': ['Jinx'], 'tournaments': ['group-test-01'], 'views': 1000 * (i + 1),
          'likes': 100 * (i + 1), 'year': 2025, 'duration': 30, 'aspect': '9:16', 'status': 'ok', 'embedAllowed': True}
         for i, s in enumerate(songs.values())]

def load(browser, width, height):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif path.endswith('/data/edits.json'): r.fulfill(body=json.dumps(edits), content_type='application/json')
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com') or u.startswith('https://img.youtube.com'): r.fulfill(body=PNG, content_type='image/png')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/music-gallery.html')
    pg.wait_for_timeout(3000)
    return pg, errs

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        n = pg.locator('.edit-card').count()
        check(f'{tag}: every entered edit has a card ({len(edits)})', n == len(edits), n)
        badges = pg.eval_on_selector_all('.edit-badge', 'els=>els.map(e=>e.textContent.trim())')
        check(f'{tag}: no badge says "Out"', all(not re.search(r'\bout\b', t, re.I) for t in badges), badges)
        check(f'{tag}: a finished group shows "Through to the knockout" and "Group stage"', 'Through to the knockout' in badges and 'Group stage' in badges, sorted(set(badges)))
        check(f'{tag}: no win-loss record on any card', pg.locator('.edit-stats dt', has_text='Record').count() == 0)
        check(f'{tag}: card stats are Views, Likes, Year', pg.eval_on_selector_all('.edit-card:first-child .edit-stats dt', 'els=>els.map(e=>e.textContent.trim())') == ['Views', 'Likes', 'Year'])
        txt = pg.inner_text('.edit-grid')
        check(f'{tag}: no "1-2" style records anywhere in the grid', not re.search(r'(?<![\d:])\d\s*[–-]\s*\d(?![\d:])', txt), re.findall(r'.{0,12}\d\s*[–-]\s*\d.{0,12}', txt)[:3])
        opts = pg.eval_on_selector_all('#statusFilter option', 'els=>els.map(e=>e.textContent.trim())')
        check(f'{tag}: status filter says "Finished their run", not "Eliminated"', 'Finished their run' in opts and 'Eliminated' not in opts, opts)
        pg.select_option('#statusFilter', 'eliminated'); pg.wait_for_timeout(300)
        only = pg.eval_on_selector_all('.edit-badge', 'els=>els.map(e=>e.textContent.trim())')
        check(f'{tag}: the "Finished their run" filter keeps only edits whose group is over and who did not go through', only and set(only) == {'Group stage'}, only)
        pg.select_option('#statusFilter', '')
        check(f'{tag}: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check(f'{tag}: no page errors', not errs, errs)
        pg.screenshot(path=f'{SHOTS}/{tag}.png')
    b.close()
print('\nALL CHECKS PASSED' if not failed else f'\n{len(failed)} FAILED')
sys.exit(1 if failed else 0)
