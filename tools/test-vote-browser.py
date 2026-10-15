# Optional browser test of the REAL vote page (vote.html + js/vote.js) with mocked Firebase and a mocked /api/matches.
#   python3 tools/test-vote-browser.py            (screenshots go to /tmp/vote-shots)
# Checks the portrait (9:16) Shorts players at desktop and phone width, and the "Next match" bar shown after voting.
import os, sys, json, subprocess, threading, http.server, socketserver, functools
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/vote-shots'
os.makedirs(SHOTS, exist_ok=True)
subprocess.run(['node', os.path.join(ROOT, 'tools/test-support/bracket-fixtures.mjs'), FIX], check=True, capture_output=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

FS = open(os.path.join(ROOT, 'tools/test-support/browser-firestore.js')).read()
APP = "export const initializeApp=()=>({});"
AUTH = "export const getAuth=()=>({currentUser:null});export const signInAnonymously=async()=>({});export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb(null),0);return()=>{}};export const signOut=async()=>({});"
CUP = [l for l in open(os.path.join(ROOT, 'js/arcane-config.js')).read().splitlines() if 'tournamentId:' in l][0].split("'")[1]
failed = []
def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'   got: {got}'))
    if not ok: failed.append(name)

matches = json.load(open(f'{FIX}/groups-mid-16.json'))
live = sorted([m for m in matches if m['status'] == 'live'], key=lambda m: m['matchId'])
CURRENT, OTHER_VOTED = live[0]['matchId'], live[1]['matchId']
EXPECT_LEFT = len(live) - 2        # everything live except the one being viewed and the one already voted in

def load(browser, width, height, voted):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    init = f"localStorage.setItem('username','tester');localStorage.setItem('isPublic','true');localStorage.setItem('tournamentUserId','u1');"
    init += f"localStorage.setItem('userVotes', JSON.stringify({{'{OTHER_VOTED}': {{songId:'song1', songTitle:'x', opponentTitle:'y', timestamp:1}}}}));"
    if voted: init += f"localStorage.setItem('vote_{CUP}_{CURRENT}','song1');"
    ctx.add_init_script(init)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'):
            mid = parse_qs(urlparse(u).query).get('matchId', [None])[0]
            body = next((m for m in matches if m['matchId'] == mid), None) if mid else matches
            r.fulfill(body=json.dumps(body), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif '/api/' in u: r.fulfill(body='{}', content_type='application/json')
        elif u.startswith('https://img.youtube.com') or 'youtube.com/embed' in u: r.fulfill(body='', content_type='image/jpeg' if 'img.' in u else 'text/html')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/vote.html?match={CURRENT}')
    pg.wait_for_timeout(3500)
    return pg, errs

rect = lambda pg, sel, n=0: pg.evaluate(f"(()=>{{const e=document.querySelectorAll({json.dumps(sel)})[{n}];if(!e)return null;const r=e.getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom}}}})()")

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- desktop, not voted yet ----------
    pg, errs = load(b, 1280, 900, voted=False)
    check('desktop: the match loaded (both edit names filled in)', 'Loading' not in pg.inner_text('#competitor1-name') and 'Loading' not in pg.inner_text('#competitor2-name'), pg.inner_text('#competitor1-name'))
    w1, w2 = rect(pg, '.video-wrapper', 0), rect(pg, '.video-wrapper', 1)
    check('desktop: players are portrait 9:16 (they were 16:9)', w1 and abs(w1['w'] / w1['h'] - 9 / 16) < 0.03 and abs(w2['w'] / w2['h'] - 9 / 16) < 0.03, (w1, w2))
    check('desktop: players are capped to about 64% of the window height', w1['h'] <= 0.64 * 900 + 2, w1['h'])
    check('desktop: both players line up side by side', abs(w1['y'] - w2['y']) < 3 and w2['x'] > w1['r'], (w1, w2))
    vb = rect(pg, '.vote-btn', 0)
    print(f"        info: first vote button bottom at {round(vb['b'])}px (window 900px) with the page at the top")
    check('desktop: the player is on the first screen (at least 40% of it visible without scrolling)', w1['y'] + 0.4 * w1['h'] <= 900, w1)
    print(f"        info: desktop player top at {round(w1['y'])}px of 900px (was about 800px before this patch)")
    check('desktop: no next-match bar before voting', pg.query_selector('#next-match-bar') is None)
    pg.screenshot(path=f'{SHOTS}/vote-desktop.png')
    pg.context.close()

    # ---------- phone, not voted yet ----------
    pg, errs = load(b, 390, 844, voted=False)
    w1 = rect(pg, '.video-wrapper', 0)
    check('phone: player is portrait and inside the screen', w1 and abs(w1['w'] / w1['h'] - 9 / 16) < 0.03 and w1['r'] <= 390 and w1['x'] >= 0, w1)
    print(f"        info: phone player top at {round(w1['y'])}px of 844px")
    check('phone: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    r1, r2 = rect(pg, '.replay-btn', 0), rect(pg, '.fullscreen-btn', 0)
    check('phone: Replay and Fullscreen sit side by side', abs(r1['y'] - r2['y']) < 3 and r2['x'] > r1['r'] - 1, (r1, r2))
    pg.screenshot(path=f'{SHOTS}/vote-phone.png')
    pg.context.close()

    # ---------- voted: the Next match bar ----------
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h, voted=True)
        bar = pg.query_selector('#next-match-bar')
        check(f'voted ({tag}): the Next match bar is shown', bar is not None)
        if bar:
            txt = bar.inner_text()
            check(f'voted ({tag}): it counts the matches still to vote in ({EXPECT_LEFT}), not the current or already-voted ones', f'{EXPECT_LEFT} more matches need your vote' in txt, txt)
            href = pg.get_attribute('#next-match-bar .next-bar-btn', 'href')
            check(f'voted ({tag}): the button goes to a different live match you have not voted in', href.startswith('vote?match=') and CURRENT not in href and OTHER_VOTED not in href, href)
            nxt = href.split('=')[1]
            check(f'voted ({tag}): that match is live', any(m['matchId'] == nxt and m['status'] == 'live' for m in matches), nxt)
            br = rect(pg, '#next-match-bar')
            check(f'voted ({tag}): the bar is pinned to the bottom of the window and inside the screen', abs(br['b'] - h) < 2 and br['x'] >= 0 and br['r'] <= w, br)
            check(f'voted ({tag}): the page has room under it (body padding)', pg.evaluate("document.body.classList.contains('has-next-bar')"))
        sec = pg.inner_text('#other-matches-section h2') if pg.query_selector('#other-matches-section h2') else ''
        check(f'voted ({tag}): the "More Matches" list agrees ({EXPECT_LEFT})', f'{EXPECT_LEFT} More Matches' in sec, sec)
        pg.screenshot(path=f'{SHOTS}/vote-voted-{tag}.png')
        check(f'voted ({tag}): no errors from the new code', not [e for e in errs if 'next-match' in e or 'updateNextMatchBar' in e or 'unvotedLiveMatches' in e], errs)
        pg.context.close()

    b.close()

print('\n' + ('ALL CHECKS PASSED' if not failed else f'{len(failed)} FAILED'))
sys.exit(1 if failed else 0)
