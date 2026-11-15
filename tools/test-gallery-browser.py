# Optional browser test of the REAL edits gallery (music-gallery.html + js/music-gallery.js) with mocked /api/matches and edits.json.
#   python3 tools/test-gallery-browser.py            (screenshots go to /tmp/gallery-shots)
import os, sys, json, subprocess, threading, http.server, socketserver, functools, re, base64
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/gallery-shots'
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
songs = {}
for m in matches:
    for k in ('song1', 'song2'):
        s = m[k]
        if s['id'] not in songs: songs[s['id']] = s
edits = [{'id': s['id'], 'videoId': s['videoId'], 'title': s['title'], 'shortTitle': s.get('shortTitle') or s['title'], 'artist': s['artist'],
          'creatorUrl': '', 'channelId': s.get('channelId', ''), 'characters': ['Jinx'], 'tournaments': ['jinx-cup-1'], 'views': 1000 * (i + 1),
          'likes': 100 * (i + 1), 'year': 2025, 'duration': 30, 'aspect': '9:16', 'status': 'ok', 'embedAllowed': True}
         for i, s in enumerate(songs.values())]

# extras: 20 edits not in any match ("Entered"), one with a null like count, one that also carries an internal test cup, one only in a test cup
for i in range(20):
    edits.append({'id': f'extra-{i}', 'videoId': f'extraVid{i:04d}', 'title': f'Extra edit {i}', 'shortTitle': f'Extra edit {i}', 'artist': f'Extra Maker {i}',
                  'creatorUrl': '', 'characters': ['Jinx'], 'tournaments': ['jinx-cup-1'], 'views': 50 + i, 'likes': None if i == 0 else 5 + i, 'year': 2025,
                  'duration': 20, 'aspect': '1:1', 'status': 'ok', 'embedAllowed': True})
edits[0]['tournaments'] = ['jinx-cup-1', 'group-test-01', 'arcane-test-01']
edits.append({'id': 'test-only', 'videoId': 'testOnly001', 'title': 'Test only edit', 'shortTitle': 'Test only edit', 'artist': 'Test Maker', 'creatorUrl': '',
              'characters': ['Jinx'], 'tournaments': ['group-test-01'], 'views': 1, 'likes': 1, 'year': 2025, 'duration': 10, 'aspect': '9:16', 'status': 'ok', 'embedAllowed': True})
VISIBLE = len(edits) - 1

def load(browser, width, height, votes=None):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    if votes: ctx.add_init_script(f"localStorage.setItem('userVotes', {json.dumps(json.dumps(votes))})")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif path.endswith('/data/edits.json'): r.fulfill(body=json.dumps(edits), content_type='application/json')
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com') or u.startswith('https://img.youtube.com'): r.fulfill(body=PNG, content_type='image/png')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/music-gallery.html')
    pg.wait_for_timeout(3000)
    return pg, errs

