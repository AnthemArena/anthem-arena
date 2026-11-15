# Optional browser test of the REAL matches page (matches.html + js/matches.js) with mocked Firebase and a mocked /api/matches.
# Needs Python + playwright with chromium:   pip install playwright && playwright install chromium
#   python3 tools/test-matches-browser.py            (screenshots go to /tmp/matches-shots)
# Fixtures come from tools/test-support/bracket-fixtures.mjs (the real builders and the real data/edits.json).
import os, sys, json, subprocess, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/matches-shots'
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
    pg.goto(f'http://127.0.0.1:{PORT}/matches.html')
    pg.wait_for_selector('.match-card, .no-results', timeout=15000)
    pg.wait_for_timeout(1300)     # the page fades its sections in (fadeInUp); let that finish so screenshots show the settled state
    return pg, errs


vis = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector({json.dumps(sel)});return !!e&&getComputedStyle(e).display!=='none'&&e.offsetParent!==null}})()")
chips = lambda pg: pg.eval_on_selector_all('.mt-chip', 'els=>els.map(e=>e.innerText.replace(/\\s+/g," ").trim())')
active = lambda pg: pg.eval_on_selector('.mt-chip.active', 'e=>e.dataset.status')
ids = lambda pg: pg.eval_on_selector_all('.match-card', 'els=>els.map(e=>e.dataset.matchId)')

