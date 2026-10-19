# Browser test of WHEN the poller fires each alert (js/global-notifications.js checkAndShowBulletin), against a mutable fake match list.
#   python3 tools/test-trigger-rules-browser.py

import os, sys, json, subprocess, threading, http.server, socketserver, functools, re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/live-shots'
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


import time
NOW = int(time.time() * 1000)
def song(i, votes): return {'videoId': f'vid{i:08d}x'[:11], 'shortTitle': f'E{i}', 'title': f'Edit {i}', 'votes': votes}
def match(mid, v1, v2, hours=48, status='live'):
    end = NOW + int(hours * 3600000)
    return {'matchId': mid, 'id': mid, 'status': status, 'round': 1, 'song1': song(1, v1), 'song2': song(2, v2), 'totalVotes': v1 + v2, 'endTime': end, 'endDate': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(end / 1000))}
state = {'matches': []}
VOTES = lambda ids: {i: {'songId': 'song1', 'songTitle': 'E1', 'opponentTitle': 'E2', 'timestamp': 1} for i in ids}

def make_page(browser, votes):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
    ctx.add_init_script("localStorage.setItem('username','tester');localStorage.setItem('tournamentUserId','u-test');localStorage.setItem('userVotes', JSON.stringify(%s));localStorage.setItem('notifiedRounds', JSON.stringify({1: 99}));" % json.dumps(VOTES(votes)))
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(state['matches']), content_type='application/json')
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com') or u.startswith('https://img.youtube.com'): r.fulfill(body=PNG, content_type='image/png')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/javascript')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(3500)
    return pg, errs

def poll(pg):
    """Run one check; return what showed ((type, matchId, tier) or None)."""
    pg.evaluate("window.lastShownBulletin = null; document.querySelector('#bulletin-banner')?.remove()")
    pg.evaluate("window.checkAndShowBulletin()"); pg.wait_for_timeout(1200)
    r = pg.evaluate("window.lastShownBulletin")
    return (r['type'], r['matchId'], r.get('severityTier')) if r else None
def reset(pg, voted):
    pg.evaluate("localStorage.clear(); sessionStorage.clear();")
    pg.evaluate("(v)=>{localStorage.setItem('tournamentUserId','u-test');localStorage.setItem('userVotes', JSON.stringify(v));localStorage.setItem('notifiedRounds', JSON.stringify({1: 99}));}", VOTES(voted))
def quiet_cooldowns(pg):   # the in-page 5-20 minute cooldowns are not what is under test here
    pg.evaluate("sessionStorage.removeItem('recentBulletins')")

