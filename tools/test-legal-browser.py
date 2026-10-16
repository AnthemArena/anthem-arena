# Optional browser test of the REAL legal pages (legal/terms, privacy, disclosure) with mocked Firebase and a mocked /api/matches.
# Needs Python + playwright with chromium:   pip install playwright && playwright install chromium
#   python3 tools/test-legal-browser.py            (screenshots go to /tmp/legal-shots)
# Fixtures come from tools/test-support/bracket-fixtures.mjs (the real builders and the real data/edits.json).
import os, sys, json, subprocess, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/legal-shots'
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
    matches = []
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
    if False: pg.wait_for_function("document.querySelectorAll('.home-pill').length && document.getElementById('homePill').textContent !== 'Loading…'", timeout=15000)
    pg.wait_for_timeout(300)
    return pg, errs

vis = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector({json.dumps(sel)});return !!e&&getComputedStyle(e).display!=='none'&&e.offsetParent!==null}})()")
txt = lambda pg, sel: pg.inner_text(sel).strip()




noscroll = lambda pg: pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
OLD = ('League Music Tournament', 'Anthem Arena', 'anthemarena', 'Google Analytics', 'newsletter', 'subscribe', 'DMCA', 'fair use', 'Bebas')
PAGES = [('terms', 'Terms of Use'), ('privacy', 'Privacy Policy'), ('disclosure', 'Affiliate Disclosure')]
MAIL = 'arcanemomentsfanpage@gmail.com'

with sync_playwright() as p:
    b = p.chromium.launch()
    for label, w, h in (('desktop', 1280, 900), ('phone', 375, 740)):
        for slug, title in PAGES:
            print(f'--- {label}: {slug} ---')
            pg, errs = load(b, 'none', w, h, path=f'/legal/{slug}.html')
            pg.wait_for_timeout(500)
            main = pg.inner_text('main')
            check('title and heading', title in pg.title() and pg.inner_text('h1').strip() == title, (pg.title(), pg.inner_text('h1')))
            check('Arcane theme is on', pg.evaluate("document.body.classList.contains('theme-arcane')"))
            check('no old wording', not [k for k in OLD if k.lower() in main.lower() and k != 'Bebas'], [k for k in OLD if k.lower() in main.lower()])
            check('has a plain-English summary and 5+ sections', pg.locator('.legal-plain').count() == 1 and pg.locator('.legal-card').count() >= 5, pg.locator('.legal-card').count())
            check('contact link is wired to the one address', pg.locator('a[data-contact-mail]').first.get_attribute('href') == f'mailto:{MAIL}' and MAIL in pg.locator('a[data-contact-mail]').first.inner_text(), pg.locator('a[data-contact-mail]').first.get_attribute('href'))
            check('current page is marked in the switcher', pg.locator('.legal-switch a[aria-current="page"]').get_attribute('href') == f'/legal/{slug}')
            check('switcher links to the other two pages', pg.locator('.legal-switch a').count() == 3)
            check('no sideways scroll', noscroll(pg))
            check('no JS errors', not [e for e in errs if 'docChanges' not in e], errs)
            if slug == 'privacy':
                check('privacy says no analytics', 'no analytics' in main.lower())
                check('privacy covers profiles and anonymous sign-in', 'anonymous' in main.lower() and 'profile' in main.lower())
            if slug == 'terms':
                check('terms say videos are not hosted', 'do not host' in main.lower())
                check('terms explain creator removal', 'removal' in main.lower() or 'removed' in main.lower())
            if slug == 'disclosure':
                check('disclosure has the Amazon Associate statement', 'As an Amazon Associate we earn from qualifying purchases' in main)
            pg.screenshot(path=f'{SHOTS}/{label}-{slug}.png', full_page=True)
            pg.context.close()
    b.close()

httpd.shutdown()
print('FAILED: ' + ', '.join(failed) if failed else 'all legal browser checks passed')
sys.exit(1 if failed else 0)
