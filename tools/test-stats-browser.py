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

def load(browser, scenario, width=1280, height=900, mutate=None, scale=1, init=None, cups=None, past=None, query=''):
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
        elif cups is not None and u.split('?')[0].endswith('/data/cups.json'): r.fulfill(body=json.dumps({'cups': cups}), content_type='application/json')
        elif past is not None and u.split('?')[0].endswith('/api/matches') and 'tournament=' in u: r.fulfill(body=json.dumps(past.get(u.split('tournament=')[1].split('&')[0], [])), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif u.split('?')[0].endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com'): r.fulfill(body=PNG, content_type='image/png')
        elif u.startswith('https://img.youtube.com'): r.fulfill(body='', content_type='image/jpeg')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/stats.html{query}')
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
        check('tabs are not marked "soon" once matches have finished', 'soon' not in txt(pg, '#tab-edits') and 'soon' not in txt(pg, '#tab-records'))
        check('tiles link to Matches and the Gallery with descriptive names', pg.get_attribute('a.stat-link[href="/matches"]', 'aria-label').endswith('live, open matches') and pg.get_attribute('a.stat-link[href="/music-gallery"]', 'aria-label').endswith('open the gallery'))
        check('Votes cast and Matches finished stay plain tiles', pg.locator('#pane-overview .stat-card:not(.stat-link)').count() == 2)
        check('later stages show as a muted row', pg.locator('.round-row.is-ahead').count() == 1 and 'after the groups' in pg.inner_text('.round-row.is-ahead'))
        check('no share band on the stats page (profile page only)', pg.locator('.footer-cta-banner').count() == 0)
        pg.screenshot(path=f'{SHOTS}/{label}-overview.png', full_page=True)

        tab(pg, 'edits')
        check('edits tab lists only edits with a finished match', 0 < pg.locator('.rank-row').count() < 16 and 'Live' not in pg.inner_text('#pane-edits'), pg.locator('.rank-row').count())
        check('no hashtags in edit names', '#' not in ' '.join(pg.eval_on_selector_all('.rank-title', 'e=>e.map(x=>x.innerText)')))
        first = txt(pg, '.rank-title')
        pg.select_option('#sortEdits', 'wins'); pg.wait_for_timeout(100)
        check('sort select keeps working', pg.locator('.rank-row').count() > 0 and vis(pg, '#sortEdits'))
        check('share bars carry a text label', pg.locator('.share-label').count() > 0 and '% share' in pg.inner_text('.share-label'))
        check('no sideways scroll (edits)', noscroll(pg))
        pg.screenshot(path=f'{SHOTS}/{label}-edits.png', full_page=True)

        check('there is no Groups tab, the Overview links to Brackets instead', pg.locator('#tab-groups').count() == 0 and pg.locator('#pane-overview a[href="/brackets"]').count() == 1)
        check('no "Keep exploring" pill links', pg.locator('.stats-next, .next-link').count() == 0)
        check('the All cups tab is hidden while there is one cup', not vis(pg, '#tab-allcups'))
        check('the Cup picker is not drawn while there is one cup', not vis(pg, '#cupPick'))
        pg.mouse.move(0, 0); pg.wait_for_timeout(250)
        check('active tab has a solid fill', pg.eval_on_selector('.stats-tab.is-active', "e=>getComputedStyle(e).backgroundImage.includes('gradient')"))
        stages = pg.eval_on_selector_all('#pane-overview .round-name', 'els=>els.map(e=>e.textContent)')
        check('Overview lists stages (one Group stage row), not every group', stages[0] == 'Group stage' and not any(x.startswith('Group ') and x != 'Group stage' for x in stages), stages)
        check('the live tile says "Matches live"', pg.locator('[data-stat="Matches live"]').count() == 1)

        tab(pg, 'records')
        check('records show closest finish and a link to its match', 'closest finish' in pg.inner_text('#pane-records').lower() and pg.locator('a.record-card').first.get_attribute('href').startswith('/vote?match='))
        check('no sideways scroll (records)', noscroll(pg))
        pg.screenshot(path=f'{SHOTS}/{label}-records.png', full_page=True)

        pg.evaluate("document.getElementById('tab-records').focus()"); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(150)
        check('arrow keys move between tabs (records wraps to overview, skipping the hidden All cups tab)', pg.evaluate("document.querySelector('.stats-tab.is-active').id") == 'tab-overview')
        check('no JS errors', not [e for e in errs if 'docChanges' not in e], errs)
        pg.context.close()

    print('--- upcoming cup (no votes) ---')
    pg, errs = load(b, 'groups-upcoming-16')
    check('upcoming cup: zero votes, no crash', txt(pg, '[data-stat="Votes cast"]') == '0' and not errs, errs)
    check('Edits and Records tabs say "soon" before any match has finished', 'soon' in txt(pg, '#tab-edits') and 'soon' in txt(pg, '#tab-records'))
    tab(pg, 'edits')
    check('empty Edits says which page it is, in a card, with a way forward', 'Edit rankings appear' in pg.inner_text('#pane-edits .empty-card h2') and pg.locator('#pane-edits a.empty-action[href="/#vote"]').count() == 1)
    tab(pg, 'records')
    check('records say to check back', 'first matches finish' in pg.inner_text('#pane-records') and 'Records appear' in pg.inner_text('#pane-records .empty-card h2'))
    check('the empty state says when the first matches close', 'close in' in pg.inner_text('#pane-records .empty-card p') or 'Check back' in pg.inner_text('#pane-records .empty-card p'), pg.inner_text('#pane-records .empty-card p'))
    pg.screenshot(path=f'{SHOTS}/empty-records.png', full_page=True)
    pg.context.close()

    print('--- knockout cup ---')
    pg, errs = load(b, 'knockout-live-16')
    check('knockout stages listed in progress', pg.locator('.round-row').count() >= 4, pg.locator('.round-row').count())
    check('live matches counted', int(txt(pg, '[data-stat="Matches live"]')) == 2, txt(pg, '[data-stat="Matches live"]'))
    pg.context.close()

    print('--- 128 edits ---')
    pg, errs = load(b, 'groups-mid-128', 375, 740)
    check('128 edits: the overview lists one Group stage row, not 32 groups', pg.locator('#pane-overview .round-row').count() <= 3, pg.locator('#pane-overview .round-row').count())
    check('no sideways scroll (128 edits)', noscroll(pg))
    tab(pg, 'edits')
    check('edits ranking shows at most 25 with a Show more button', pg.locator('.rank-row').count() <= 25 and (pg.locator('#editsMore').count() == 1 or pg.locator('.rank-row').count() < 25), pg.locator('.rank-row').count())
    pg.context.close()
    print('--- two cups ---')
    done = json.load(open(f'{FIX}/groups-done-16.json')); live = json.load(open(f'{FIX}/groups-mid-16.json'))
    two = [{'id': 'old-cup', 'name': 'Old Cup', 'status': 'complete', 'startDate': '2026-09-01', 'champion': 'Someone'}, {'id': 'new-cup', 'name': 'New Cup', 'status': 'active', 'startDate': '2026-10-01'}]
    pg, errs = load(b, 'groups-mid-16', cups=two, past={'old-cup': done})
    check('the All cups tab appears with two cups', vis(pg, '#tab-allcups'))
    check('picker appears with two cups', vis(pg, '#cupSelect') and pg.locator('#cupSelect option').count() == 2)
    check('live cup is selected by default', pg.eval_on_selector('#cupSelect', 'e=>e.value') == 'new-cup')
    tab(pg, 'allcups')
    check('all cups lists both cups', pg.locator('.cup-row').count() == 2, pg.locator('.cup-row').count())
    check('all cups totals add both cups', int(pg.inner_text('#pane-allcups .stat-card strong').replace(',', '')) > 0)
    pg.screenshot(path=f'{SHOTS}/allcups.png', full_page=True)
    pg.select_option('#cupSelect', 'old-cup'); pg.wait_for_timeout(500)
    check('picking the old cup says it is finished', 'finished' in pg.inner_text('#statsUpdated').lower(), pg.inner_text('#statsUpdated'))
    check('old cup has no vote links in records', pg.locator('#pane-records a.record-card').count() == 0)
    check('no page errors with two cups', not errs, errs)
    pg.context.close()
    pg, errs = load(b, 'groups-mid-16', 375, 740, cups=two, past={'old-cup': done}, query='?cup=old-cup')
    check('?cup= opens that cup', pg.eval_on_selector('#cupSelect', 'e=>e.value') == 'old-cup')
    tab(pg, 'allcups')
    check('no sideways scroll (all cups, phone)', noscroll(pg))
    pg.context.close()
    b.close()

httpd.shutdown()
print('FAILED: ' + ', '.join(failed) if failed else 'all stats browser checks passed')
sys.exit(1 if failed else 0)
