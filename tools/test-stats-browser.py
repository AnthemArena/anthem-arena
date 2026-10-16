# Optional browser test of the REAL stats page (stats.html + js/stats.js) with mocked Firebase and a mocked /api/matches.
# Needs Python + playwright with chromium:   pip install playwright && playwright install chromium
#   python3 tools/test-stats-browser.py            (screenshots go to /tmp/stats-shots)
# Fixtures come from tools/test-support/bracket-fixtures.mjs (the real builders and the real data/edits.json).
import os, sys, json, subprocess, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/stats-shots'
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
import base64
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'   got: {got}'))
    if not ok: failed.append(name)

def load(browser, scenario, width=1280, height=900, mutate=None, scale=1, init=None):
    matches = json.load(open(f'{FIX}/{scenario}.json'))
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
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com'): r.fulfill(body=PNG, content_type='image/png')
        elif u.startswith('https://img.youtube.com'): r.fulfill(body='', content_type='image/jpeg')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/stats.html')
    pg.wait_for_function("(()=>{const e=document.getElementById('pane-overview');return !!e && !e.hasAttribute('aria-busy')})()", timeout=15000)
    pg.wait_for_timeout(300)
    return pg, errs

vis = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector({json.dumps(sel)});return !!e&&getComputedStyle(e).display!=='none'&&e.offsetParent!==null}})()")
txt = lambda pg, sel: pg.inner_text(sel).strip()


noscroll = lambda pg: pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
tab = lambda pg, name: (pg.click(f'#tab-{name}'), pg.wait_for_timeout(100))

with sync_playwright() as p:
    b = p.chromium.launch()
    for label, w, h in (('desktop', 1280, 900), ('phone', 375, 740)):
        print(f'--- {label} ---')
        pg, errs = load(b, 'groups-mid-16', w, h)
        check('overview shows votes cast', int(pg.inner_text('[data-stat="Votes cast"]').replace(',', '')) > 0, pg.inner_text('#pane-overview')[:120])
        check('overview shows 16 edits', txt(pg, '[data-stat="Edits in the cup"]') == '16', txt(pg, '[data-stat="Edits in the cup"]'))
        check('no old wording on the page', not any(k in pg.inner_text('main') for k in ('Anthem Arena', 'songs', 'Seed Performance', 'League music')), pg.inner_text('main')[:200])
        check('title is Arcane Moments', 'Arcane Moments' in pg.title(), pg.title())
        check('page has the Arcane theme', pg.evaluate("document.body.classList.contains('theme-arcane')"))
        check('no sideways scroll (overview)', noscroll(pg))
        pg.screenshot(path=f'{SHOTS}/{label}-overview.png', full_page=True)

        tab(pg, 'edits')
        check('edits tab lists 16 rows', pg.locator('.rank-row').count() == 16, pg.locator('.rank-row').count())
        check('no hashtags in edit names', '#' not in ' '.join(pg.eval_on_selector_all('.rank-title', 'e=>e.map(x=>x.innerText)')))
        first = txt(pg, '.rank-title')
        pg.select_option('#sortEdits', 'wins'); pg.wait_for_timeout(100)
        check('sort select keeps working', pg.locator('.rank-row').count() == 16 and vis(pg, '#sortEdits'))
        check('no sideways scroll (edits)', noscroll(pg))
        pg.screenshot(path=f'{SHOTS}/{label}-edits.png', full_page=True)

        tab(pg, 'groups')
        check('groups tab shows 4 groups', pg.locator('.group-card').count() == 4, pg.locator('.group-card').count())
        check('finished group marks two through', pg.locator('.group-card.is-done').first.locator('li.is-through').count() == 2)
        pg.select_option('#groupState', 'done'); pg.wait_for_timeout(100)
        check('"Finished" filter keeps 2 groups', pg.locator('.group-card').count() == 2, pg.locator('.group-card').count())
        pg.select_option('#groupState', ''); pg.fill('#groupSearch', 'zzzzqq'); pg.wait_for_timeout(100)
        check('search with no match says so', 'No groups match' in pg.inner_text('#pane-groups'))
        check('search box keeps focus while typing', pg.evaluate("document.activeElement.id") == 'groupSearch')
        pg.fill('#groupSearch', ''); pg.wait_for_timeout(100)
        check('no sideways scroll (groups)', noscroll(pg))
        pg.screenshot(path=f'{SHOTS}/{label}-groups.png', full_page=True)

        tab(pg, 'records')
        check('records show closest finish and a link to its match', 'closest finish' in pg.inner_text('#pane-records').lower() and pg.locator('a.record-card').first.get_attribute('href').startswith('/vote?match='))
        check('no sideways scroll (records)', noscroll(pg))
        pg.screenshot(path=f'{SHOTS}/{label}-records.png', full_page=True)

        pg.keyboard.press('Control+Home'); pg.focus('#tab-records'); pg.keyboard.press('ArrowRight')
        check('arrow keys move between tabs', pg.evaluate("document.activeElement.id") == 'tab-overview')
        check('no JS errors', not [e for e in errs if 'docChanges' not in e], errs)
        pg.context.close()

    print('--- upcoming cup (no votes) ---')
    pg, errs = load(b, 'groups-upcoming-16')
    check('upcoming cup: zero votes, no crash', txt(pg, '[data-stat="Votes cast"]') == '0' and not errs, errs)
    tab(pg, 'records')
    check('records say to check back', 'first votes' in pg.inner_text('#pane-records'))
    pg.context.close()

    print('--- knockout cup ---')
    pg, errs = load(b, 'knockout-live-16')
    check('knockout stages listed in progress', pg.locator('.round-row').count() >= 4, pg.locator('.round-row').count())
    check('live matches counted', int(txt(pg, '[data-stat="Live now"]')) == 2, txt(pg, '[data-stat="Live now"]'))
    pg.context.close()

    print('--- 128 edits ---')
    pg, errs = load(b, 'groups-mid-128', 375, 740)
    tab(pg, 'groups')
    check('32 group cards on a phone', pg.locator('.group-card').count() == 32, pg.locator('.group-card').count())
    check('no sideways scroll (128 groups)', noscroll(pg))
    pg.context.close()
    b.close()

httpd.shutdown()
print('FAILED: ' + ', '.join(failed) if failed else 'all stats browser checks passed')
sys.exit(1 if failed else 0)
