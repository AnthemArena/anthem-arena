# Optional browser test of the REAL About page (about.html + js/about.js + css/about-arcane.css) with a mocked /api/matches.
#   python3 tools/test-about-browser.py            (screenshots go to /tmp/about-shots)
import os, sys, json, subprocess, threading, http.server, socketserver, functools, re, base64
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/about-shots'
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
ids = {s['id'] for m in matches for s in (m['song1'], m['song2'])}
votes = sum(m.get('totalVotes', 0) for m in matches)

def load(browser, width, height, with_matches=True):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'):
            if with_matches: r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
            else: r.fulfill(status=500, body='no')
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com'): r.fulfill(body=PNG, content_type='image/png')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/about.html')
    pg.wait_for_timeout(2500)
    return pg, errs

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        body = pg.inner_text('body')
        check(f'{tag}: heading says Arcane Moments', pg.inner_text('h1').strip() == 'About Arcane Moments')
        stale = [t for t in ('Anthem Arena', 'Anthems Arena', '64 songs', '64 iconic', 'Subscribe', 'newsletter', 'Stay Updated', 'anthemarena@outlook.com') if t.lower() in body.lower()]
        check(f'{tag}: no old-site wording or fake newsletter left on the page (incl. the footer)', not stale, stale)
        check(f'{tag}: the footer disclaimer names Arcane Moments and Arcane', 'Arcane Moments was created under' in body and 'Arcane and all related' in body.replace('League of Legends®, ', ''))
        txt = lambda k: pg.inner_text(f'[data-stat="{k}"]').replace(',', '')
        check(f'{tag}: the current cup numbers come from the matches (edits, matches, votes)', (txt('edits'), txt('matches'), txt('votes')) == (str(len(ids)), str(len(matches)), str(votes)), (txt('edits'), txt('matches'), txt('votes'), len(ids), len(matches), votes))
        check(f'{tag}: three companion tiles (the enabled packs)', pg.locator('.companion').count() == 3 and 'Jinx' in pg.inner_text('#companionGrid'), pg.locator('.companion').count())
        check(f'{tag}: the how-it-works steps are numbered 1-5', pg.locator('.about-steps li').count() == 5)
        mails = pg.eval_on_selector_all('a[data-contact-mail], a[data-creator-mail]', 'els=>els.map(e=>e.getAttribute("href"))')
        check(f'{tag}: every contact and creator link is a mailto to the Arcane Moments address', len(mails) >= 3 and all(m.startswith('mailto:arcanemomentsfanpage@gmail.com') for m in mails), mails)
        anchors = pg.eval_on_selector_all('a[href^="#"], a[href*="/about#"]', 'els=>els.map(e=>(e.getAttribute("href").split("#")[1]))')
        missing = [a for a in set(anchors) if a and not pg.evaluate(f'!!document.getElementById({json.dumps(a)})')]
        check(f'{tag}: every #anchor on the page exists', not missing, missing)
        em = pg.locator('.about-email a')
        check(f'{tag}: the contact address is shown once, on one line (not broken mid-word)', em.count() == 1 and em.inner_text() == 'arcanemomentsfanpage@gmail.com' and pg.evaluate("(()=>{const e=document.querySelector('.about-email a');return e.getClientRects().length===1})()"), em.inner_text() if em.count() else None)
        check(f'{tag}: the footer has a "For creators" link to #creators', pg.locator('a[href="/about#creators"]').count() >= 1)
        check(f'{tag}: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        r = pg.evaluate("(()=>{const cs=[...document.querySelectorAll('.about-card')];return cs.every(c=>{const r=c.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})})()")
        check(f'{tag}: every card fits the screen width', r)
        check(f'{tag}: no page errors', not [e for e in errs if 'docChanges' not in e], errs)
        pg.screenshot(path=f'{SHOTS}/{tag}.png', full_page=True)
        pg.context.close()

    # the numbers must not break the page when the matches cannot be loaded
    pg, errs = load(b, 390, 844, with_matches=False)
    check('matches unavailable: the numbers stay as dashes and the page still works', pg.inner_text('[data-stat="edits"]').strip() in ('–', '-', '–') and pg.locator('.about-card').count() >= 8 and not [e for e in errs if 'docChanges' not in e], (pg.inner_text('[data-stat="edits"]'), errs))
    b.close()
print('\nALL CHECKS PASSED' if not failed else f'\n{len(failed)} FAILED')
sys.exit(1 if failed else 0)