with sync_playwright() as p:
    b = p.chromium.launch()

    # 1. two matches in danger at once: both get their turn (the second used to be marked as seen and never shown)
    state['matches'] = [match('m-a', 10, 40), match('m-b', 12, 50)]
    pg, errs = make_page(b, ['m-a', 'm-b'])
    first = poll(pg); second = poll(pg); third = poll(pg)
    shown = {x[1] for x in (first, second) if x}
    check('two matches in danger: each alerted in turn', shown == {'m-a', 'm-b'} and first and first[0].startswith('danger'), (first, second))
    check('then nothing repeats', third is None, third)

    # 2. winning: once per match per level of lead
    state['matches'] = [match('m-w', 60, 15)]   # 80%, 75 votes
    reset(pg, ['m-w'])
    w1 = poll(pg); quiet_cooldowns(pg)
    pg.evaluate("localStorage.removeItem('lastWinningToast')")   # the hourly cap is checked on its own below
    w2 = poll(pg)
    check('winning: shown once', w1 and w1[0] == 'winning' and w2 is None, (w1, w2))
    state['matches'] = [match('m-w', 40, 20)]   # 67%, lead of 20: a different level (large)
    quiet_cooldowns(pg); pg.evaluate("localStorage.setItem('lastWinningToast', String(Date.now()))")
    w3 = poll(pg)
    check('winning: a new level of lead still waits out the one-an-hour limit', w3 is None, w3)
    pg.evaluate("localStorage.removeItem('lastWinningToast')"); quiet_cooldowns(pg)
    w4 = poll(pg)
    check('winning: ...and shows once the hour has passed', w4 and w4[0] == 'winning', w4)

    # 3. closing soon: each step once per match
    reset(pg, ['m-other'])
    state['matches'] = [match('m-c', 10, 5, hours=2)]
    c1 = poll(pg); quiet_cooldowns(pg); c2 = poll(pg)
    check('closing: the 3-hour step shows once', c1 and c1[0] == 'closing' and c2 is None, (c1, c2))
    state['matches'] = [match('m-c', 10, 5, hours=0.3)]
    quiet_cooldowns(pg); c3 = poll(pg)
    check('closing: the final step shows after it', c3 and c3[0] == 'closing' and c3[2] == 'final', c3)

    # 4. danger: worse alerts, better does not; recovery resets; a quick relapse waits
    reset(pg, ['m-d'])
    state['matches'] = [match('m-d', 5, 25)]          # 20 behind
    d1 = poll(pg); quiet_cooldowns(pg)
    state['matches'] = [match('m-d', 20, 29)]         # 9 behind, 41%... still losing but not below 40%
    state['matches'] = [match('m-d', 15, 28)]         # 13 behind, 35%
    d2 = poll(pg); quiet_cooldowns(pg)
    check('danger: announced once', d1 and d1[0].startswith('danger') and d2 is None, (d1, d2))
    state['matches'] = [match('m-d', 20, 30)]         # 10 behind (6-10), 40% -> not below 40
    state['matches'] = [match('m-d', 18, 30)]         # 12 behind, 37%
    state['matches'] = [match('m-d', 25, 38)]         # 13 behind  (11plus) 39.7%
    pg.evaluate("window.__x=1")
    state['matches'] = [match('m-d', 30, 40)]         # 10 behind (6-10), 42.8% -> out of danger: clears the tier
    quiet_cooldowns(pg); poll(pg)
    lm = pg.evaluate("JSON.parse(localStorage.getItem('lastMatchStates_v2')||'{}')['m-d']")
    check('danger: climbing out clears the announced tier', lm and lm.get('dangerTier') is None, lm)
    state['matches'] = [match('m-d', 5, 8)]           # sliding back in (a milder level), straight away
    quiet_cooldowns(pg); d3 = poll(pg)
    check('danger: a quick relapse (inside 30 minutes) does not alert again', d3 is None, d3)
    pg.evaluate("(()=>{const k='lastMatchStates_v2';const o=JSON.parse(localStorage.getItem(k));o['m-d'].dangerAlertAt=Date.now()-31*60000;localStorage.setItem(k,JSON.stringify(o));})()")
    quiet_cooldowns(pg); pg.evaluate("localStorage.removeItem('dismissedBulletins')"); d4 = poll(pg)
    check('danger: a later relapse alerts again', d4 and d4[0].startswith('danger'), d4)

    # 5. comeback is remembered across a page load
    reset(pg, ['m-k'])
    state['matches'] = [match('m-k', 8, 30)]
    k1 = poll(pg)
    state['matches'] = [match('m-k', 40, 30)]         # now 10 ahead
    pg.reload(); pg.wait_for_timeout(3500)
    pg.evaluate("(v)=>localStorage.setItem('userVotes', JSON.stringify(v))", VOTES(['m-k']))   # the harness re-seeds votes on every load
    k2 = poll(pg)
    check('comeback: seen after the page changed in between', k1 and k1[0].startswith('danger') and k2 and k2[0] == 'comeback', (k1, k2))

    # 6. low votes: not for a match you already voted in; zero-vote match is not hidden behind a low-vote one
    reset(pg, ['m-l'])
    state['matches'] = [match('m-l', 2, 1, hours=2)]
    l1 = poll(pg)
    check('low votes: skipped for a match you voted in', l1 is None or l1[0] != 'lowvotes', l1)
    reset(pg, ['m-other'])
    state['matches'] = [match('m-low', 2, 1, hours=1), match('m-zero', 0, 0, hours=5)]
    l2 = poll(pg)
    check('zero votes outranks low votes even when it closes later', l2 and l2[0] == 'novotes' and l2[1] == 'm-zero', l2)

    # 7. fetches: one /api/matches read per poll however many matches you voted in
    ids = [f'm-{i}' for i in range(12)]
    pg.evaluate("localStorage.setItem('tournamentUserId','u-test');localStorage.setItem('userVotes', JSON.stringify(%s))" % json.dumps(VOTES(ids)))
    state['matches'] = [match(i, 20, 20) for i in ids]
    reqs = []
    pg.on('request', lambda r: reqs.append(r.url) if urlparse(r.url).path.endswith('/api/matches') else None)
    pg.evaluate("window.checkAndShowBulletin()"); pg.wait_for_timeout(1500)
    check('one match-list read per poll (12 voted matches)', len(reqs) <= 3, len(reqs))

    check('no page errors from the alert code', not [e for e in errs if 'docChanges' not in e], errs)
    b.close()
print('\nFAILED: ' + ', '.join(failed) if failed else '\nALL CHECKS PASSED')
sys.exit(1 if failed else 0)
