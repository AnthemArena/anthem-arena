# Optional browser test of the REAL live page (live.html + js/live.js) with a mocked /api/matches.
#   python3 tools/test-live-browser.py            (screenshots go to /tmp/live-shots)
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

matches = json.load(open(f'{FIX}/groups-mid-16.json'))
live = sorted([m for m in matches if m['status'] == 'live'], key=lambda m: m['matchId'])
VOTED = live[0]['matchId']

def load(browser, width, height):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    votes = {VOTED: {'songId': 'song2', 'songTitle': 'x', 'opponentTitle': 'y', 'timestamp': 1}}
    ctx.add_init_script(f"localStorage.setItem('username','tester');localStorage.setItem('isPublic','true');localStorage.setItem('userVotes', JSON.stringify({json.dumps(votes)}));")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com'): r.fulfill(body=PNG, content_type='image/png')
        elif u.startswith('https://img.youtube.com'):
            r.fulfill(body=open('/tmp/cover.jpg', 'rb').read(), content_type='image/jpeg')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/live.html')
    pg.wait_for_timeout(3500)
    return pg, errs

# a 4:3 stand-in for YouTube's thumbnail: black bars either side of a vertical picture
from PIL import Image, ImageDraw
im = Image.new('RGB', (480, 360), (0, 0, 0)); d = ImageDraw.Draw(im); d.rectangle([139, 0, 341, 360], fill=(150, 60, 140)); im.save('/tmp/cover.jpg')

