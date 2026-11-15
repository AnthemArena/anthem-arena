# Browser test: when /api/matches answers with a web page instead of data (the edge function is not running), the site reads Firestore directly.
#   python3 tools/test-api-fallback-browser.py
import os, sys, json, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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

CUP = 'tournaments/jinx-cup-1/matches/'
DOCS = [[CUP + 'm-1', {'status': 'live', 'round': 1, 'song1': {'title': 'A', 'votes': 3}, 'song2': {'title': 'B', 'votes': 1}}],
        [CUP + 'm-2', {'status': 'upcoming', 'round': 1, 'song1': {'title': 'C'}, 'song2': {'title': 'D'}}]]

def run(browser, api):
    ctx = browser.new_context(); ctx.add_init_script(f"if(!sessionStorage.getItem('fs'))sessionStorage.setItem('fs', {json.dumps(json.dumps(DOCS))})")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif '/api/' in u: api(r)
        elif 'gstatic.com' in u or 'googleapis' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/404.html'); pg.wait_for_timeout(500)
    return pg, errs

html = lambda r: r.fulfill(body='<!DOCTYPE html><html><body>Not found</body></html>', content_type='text/html')
good = lambda r: r.fulfill(body=json.dumps([{'id': 'from-edge', 'totalVotes': 0}]), content_type='application/json')
fail500 = lambda r: r.fulfill(status=500, body='boom')
call = "async()=>{const m=await import('/js/api-client.js');return [await m.getAllMatches(true), await m.getMatch('m-1', true), await m.getMatch('nope', true)];}"

with sync_playwright() as p:
    b = p.chromium.launch()
    for label, api in (('the edge answers with a web page', html), ('the edge answers 500', fail500)):
        pg, errs = run(b, api)
        all_, one, none_ = pg.evaluate(call)
        check(f'{label}: the match list still loads from Firestore', sorted(m['id'] for m in all_) == ['m-1', 'm-2'], all_)
        check(f'{label}: counts are worked out like the edge does', next(m for m in all_ if m['id'] == 'm-1')['totalVotes'] == 4 and one['song1']['percentage'] == 75, one)
        check(f'{label}: one match by id works, an unknown id gives null (the page says "Match not found")', one['id'] == 'm-1' and none_ is None, (one, none_))
    pg, errs = run(b, good)
    all_, one, _ = pg.evaluate("async()=>{const m=await import('/js/api-client.js');return [await m.getAllMatches(true), null, null];}")
    check('when the edge works, its answer is used (no Firestore read)', [m['id'] for m in all_] == ['from-edge'], all_)
    b.close()
print('\nALL CHECKS PASSED' if not failed else f'\n{len(failed)} FAILED'); sys.exit(1 if failed else 0)