rect = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector({json.dumps(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom}}}})()")

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        n = pg.locator('.edit-card').count()
        check(f'{tag}: the first page shows 24 cards, not all {VISIBLE}', n == 24, n)
        check(f'{tag}: the count says "24 of {VISIBLE} edits"', pg.inner_text('#editCount').strip() == f'24 of {VISIBLE} edits', pg.inner_text('#editCount'))
        more = pg.locator('#showMoreBtn')
        check(f'{tag}: a "Show 12 more" button is offered', more.is_visible() and more.inner_text().strip() == f'Show {VISIBLE - 24} more', more.inner_text())
        first_badges = pg.eval_on_selector_all('.edit-badge', 'els=>els.map(e=>e.textContent.trim())')
        check(f'{tag}: live edits come first with "Group X · Live" badges', first_badges[0].endswith('· Live') and re.match(r'^Group \w+ · Live$', first_badges[0]), first_badges[:3])
        lives = [t for t in first_badges if t.endswith('· Live')]
        check(f'{tag}: live badges come before every other badge', first_badges[:len(lives)] == lives, first_badges[:14])
        more.click(); pg.wait_for_timeout(300)
        n = pg.locator('.edit-card').count()
        check(f'{tag}: Show more adds the rest ({VISIBLE})', n == VISIBLE and not pg.locator('#showMoreWrap').is_visible(), n)
        check(f'{tag}: the count drops the "of" once everything is shown', pg.inner_text('#editCount').strip() == f'{VISIBLE} edits', pg.inner_text('#editCount'))
        check(f'{tag}: an edit only in a test cup is not listed', pg.locator('[data-id="test-only"]').count() == 0)
        txt = pg.inner_text('.edit-grid')
        check(f'{tag}: no "Test" tag or cup name anywhere in the grid', not re.search(r'test', txt, re.I), re.findall(r'.{0,10}test.{0,10}', txt, re.I)[:3])
        check(f'{tag}: identical Jinx / Jinx Cup 1 pills are hidden while there is one of each', pg.locator('.edit-pills').count() == 0 and pg.locator('.pill').count() == 0)
        check(f'{tag}: the Cup dropdown stays hidden', not pg.locator('#cupFilter').is_visible())
        check(f'{tag}: the Status dropdown is gone (chips instead)', pg.locator('#statusFilter').count() == 0)
        chips = pg.eval_on_selector_all('#statusChips .chip', 'els=>els.map(e=>e.textContent.replace(/\\s+/g," ").trim())')
        check(f'{tag}: status chips with counts: All, Live, In the bracket, Finished their run, Entered', chips[0] == f'All {VISIBLE}' and any(c.startswith('Live ') for c in chips) and any(c.startswith('Finished their run ') for c in chips) and any(c == 'Entered 20' for c in chips) and not any(c.startswith('Champions') for c in chips), chips)
        check(f'{tag}: card stats are Views, Likes, Year', pg.eval_on_selector_all('.edit-card:first-child .edit-stats dt', 'els=>els.map(e=>e.textContent.trim())') == ['Views', 'Likes', 'Year'])
        dds = pg.eval_on_selector_all('.edit-stats dd', 'els=>els.map(e=>e.textContent.trim())')
        check(f'{tag}: a missing like count says n/a, not a bare dash', 'n/a' in dds and not any(d in ('–', '-') for d in dds), sorted(set(dds))[:6])
        badges = pg.eval_on_selector_all('.edit-badge', 'els=>els.map(e=>e.textContent.trim())')
        check(f'{tag}: no badge says "Out"', all(not re.search(r'\bout\b', t, re.I) for t in badges), badges)
        check(f'{tag}: a finished group shows "Through to the knockout" and "Group stage"', 'Through to the knockout' in badges and 'Group stage' in badges, sorted(set(badges)))
        check(f'{tag}: no win-loss record on any card', pg.locator('.edit-stats dt', has_text='Record').count() == 0)
        check(f'{tag}: no "1-2" style records anywhere in the grid', not re.search(r'(?<![\d:])\d\s*[–-]\s*\d(?![\d:])', txt), re.findall(r'.{0,12}\d\s*[–-]\s*\d.{0,12}', txt)[:3])
        check(f'{tag}: the "Keep exploring" pill links are gone', pg.locator('.gallery-next, .next-link').count() == 0)
        check(f'{tag}: the tagline is the short one', pg.inner_text('.gallery-subtitle').strip() == 'Every fan edit that has entered an Arcane Moments cup. Tap one to watch it.', pg.inner_text('.gallery-subtitle'))
        check(f'{tag}: the removal email address is shown beside the button', 'arcanemomentsfanpage@gmail.com' in pg.inner_text('.gallery-creators'), pg.inner_text('.gallery-creators'))
        check(f'{tag}: no share band on the gallery (profile page only)', pg.locator('.footer-cta-banner').count() == 0)

        # blind voting: a live edit hides creator, views and likes until the viewer has voted in its match
        live = pg.locator('.edit-card.is-live').first
        lid = live.get_attribute('data-id'); ledit = [e for e in edits if e['id'] == lid][0]
        ltxt = live.inner_text()
        check(f'{tag}: a live edit hides its creator, views and likes before you vote', ledit['artist'] not in ltxt and '1.0K' not in ltxt and ltxt.count('Hidden') == 2 and 'after you vote' in ltxt, ltxt)
        pg.fill('#searchInput', ledit['artist']); pg.wait_for_timeout(300)
        check(f'{tag}: searching a hidden live creator finds nothing', pg.locator(f'[data-id="{lid}"]').count() == 0 and '0 edits' in pg.inner_text('#editCount'), pg.inner_text('#editCount'))
        pg.fill('#searchInput', ''); pg.wait_for_timeout(300)
        pg.locator('.show-more-btn:visible').click() if pg.locator('.show-more-btn:visible').count() else None
        pg.locator(f'[data-id="{lid}"] .edit-title').click(); pg.wait_for_timeout(300)
        check(f'{tag}: tapping anywhere on a card opens the player', pg.evaluate("document.getElementById('watchDialog').open"))
        meta = pg.inner_text('#watchMeta')
        check(f'{tag}: the player of a hidden live edit shows no creator and no YouTube link, but Vote now and Request removal', ledit['artist'] not in meta and 'Watch on YouTube' not in meta and 'Vote now' in meta and 'Request removal' in meta, meta)
        rm = pg.get_attribute('#watchMeta .watch-removal', 'href') or ''
        check(f'{tag}: the player removal link is a mailto naming the edit', rm.startswith('mailto:arcanemomentsfanpage@gmail.com') and 'removal' in rm.lower(), rm)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.locator('.edit-card:not(.is-live) .edit-title').first.click(); pg.wait_for_timeout(300)
        check(f'{tag}: a finished edit shows its creator in the player', 'Watch on YouTube' in pg.inner_text('#watchMeta') and 'Request removal' in pg.inner_text('#watchMeta'), pg.inner_text('#watchMeta'))
        # the player is big (no card around it) and the title row, picture and credit line all fit the window
        _fr, _hd, _mt = rect(pg, '.watch-frame-wrap'), rect(pg, '.watch-head'), rect(pg, '#watchMeta')
        _h = pg.evaluate('innerHeight')
        check(f'{tag}: the player fits the window with its title row and credit line', _hd and _mt and _fr and _hd['y'] >= 0 and _mt['b'] <= _h + 1 and _fr['x'] >= 0 and _fr['r'] <= w + 1, (_hd, _fr, _mt, _h))
        check(f'{tag}: the picture is tall (uses most of the window height)', _fr['h'] >= min(0.6 * _h, 700) or _fr['w'] >= 0.85 * w * 0.94 or _fr['w'] >= 1000, (_fr, _h))
        pg.screenshot(path=f'{SHOTS}/gallery-player-{tag}.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check(f'{tag}: the card button is not a wall of outlined buttons (only live cards have a filled Vote now)', pg.locator('.edit-vote').count() == pg.locator('.edit-card.is-live').count() and pg.locator('.edit-bracket-link').count() > 0)
        sts = pg.eval_on_selector_all('.edit-card', 'els=>els.map(e=>Math.round(e.querySelector(".edit-stats").getBoundingClientRect().bottom-e.getBoundingClientRect().top))')
        check(f'{tag}: the stats row is pinned at the same height inside every card of a row', len(set(sts[:2])) == 1, sts[:4])
        href = pg.get_attribute('a[data-creator-mail]', 'href') or ''
        check(f'{tag}: the creator removal link is a mailto to the right address with a subject', href.startswith('mailto:arcanemomentsfanpage@gmail.com?subject=Edit%20removal%20request'), href)
        fl = pg.locator('.footer-email-link')
        check(f'{tag}: the footer email link points to the new address (filled in after the footer loads)', fl.count() == 1 and fl.get_attribute('href') == 'mailto:arcanemomentsfanpage@gmail.com' and 'arcanemomentsfanpage@gmail.com' in fl.inner_text(), (fl.get_attribute('href'), fl.inner_text()) if fl.count() else 'no footer link')
        cta = rect(pg, '.creators-btn')
        check(f'{tag}: the removal button is visible and fits the screen', cta and cta['x'] >= 0 and cta['r'] <= w, cta)
        pg.click('#statusChips .chip[data-status="eliminated"]'); pg.wait_for_timeout(300)
        only = pg.eval_on_selector_all('.edit-badge', 'els=>els.map(e=>e.textContent.trim())')
        check(f'{tag}: the "Finished their run" filter keeps only edits whose group is over and who did not go through', only and set(only) == {'Group stage'}, only)
        pg.click('#statusChips .chip[data-status=""]'); pg.wait_for_timeout(200)
        check(f'{tag}: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check(f'{tag}: no page errors', not errs, errs)
        pg.screenshot(path=f'{SHOTS}/{tag}.png')
    # after voting in a live match, its edits show creator and stats again
    pg, errs = load(b, 1280, 900)
    mid = pg.locator('.edit-card.is-live').first.get_attribute('data-id')
    lm = [m for m in matches if m['status'] == 'live' and mid in (m['song1']['id'], m['song2']['id'])][0]
    pg.close()
    pg, errs = load(b, 1280, 900, votes={lm['matchId']: {'songId': lm['song1']['id']}})
    c = pg.locator(f'[data-id="{mid}"]'); t = c.inner_text()
    check('voted: the edits of that match show creator and stats again', [e for e in edits if e['id'] == mid][0]['artist'] in t and 'Hidden' not in t, t)
    other = [x for x in pg.locator('.edit-card.is-live').all() if x.get_attribute('data-id') not in (lm['song1']['id'], lm['song2']['id'])]
    check('voted: edits in other live matches stay hidden', not other or 'Hidden' in other[0].inner_text(), other[0].inner_text() if other else '')
    pg.screenshot(path=f'{SHOTS}/voted.png')
    b.close()
print('\nALL CHECKS PASSED' if not failed else f'\n{len(failed)} FAILED')
sys.exit(1 if failed else 0)