with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs = load(b, 'groups-mid-16')
    check('page is called Matches, with no stats card, intro, tip or Explore grid', pg.inner_text('h1').strip() == 'Matches' and pg.title().startswith('Matches') and not any(pg.query_selector(s) for s in ['.archive-stats', '.page-intro', '.filter-tip', '.quick-links-section', '.load-more-container', '.clear-filters-btn']))
    check('status dropdown is replaced by chips', pg.query_selector('select#status-filter') is None and len(chips(pg)) == 5, chips(pg))
    print('   chips:', chips(pg), 'active:', active(pg), 'cards:', len(ids(pg)))
    check('opens on Needs your vote', active(pg) == 'needs')
    check('count is about what you are looking at', pg.inner_text('#results-count').strip() == '6 matches need your vote', pg.inner_text('#results-count'))
    check('search box has an accessible name', pg.get_attribute('#search-input', 'aria-label') is not None)
    check('Reset is hidden while everything is at its default', not vis(pg, '#reset-btn'))
    check('chips come before the search box', pg.eval_on_selector('#status-chips', 'e=>e.getBoundingClientRect().top') < pg.eval_on_selector('#search-input', 'e=>e.getBoundingClientRect().top'))
    check('one tournament: the Tournament dropdown is hidden', not vis(pg, '#tournament-group'))
    check('no Live pill when every card is live', pg.locator('.match-card .live-badge:visible').count() == 0)
    check('card header is one line: tournament and round side by side', pg.eval_on_selector('.match-card .match-header', 'h=>{const t=h.querySelector(".match-tournament").getBoundingClientRect(), r=h.querySelector(".match-round").getBoundingClientRect(); return Math.abs(t.top-r.top)<8 && getComputedStyle(h.querySelector(".match-round")).borderLeftWidth==="0px"}'))
    pg.fill('#search-input', 'zzzz-no-such-edit'); pg.wait_for_timeout(200)
    check('Reset appears once something is non-default, and puts things back', vis(pg, '#reset-btn'))
    pg.click('#reset-btn'); pg.wait_for_timeout(200)
    check('Reset hides again and the search is cleared', not vis(pg, '#reset-btn') and pg.input_value('#search-input') == '' and len(ids(pg)) == 6)
    # blind voting: nothing about seed / creator / year on unvoted live cards
    live = pg.locator('.match-card.live:not(.user-voted)')
    check('unvoted live cards hide seed, creator and year', live.count() > 0 and pg.locator('.match-card.live:not(.user-voted) .competitor-rank').count() == 0 and pg.locator('.match-card.live:not(.user-voted) .competitor-source').count() == 0, live.count())
    check('unvoted live card alt text leaves out the creator', all(' by ' not in (a or '') for a in pg.eval_on_selector_all('.match-card.live:not(.user-voted) img', 'els=>els.map(e=>e.alt)')))
    pg.click('.mt-chip[data-status="completed"]')
    check('finished cards show seed and creator', pg.locator('.match-card.completed .competitor-source').count() > 0)
    errs_all = list(errs); pg.context.close()
    check('no uncaught page errors', not errs_all, errs_all[:3])

    # voted: one vote recorded the vote-page way (vote_<cup>_<id>), another the my-votes way (userVotes)
    cup = [l for l in open(os.path.join(ROOT, 'js/arcane-config.js')).read().splitlines() if 'tournamentId:' in l][0].split("'")[1]
    liveM = sorted([m for m in json.load(open(f'{FIX}/groups-mid-16.json')) if m['status'] == 'live'], key=lambda m: m['matchId'])
    a, c = liveM[0]['matchId'], liveM[1]['matchId']
    init = f"localStorage.setItem('vote_{cup}_{a}','song2');localStorage.setItem('userVotes',JSON.stringify({{'{c}':{{songId:'song1'}}}}));"
    pg, errs = load(b, 'groups-mid-16', init=init)
    n_live = len(liveM)
    counts = pg.eval_on_selector_all('.mt-chip-count', 'els=>els.map(e=>+e.innerText)')
    check('Needs your vote counts both kinds of stored vote', counts[0] == n_live - 2 and counts[2] == 2, counts)
    pg.click('.mt-chip[data-status="voted"]')
    check('the Live pill is back where states are mixed (Voted view)', pg.locator('.match-card .live-badge, .match-card .voted-badge').count() > 0)
    check('Voted chip lists the two voted matches', sorted(ids(pg)) == sorted([a, c]), ids(pg))
    check('voted cards say Your pick and now show seed/creator', pg.locator('.your-pick').count() == 2 and pg.locator('.match-card.user-voted .competitor-source').count() > 0)
    pg.click('.mt-chip[data-status="needs"]')
    check('Needs your vote excludes them', a not in ids(pg) and c not in ids(pg))
    pg.click('.mt-chip[data-status="voted"]'); pg.click('#reset-btn')
    check('Reset goes back to Needs your vote', active(pg) == 'needs')
    pg.context.close()

    # everything voted: falls back to Live with a caught-up line; Needs shows the caught-up state
    allv = ''.join(f"localStorage.setItem('vote_{cup}_{m['matchId']}','song1');" for m in liveM)
    pg, errs = load(b, 'groups-mid-16', init=allv)
    check('all voted: opens on Live with a caught-up line', active(pg) == 'live' and vis(pg, '#caught-up'), (active(pg), vis(pg, '#caught-up')))
    pg.click('.mt-chip[data-status="needs"]')
    check('all voted: Needs your vote says you are all caught up', 'all caught up' in pg.inner_text('#matches-grid').lower(), pg.inner_text('#matches-grid')[:100])
    pg.context.close()

    # closing soonest: live matches ordered by end date
    def mut(ms):
        live = [m for m in ms if m['status'] == 'live']
        for i, m in enumerate(live): m['endDate'] = f'2099-01-{10 + (len(live) - i):02d}T00:00:00Z'
        return ms
    pg, errs = load(b, 'groups-mid-16', mutate=mut)
    want = [m['matchId'] for m in sorted([m for m in mut(json.load(open(f'{FIX}/groups-mid-16.json'))) if m['status'] == 'live'], key=lambda m: m['endDate'])]
    check('live matches are ordered by closing soonest', ids(pg) == want, (ids(pg)[:3], want[:3]))
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300)
    check('phone: chips are one row, 44px tall, with a tick on the active one', pg.eval_on_selector_all('.mt-chip', 'els=>new Set(els.map(e=>Math.round(e.getBoundingClientRect().top))).size')==1 and pg.eval_on_selector_all('.mt-chip', 'els=>els.every(e=>e.getBoundingClientRect().height>=44)') and pg.eval_on_selector('.mt-chip.active', 'e=>getComputedStyle(e,"::before").content').strip('"') == '\u2713')
    check('phone: the filter dropdowns are behind a Filters button', vis(pg, '#filters-toggle') and not vis(pg, '#round-filter'))
    pg.click('#filters-toggle'); check('phone: Filters opens the dropdowns', vis(pg, '#round-filter') and pg.get_attribute('#filters-toggle', 'aria-expanded') == 'true')
    pg.select_option('#sort-filter', 'votes-desc'); pg.wait_for_timeout(200)
    check('phone: the badge counts non-default filters and Reset appears', pg.inner_text('#filters-badge').strip() == '1' and vis(pg, '#reset-btn'))
    pg.click('#reset-btn'); pg.wait_for_timeout(200)
    check('phone: first card starts within the first screen', pg.eval_on_selector('.match-card', 'e=>e.getBoundingClientRect().top') < 844, pg.eval_on_selector('.match-card', 'e=>e.getBoundingClientRect().top'))
    check('phone: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
    pg.screenshot(path=f'{SHOTS}/matches-phone.png')
    pg.context.close()

    # 24 at a time: 60 finished matches in the All view
    def many(ms):
        base = [m for m in ms if m['status'] == 'completed']
        out = list(ms)
        for i in range(40):
            c = dict(base[i % len(base)]); c['matchId'] = f"extra-{i}"; out.append(c)
        return out
    pg, errs = load(b, 'groups-mid-16', mutate=many)
    pg.click('.mt-chip[data-status="all"]'); pg.wait_for_timeout(300)
    total = int(pg.eval_on_selector('#status-chips .mt-chip.active .mt-chip-count', 'e=>e.innerText'))
    check('All view shows 24 cards first, with "Showing 24 of N"', len(ids(pg)) == 24 and pg.inner_text('#show-more-info').strip() == f'Showing 24 of {total}', (len(ids(pg)), pg.inner_text('#show-more-info')))
    pg.click('#show-more-btn'); pg.wait_for_timeout(200)
    check('Show more adds the next 24', len(ids(pg)) == 48)
    pg.click('#show-more-btn'); pg.wait_for_timeout(200)
    check('the button goes away when nothing is left', len(ids(pg)) == total and not vis(pg, '#show-more-wrap'), (len(ids(pg)), total))
    pg.click('.mt-chip[data-status="needs"]'); pg.wait_for_timeout(200)
    check('switching chip starts again from the first page', len(ids(pg)) <= 24)
    pg.context.close()
    b.close()

print()
print('ALL CHECKS PASSED' if not failed else f'{len(failed)} FAILED: ' + '; '.join(failed))
sys.exit(1 if failed else 0)
