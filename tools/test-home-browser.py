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
        check('pill says matches are live', 'live now' in txt(pg, '#homePill'), txt(pg, '#homePill'))
        check('Vote now goes to /live', pg.locator('#homeActions a').first.get_attribute('href') == '/live')
        check('stats strip shows', shown(pg, '#homeStats') and pg.locator('#homeStats div').count() == 3)
        check('match of the day shows with a vote link', shown(pg, '#featured') and pg.locator('#featured a.btn-primary').get_attribute('href').startswith('/vote?match='))
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
    check('no stats strip, no match blocks', not shown(pg, '#homeStats') and not shown(pg, '#featured') and not shown(pg, '#recent'))
    check('popular falls back to YouTube views', 'Most watched' in txt(pg, '#popular') and 'views on YouTube' in txt(pg, '#popular'), txt(pg, '#popular')[:80])
    check('How it works is always there', shown(pg, '#how') and pg.locator('.how-list li').count() == 4)
    check('no JS errors', not [e for e in errs if 'docChanges' not in e], errs)
    pg.context.close()

    print('--- drawn, nothing played ---')
    pg, errs = load(b, 'groups-upcoming-16')
    check('says voting opens soon', 'voting opens soon' in txt(pg, '#homePill'), txt(pg, '#homePill'))
    check('no match of the day', not shown(pg, '#featured'))
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
    check('no live "Vote now" button when finished', 'Vote now' not in pg.inner_text('#homeActions'))
    pg.screenshot(path=f'{SHOTS}/desktop-finished.png', full_page=True)
    pg.context.close()
    b.close()

httpd.shutdown()
print('FAILED: ' + ', '.join(failed) if failed else 'all homepage browser checks passed')
sys.exit(1 if failed else 0)
