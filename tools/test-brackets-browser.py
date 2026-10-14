# Optional browser test of the REAL brackets page (brackets.html + js/brackets.js) with mocked Firebase and a mocked /api/matches.
# Needs Python + playwright with chromium:   pip install playwright && playwright install chromium
#   python3 tools/test-brackets-browser.py            (screenshots go to /tmp/brackets-shots)
# Fixtures come from tools/test-support/bracket-fixtures.mjs (the real builders and the real data/edits.json).
import os, sys, json, subprocess, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/brackets-shots'
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
        elif u.startswith('https://img.youtube.com'): r.fulfill(body='', content_type='image/jpeg')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/brackets.html')
    pg.wait_for_function("document.getElementById('bracketLoadingState') && getComputedStyle(document.getElementById('bracketLoadingState')).display==='none'", timeout=15000)
    pg.wait_for_timeout(1300)     # the page fades its sections in (fadeInUp); let that finish so screenshots show the settled state
    return pg, errs

vis = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector({json.dumps(sel)});return !!e&&getComputedStyle(e).display!=='none'&&e.offsetParent!==null}})()")
txt = lambda pg, sel: pg.inner_text(sel).strip()
info = lambda pg: [e.strip() for e in pg.eval_on_selector_all('.tournament-info .info-value', 'els=>els.map(e=>e.innerText)')]
cards = lambda pg: pg.eval_on_selector_all('.gs-card', 'els=>els.filter(e=>!e.hidden).map(e=>e.dataset.group)')

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- 1. a group cup mid-way ----------
    pg, errs = load(b, 'groups-mid-16')
    check('groups: tabs shown, Groups tab active', vis(pg, '#stageTabsSection') and 'active' in pg.get_attribute('.stage-tab[data-stage="groups"]', 'class'))
    check('groups: group section visible, bracket hidden', vis(pg, '#groupStageSection') and not vis(pg, '#bracketSection'))
    check('groups: 4 group cards (A-D)', cards(pg) == ['A', 'B', 'C', 'D'], cards(pg))
    check('groups: info panel (status, edits, progress, format)', info(pg) == ['Group Stage - 6 Live Matches', '16', '14 / 24 Group Matches', 'Group Stage + Knockout'], info(pg))
    q = lambda g: pg.eval_on_selector(f'#group-{g}', "e=>({q:e.querySelectorAll('.gs-pill-in').length,out:e.querySelectorAll('.gs-pill-out').length,open:e.querySelector('details').open,state:e.dataset.state,rows:e.querySelectorAll('.gs-row').length})")
    a, bb, c, d = q('A'), q('B'), q('C'), q('D')
    check('finished group A says Qualified x2 / Out x2', a['q'] == 2 and a['out'] == 2 and a['state'] == 'complete', a)
    check('groups still in play never say Qualified or Out', all(x['q'] == 0 and x['out'] == 0 for x in (c, d)), (c, d))
    check('live group opens its matches; finished one stays closed', c['open'] and c['state'] == 'live' and not a['open'], (c, a))
    check('every card has 4 table rows', all(x['rows'] == 4 for x in (a, bb, c, d)))
    check('live match links go to the vote page', pg.get_attribute('#group-C .gs-match.live a', 'href').startswith('vote?match=jinx-cup-1-group-C-match-'))
    check('live match shows no percentages (does not sway votes)', pg.eval_on_selector('#group-C', "e=>e.querySelectorAll('.gs-pct').length") == 0)
    check('finished match shows percentages', pg.eval_on_selector('#group-A', "e=>e.querySelectorAll('.gs-pct').length") == 12)
    check('stats card says Current Round = Group Stage', 'Group Stage' in txt(pg, '.stat-card:nth-child(1)'), txt(pg, '.stat-card:nth-child(1)'))
    pg.screenshot(path=f'{SHOTS}/groups-mid-16-desktop.png')
    pg.locator('#groupStageSection').screenshot(path=f'{SHOTS}/groups-section.png')

    # filters
    pg.click('.gs-chip[data-filter="live"]'); check('filter: Live now shows only group C', cards(pg) == ['C'], cards(pg))
    pg.click('.gs-chip[data-filter="complete"]'); check('filter: Finished shows A and B', cards(pg) == ['A', 'B'], cards(pg))
    pg.click('.gs-chip[data-filter="all"]'); check('filter: All shows all four again', cards(pg) == ['A', 'B', 'C', 'D'])
    check('filter chip counts', pg.eval_on_selector_all('.gs-chip-count', 'els=>els.map(e=>e.innerText)') == ['4', '1', '2'], pg.eval_on_selector_all('.gs-chip-count', 'els=>els.map(e=>e.innerText)'))

    # tabs
    pg.click('.stage-tab[data-stage="knockout"]')
    check('knockout tab: bracket section and note visible, groups hidden', vis(pg, '#bracketSection') and vis(pg, '.ko-note') and not vis(pg, '#groupStageSection'))
    check('knockout tab: no empty bracket columns shown', not vis(pg, '#bracketRounds'))
    check('knockout tab: note names the first knockout round', 'Quarter-finals' in txt(pg, '.ko-note'), txt(pg, '.ko-note'))
    check('knockout tab: URL hash updated', pg.evaluate('location.hash') == '#knockout')
    pg.wait_for_timeout(1300); pg.screenshot(path=f'{SHOTS}/knockout-note.png')
    pg.click('.ko-note-btn'); check('note button goes back to the groups', vis(pg, '#groupStageSection') and not vis(pg, '#bracketSection') and pg.evaluate('location.hash') == '#groups')

    # a finished match opens the results view (or at least does not navigate away) ; an open one links to the vote page
    url0 = pg.url
    pg.click('#group-A summary'); pg.click('#group-A .gs-match a >> nth=0'); time.sleep(0.3)
    check('finished match click stays on the page (results view)', pg.url == url0, pg.url)
    check('finished match click opens the results modal', pg.evaluate("(()=>{const m=document.querySelector('.modal, .match-modal, #matchModal, [class*=modal]');return !!m&&getComputedStyle(m).display!=='none'})()"), None)
    check('no uncaught page errors (group cup)', not [e for e in errs if 'notification' not in e.lower()], errs)
    pg.context.close()

    # ---------- 2. groups finished, knockout not built ----------
    pg, errs = load(b, 'groups-done-16')
    check('groups done: status says knockout is next, and NOT a champion', info(pg)[0] == '✅ Groups complete - knockout next' and info(pg)[2] == '24 / 24 Group Matches', info(pg))
    check('groups done: opens on the groups tab, 8 Qualified pills', pg.eval_on_selector_all('.gs-pill-in', 'e=>e.length') == 8 and vis(pg, '#groupStageSection'))
    pg.context.close()

    # ---------- 3. knockout built and live ----------
    pg, errs = load(b, 'knockout-live-16')
    check('knockout live: opens on the Knockout tab', vis(pg, '#bracketSection') and not vis(pg, '#groupStageSection') and 'active' in pg.get_attribute('.stage-tab[data-stage="knockout"]', 'class'))
    titles = pg.eval_on_selector_all('#bracketRounds .round-title', 'els=>els.map(e=>e.textContent.trim())')
    check('knockout columns: Quarter-finals, Semi-finals, Final (no group matches in the bracket)', titles == ['Quarter-finals', 'Semi-finals', 'Final'], titles)
    check('knockout columns hold 4, 2, 1 matches', pg.eval_on_selector_all('#bracketRounds .matchups-column', 'els=>els.map(e=>e.querySelectorAll(".matchup-card").length)') == [4, 2, 1])
    check('knockout: no note once built', pg.eval_on_selector('#knockoutNote', 'e=>e.innerHTML.trim()') == '')
    check('knockout: later rounds name their source round, not "R2"', 'Winner of Quarter-finals M1' in pg.inner_text('#bracketRounds'), pg.inner_text('#bracketRounds')[:300])
    check('knockout: info panel', info(pg) == ['Quarter-finals - 2 Live Matches', '16', '24 / 31 Matches', 'Group Stage + Knockout'], info(pg))
    check('knockout: tab says how many edits', '8 edits' in txt(pg, '.stage-tab[data-stage="knockout"]'))
    check('knockout: final card is the championship match', 'Championship Match' in pg.inner_text('#bracketRounds .finals'))
    pg.locator('#stageTabsSection').scroll_into_view_if_needed(); pg.screenshot(path=f'{SHOTS}/knockout-live-desktop.png')
    pg.locator('#bracketSection').screenshot(path=f'{SHOTS}/knockout-live-bracket.png')
    pg.click('.stage-tab[data-stage="groups"]'); check('knockout built: groups tab still available with 8 Qualified', vis(pg, '#groupStageSection') and pg.eval_on_selector_all('.gs-pill-in', 'e=>e.length') == 8)
    pg.context.close()

    # ---------- 4. single elimination must be unchanged ----------
    pg, errs = load(b, 'single-16')
    check('single elimination: no tabs, no group section', not vis(pg, '#stageTabsSection') and not vis(pg, '#groupStageSection') and pg.eval_on_selector('#stageTabsSection', 'e=>e.innerHTML.trim()') == '' and pg.eval_on_selector('#groupStageSection', 'e=>e.innerHTML.trim()') == '')
    check('single elimination: bracket visible with 4 rounds', vis(pg, '#bracketSection') and pg.eval_on_selector_all('#bracketRounds .round-title', 'els=>els.map(e=>e.textContent.trim())') == ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'], pg.eval_on_selector_all('#bracketRounds .round-title', 'els=>els.map(e=>e.textContent.trim())'))
    check('single elimination: info panel', info(pg) == ['Round of 16 - 2 Live Matches', '16', '4 / 15 Matches', 'Single Elimination'], info(pg))
    check('single elimination: later rounds still say "Winner of R1 M1"', 'Winner of R1 M1' in pg.inner_text('#bracketRounds'))
    pg.locator('#bracketSection').screenshot(path=f'{SHOTS}/single-16-bracket.png')
    check('no uncaught page errors (single elimination)', not [e for e in errs if 'notification' not in e.lower()], errs)
    pg.context.close()

    # ---------- 5. escaping: a hostile YouTube title must not run ----------
    def hostile(ms):
        for m in ms:
            if m.get('group') == 'A' and m['matchNumber'] == 1:
                m['song1']['shortTitle'] = '<img src=x onerror="window.__xss=1">'; m['song1']['artist'] = '"><script>window.__xss=2</script>'
        return ms
    pg, errs = load(b, 'groups-mid-16', mutate=hostile)
    check('hostile titles are shown as text and never run', pg.evaluate('window.__xss') is None and 'onerror' in pg.inner_text('#groupStageSection'), pg.evaluate('window.__xss'))
    pg.context.close()

    # ---------- 6. a big cup: 128 edits = 32 groups ----------
    t0 = time.time(); pg, errs = load(b, 'groups-mid-128'); dt = time.time() - t0
    check('128 edits: 32 group cards, 192 match rows', len(cards(pg)) == 32 and pg.eval_on_selector_all('.gs-match', 'e=>e.length') == 192, len(cards(pg)))
    check('128 edits: loads and draws in under 6 seconds', dt < 6, round(dt, 2))
    pg.click('.gs-chip[data-filter="live"]'); check('128 edits: Live now filter shows groups 7-9 (C,D,E style letters G-I)', len(cards(pg)) == 3, cards(pg))
    pg.click('.gs-chip[data-filter="complete"]'); check('128 edits: Finished filter shows 6 groups', len(cards(pg)) == 6, cards(pg))
    pg.click('.gs-chip[data-filter="all"]')
    check('128 edits: page does not scroll sideways at 1280px', pg.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'))
    pg.locator('#groupStageSection').screenshot(path=f'{SHOTS}/groups-128.png')
    pg.context.close()

    # ---------- 7. phones ----------
    pg, errs = load(b, 'groups-mid-16', width=390, height=844, scale=2)
    check('phone: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'), pg.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]'))
    check('phone: group cards are one column', pg.eval_on_selector_all('.gs-card', 'els=>new Set(els.map(e=>Math.round(e.getBoundingClientRect().left))).size') == 1)
    pg.locator('#stageTabsSection').scroll_into_view_if_needed(); pg.screenshot(path=f'{SHOTS}/groups-phone-top.png')
    pg.locator('#group-C').scroll_into_view_if_needed(); pg.locator('#group-C').screenshot(path=f'{SHOTS}/groups-phone-live-card.png')
    pg.locator('#group-A').screenshot(path=f'{SHOTS}/groups-phone-done-card.png')
    pg.locator('.gs-head').screenshot(path=f'{SHOTS}/groups-phone-head.png')
    check('phone: the three filter chips share one row', pg.eval_on_selector_all('.gs-chip', 'els=>new Set(els.map(e=>Math.round(e.getBoundingClientRect().top))).size') == 1)
    pg.click('.stage-tab[data-stage="knockout"]'); pg.wait_for_timeout(1300); pg.screenshot(path=f'{SHOTS}/knockout-note-phone.png')
    pg.context.close()
    # ---------- voted state: the visitor's own picks (stored by vote.js as localStorage vote_<cup>_<matchId> = song1 | song2) ----------
    cup = [l for l in open(os.path.join(ROOT, 'js/arcane-config.js')).read().splitlines() if 'tournamentId:' in l][0].split("'")[1]
    live = [m for m in json.load(open(f'{FIX}/groups-mid-16.json')) if m['status'] == 'live' and m['stage'] == 'group']
    live.sort(key=lambda m: m['matchId'])
    picks = {live[0]['matchId']: 'song2', live[1]['matchId']: 'song1'}
    init = ''.join(f"localStorage.setItem('vote_{cup}_{k}','{v}');" for k, v in picks.items())
    pg, errs = load(b, 'groups-mid-16', init=init)
    card = pg.locator('.gs-card[data-state="live"]').first
    check('voted: counter reads 2/6 voted and the header note says so', '2/6 voted' in card.inner_text().lower() and 'you voted 2/6' in card.inner_text().lower(), card.inner_text()[:200])
    card.locator('summary').scroll_into_view_if_needed()
    check('voted: 2 rows show the quiet Voted tag, 4 still say Vote', card.locator('.gs-tag-voted').count() == 2 and card.locator('.gs-tag-live').count() == 4)
    first = card.locator(f'a[data-match-id="{live[0]["matchId"]}"]')
    check('voted: second edit ticked (pick song2), first dimmed', first.locator('.gs-side').nth(1).get_attribute('class').count('gs-picked') == 1 and 'gs-dimmed' in first.locator('.gs-side').nth(0).get_attribute('class'))
    check('voted: percentages only on voted rows', card.locator('.gs-pct').count() == 4, card.locator('.gs-pct').count())
    check('voted: voted row still links to the match page', first.get_attribute('href').startswith('vote?match='))
    card.screenshot(path=f'{SHOTS}/groups-voted-card.png')
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(300)
    check('voted (phone): no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    card.screenshot(path=f'{SHOTS}/groups-voted-card-phone.png')
    check('voted: no page errors', not errs, errs)
    pg.context.close()

    b.close()

print('\n' + ('ALL CHECKS PASSED' if not failed else f'{len(failed)} FAILED'))
sys.exit(1 if failed else 0)
