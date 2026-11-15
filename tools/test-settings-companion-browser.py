# Optional browser test: the Settings "Your Champion" panel shows the companion when the picture is a champion without a pack.
#   python3 tools/test-settings-companion-browser.py
import os, threading, http.server, socketserver, functools, base64
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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

def run(browser, avatar_champion, companion):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
    ctx.add_init_script(f"""localStorage.setItem('username','tester');localStorage.setItem('isPublic','true');localStorage.setItem('tournamentUserId','u1');
      localStorage.setItem('avatar', JSON.stringify({{type:'url', value:'https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/{avatar_champion}_0.jpg', name:'{avatar_champion}'}}));
      localStorage.setItem('companionId','{companion}'); localStorage.setItem('companionChosen','true');""")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com'): r.fulfill(body=PNG, content_type='image/png')
        elif u.startswith('http://127.0.0.1'): r.continue_()
        else: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/about.html'); pg.wait_for_timeout(1500)
    pg.evaluate("async () => { const m = await import('/js/settings-modal.js'); m.openSettingsModal(); }")
    pg.wait_for_selector('#yourChampion', state='attached', timeout=15000); pg.wait_for_timeout(1500)
    text = pg.inner_text('#yourChampion'); sel = pg.eval_on_selector_all('.champion-avatar-option.selected', 'els=>els.map(e=>e.dataset.champion)')
    ctx.close(); return text, sel, errs

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    text, sel, errs = run(b, 'Jayce', 'caitlyn')
    check('picture without a pack: the panel shows the companion (Caitlyn), not "no levels"', 'Caitlyn' in text and 'no levels' not in text and 'Mastery' in text, text[:200])
    check('picture without a pack: says the picture is Jayce and the alerts use Caitlyn', 'Your picture is Jayce' in text and 'use Caitlyn' in text, text[-200:])
    check('picture without a pack: the companion is marked in the picker', [s.lower() for s in sel] == ['caitlyn'], sel)
    check('no page errors (Jayce)', not errs, errs[:2])
    text, sel, errs = run(b, 'Jinx', 'jinx')
    check('picture with a pack: normal card, no extra note', 'Jinx' in text and 'Your picture is' not in text, text[:200])
    check('picture with a pack: marked in the picker', [s.lower() for s in sel] == ['jinx'], sel)
    b.close()
print('\nALL CHECKS PASSED' if not failed else f'\n{len(failed)} FAILED'); raise SystemExit(1 if failed else 0)