rect = lambda pg, sel, n=0: pg.evaluate(f"(()=>{{const e=document.querySelectorAll({json.dumps(sel)})[{n}];if(!e)return null;const r=e.getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom}}}})()")

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        n_cards = pg.locator('#socialGrid .social-match-card').count()
        check(f'{tag}: the page shows the live matches you have not voted in ({len(live) - 1})', n_cards == len(live) - 1, n_cards)
        c = rect(pg, '#socialGrid .social-match-card img', 0)
        check(f'{tag}: covers are portrait (9:16), not landscape boxes', c and abs(c['w'] / c['h'] - 9 / 16) < 0.03, c)
        card = rect(pg, '#socialGrid .social-match-card')
        check(f'{tag}: covers stay inside their card', c['x'] >= card['x'] and c['r'] <= card['r'] and c['b'] <= card['b'], (c, card))
        check(f'{tag}: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        titles = pg.eval_on_selector_all('#socialGrid .social-match-card .song-details h3', 'els=>els.map(e=>e.textContent.trim())')
        check(f'{tag}: card titles show no trailing hashtags', titles and all(not re.search(r'#\w+\s*$', t) for t in titles), titles)
        hs = pg.eval_on_selector_all('#socialGrid .social-match-card .song-details h3', 'els=>els.map(e=>e.getBoundingClientRect().height)')
        lh = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#socialGrid .social-match-card .song-details h3')).lineHeight) || 24")
        check(f'{tag}: titles are two lines at most', all(x <= lh * 2 + 4 for x in hs), (hs, lh))
        src = pg.get_attribute('#socialGrid .social-match-card img', 'src')
        check(f'{tag}: covers use the sharper 4:3 thumbnail (hqdefault)', 'hqdefault' in src, src)
        # the cup champion's line sits between the round banner and the matches, and says something that fits
        check(f'{tag}: the champion line is shown', pg.is_visible('#champion-say-live .cb-text') and len(pg.inner_text('#champion-say-live .cb-text')) > 8, pg.inner_text('#champion-say-live') if pg.query_selector('#champion-say-live') else None)
        st = pg.get_attribute('#champion-say-live', 'data-state')
        check(f'{tag}: the line is for the right situation (several matches left to vote in)', st in ('live-some', 'live-closing'), st)
        sb, ub = rect(pg, '#champion-say-live'), rect(pg, '#unvotedSection')
        check(f'{tag}: the champion line sits above the matches and inside the screen', sb and ub and sb['y'] < ub['y'] and sb['r'] <= pg.evaluate('innerWidth') + 1, (sb, ub))
        first_say = pg.inner_text('#champion-say-live .cb-text')
        pg.click('#champion-say-live .cb-portrait'); pg.wait_for_timeout(200)
        check(f'{tag}: tapping the portrait gives another line', pg.inner_text('#champion-say-live .cb-text') != first_say, first_say)
        pg.screenshot(path=f'{SHOTS}/live-{tag}.png')
        # the voted section (collapsed by default): open it and look at the pick
        voted = pg.locator('#votedGrid .social-match-card.voted').first
        check(f'{tag}: the match you voted in is listed under "Your Votes"', voted.count() == 1)
        if voted.count() and not voted.is_visible():
            pg.click('#votedToggle'); pg.wait_for_timeout(400)      # the section can be collapsed: open it
        voted.scroll_into_view_if_needed()
        if voted.count() and voted.is_visible():
            pick = pg.evaluate("(()=>{const c=document.querySelector('.social-match-card.voted');const a=c.querySelectorAll('img');return [a[0].classList.contains('user-pick'),a[1].classList.contains('user-pick'),getComputedStyle(a[0]).opacity,getComputedStyle(a[1]).opacity]})()")
            check(f'{tag}: on a voted card the picked cover is highlighted and the other is dimmed', pick[1] and not pick[0] and float(pick[0 + 2]) < 0.9 and float(pick[3]) == 1, pick)
            pg.screenshot(path=f'{SHOTS}/live-{tag}-voted.png')
        else:
            check(f'{tag}: the voted card can be seen', False)
        # 16 Oct: matches before the hero on every screen size; banner without a stray bullet; badge off the covers; long activity names cut
        first_card, hero = rect(pg, '#socialGrid .social-match-card'), rect(pg, '.hero-header')
        check(f'{tag}: the open matches come before the "Vote for your favourite edits" hero', first_card and hero and first_card['y'] < hero['y'], (first_card, hero))
        banner_bullets = pg.evaluate("[...document.querySelectorAll('.countdown-content .cd-part')].slice(1).map(e=>getComputedStyle(e,'::before').content)")
        if tag == 'phone':
            check('phone: banner parts stack with no leading bullet', all(c in ('none', 'normal') for c in banner_bullets), banner_bullets)
        else:
            check('desktop: banner parts are separated by a dot', all('\u2022' in c for c in banner_bullets) and len(banner_bullets) >= 1, banner_bullets)
        vc = pg.evaluate("(()=>{const c=document.querySelector('.social-match-card.voted');if(!c)return null;const t=c.getBoundingClientRect();const i=c.querySelector('img').getBoundingClientRect();const bt=parseFloat(getComputedStyle(c,'::before').marginTop)||0;return {pos:getComputedStyle(c,'::before').position}})()")
        check(f'{tag}: the founding-member tag sits in the flow (not on top of the covers)', vc and vc['pos'] == 'static', vc)
        pg.evaluate("""(()=>{const f=document.querySelector('.mini-activity-feed .feed-content')||document.querySelector('.mini-activity-feed');
            f.innerHTML='<div class="mini-activity-card"><img class="mini-thumbnail" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><div class="mini-info"><div class="mini-user">SwiftSentinel993</div><div class="mini-song">BORING! || Arcane - Jinx Edit || Beautiful is Boring - BONES UK and a very long extra tail of words</div></div><div class="mini-time">21h ago</div></div>';})()""")
        pg.wait_for_timeout(200)
        ov = pg.evaluate("(()=>{const c=document.querySelector('.mini-activity-card');const t=c.querySelector('.mini-time').getBoundingClientRect();const r=c.getBoundingClientRect();return {cardR:r.right,timeR:t.right,vw:innerWidth,sw:c.scrollWidth,cw:c.clientWidth}})()")
        check(f'{tag}: a long Community Activity title is cut inside its card and the time stays visible', ov['timeR'] <= ov['cardR'] + 1 and ov['cardR'] <= ov['vw'] and ov['sw'] <= ov['cw'] + 1, ov)
        check(f'{tag}: no page errors', not errs, errs)
        pg.context.close()
    b.close()

print('\n' + ('ALL CHECKS PASSED' if not failed else f'{len(failed)} FAILED'))
sys.exit(1 if failed else 0)
