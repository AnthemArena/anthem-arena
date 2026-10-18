# Browser test of the alert toasts: ally / rival (button opens the profile, body opens the match) and the match-event alerts (one card design).
#   python3 tools/test-social-toast-browser.py
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
    pg.goto(f'http://127.0.0.1:{PORT}/index.html')
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
        for rel in ('ally', 'opponent'):
            pg.evaluate("""(rel)=>{window.__nav=[];window.showBulletin({priority:7,type:'live-activity',matchId:'m-1',matchTitle:'A vs B',username:'Mia Lee',triggerUsername:'Mia Lee',triggerUserId:'u2',message:'Mia Lee voted',detail:'hi there',cta:'Say thanks: x',ctaText:'Say thanks: x',ctaAction:'send-emote',ctaData:{targetUsername:'Mia Lee',targetUserId:'u2',emoteType:'thanks'},targetUrl:'/vote.html?match=m-1',relationship:rel});}""", rel)
            pg.wait_for_timeout(600)
            label = pg.inner_text('#bulletin-banner .nv-cta')
            check(f'{tag} {rel}: toast button says View profile', label.strip().lower() == 'view profile', label)
            with pg.expect_navigation(timeout=4000):
                pg.click('#bulletin-banner .nv-cta')
            check(f'{tag} {rel}: button opens the profile', '/profile.html?user=Mia%20Lee' in pg.url, pg.url)
            pg.go_back(); pg.wait_for_timeout(1500)
            pg.evaluate("""(rel)=>{window.showBulletin({priority:7,type:'live-activity',matchId:'m-1',matchTitle:'A vs B',username:'Mia Lee',triggerUsername:'Mia Lee',triggerUserId:'u2',message:'Mia Lee voted',detail:'hi there',cta:'x',ctaText:'x',ctaAction:'send-emote',ctaData:{targetUsername:'Mia Lee'},targetUrl:'/vote.html?match=m-1',relationship:rel});}""", rel)
            pg.wait_for_timeout(600)
            with pg.expect_navigation(timeout=4000):
                pg.click('#bulletin-banner .nv-body', position={'x': 60, 'y': 60})
            check(f'{tag} {rel}: tapping the toast body opens the match', 'vote.html?match=m-1' in pg.url, pg.url)
            pg.go_back(); pg.wait_for_timeout(1500)
        pg.context.close()
    b.close()

# ---- match-event alerts: one design, the edits ringed, tag + champion words + one button, whole card opens the match
EVENTS = [
    ('danger',        dict(message='Down 12 and sinking. Fix it.', detail='Spread the word', userPct=38, opponentPct=62, cta='Share the match'), 'your pick is behind', '/vote.html?match=%s&share=1'),
    ('nailbiter',     dict(message='One vote apart.', detail='Anyone can win', cta='Rally the troops'), 'too close to call', '/vote.html?match=%s&share=1'),
    ('winning',       dict(message='62% and climbing.', detail='Stay on it', userPct=62, opponentPct=38, cta='See the match'), 'your pick is winning', '/vote.html?match=%s&share=1'),
    ('comeback',      dict(message='It was down 12. Look at it now.', detail='', cta='Take a bow'), 'comeback', '/vote.html?match=%s&share=1'),
    ('closing',       dict(message='3 hours left and no vote from you.', detail='Closes today at 5:00 pm', severityTier='3h', cta='Vote now', targetUrl='/vote.html?match=%s'), 'closing soon', '/vote.html?match=%s'),
    ('novotes',       dict(message='Nobody has voted yet. Go first.', detail='', cta='Be first'), 'needs a first vote', '/vote.html?match=%s'),
    ('lowvotes',      dict(message='Barely anyone has weighed in.', detail='', cta='Weigh in'), 'needs more votes', '/vote.html?match=%s'),
    ('match-won',     dict(message='Your pick went through. Told you.', detail='', cta='Next match', action='navigate', targetUrl='/vote.html?match=%s'), 'your pick won', '/vote.html?match=%s'),
    ('match-lost',    dict(message='Your pick is out. It happens.', detail='', cta='Next match', action='navigate', targetUrl='/vote.html?match=%s'), 'your pick lost', '/vote.html?match=%s'),
    ('round-opening', dict(message='Round 3 is open. Eight matches.', detail='', round=3, matchCount=8, matchId=None, cta='Start round 3', action='navigate', targetUrl='/vote.html'), 'round 3 is open', '/matches.html'),
    ('new-matches',   dict(message='Four more matches just opened.', detail='', round=3, matchCount=4, matchId=None, cta='Take a look', action='navigate', targetUrl='/vote.html'), 'new matches in round 3', '/matches.html'),
]
SHOW = """([type, extra]) => { window.showBulletin(Object.assign({priority: 2, type, matchId: extra.matchId === null ? undefined : MATCH, matchTitle: 'A vs B', song: 'A', opponent: 'B'}, extra)); }"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        MATCH = VOTED
        for typ, extra, want_tag, want_url in EVENTS:
            extra = dict(extra); 
            if 'targetUrl' in extra: extra['targetUrl'] = extra['targetUrl'].replace('%s', MATCH)
            pg.evaluate(SHOW.replace('MATCH', json.dumps(MATCH)), [typ, extra])
            pg.wait_for_timeout(900)
            shown = (pg.get_attribute('#bulletin-banner .nv-lead', 'aria-label') or '').strip().lower()
            check(f'{tag} {typ}: the picture is labelled "{want_tag}" and carries the state symbol (no heading line)', shown == want_tag and pg.locator('#bulletin-banner .nv-event-tag').count() == 0 and pg.locator('#bulletin-banner .nv-mark-event, #bulletin-banner .nv-glyph').count() >= 1 or typ in ('novotes','lowvotes') and shown == want_tag, shown)
            check(f'{tag} {typ}: card uses the new design (no old thumbnail)', pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and pg.locator('#bulletin-banner .bulletin-thumbnail').count() == 0)
            has_pair = pg.locator('#bulletin-banner .nv-edits .nv-edit').count()
            if extra.get('matchId', 1) is not None and typ not in ('round-opening', 'new-matches'):
                check(f'{tag} {typ}: the two edit pictures are shown', has_pair == 2, has_pair)
            box = pg.evaluate("(()=>{const r=document.querySelector('#bulletin-banner').getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:innerWidth,h:innerHeight}})()")
            check(f'{tag} {typ}: fits on screen', box['l'] >= -1 and box['r'] <= box['w'] + 1 and box['b'] <= box['h'] + 1, box)
            if typ in ('danger', 'closing', 'match-won', 'round-opening'):
                pg.screenshot(path=f'{SHOTS}/event-{typ}-{tag}.png')
            expect = want_url.replace('%s', MATCH)
            with pg.expect_navigation(timeout=4000):
                pg.click('#bulletin-banner .nv-cta')
            ok_url = pg.url.endswith(expect) if expect.startswith('/vote') else expect in pg.url
            check(f'{tag} {typ}: the button opens {expect}', ok_url, pg.url)
            pg.go_back(); pg.wait_for_timeout(1500)
            pg.evaluate(SHOW.replace('MATCH', json.dumps(MATCH)), [typ, extra]); pg.wait_for_timeout(700)
            with pg.expect_navigation(timeout=4000):
                pg.click('#bulletin-banner .nv-lead')
            check(f'{tag} {typ}: tapping the card opens the match too', ok_url and (pg.url.endswith(expect) if expect.startswith('/vote') else expect in pg.url), pg.url)
            pg.go_back(); pg.wait_for_timeout(1500)
        check(f'{tag}: no page errors from the event alerts', not errs, errs)
        pg.context.close()
    b.close()

# ---- welcome, encouragement, level up, streaks: the same card family
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        def show(js, arg=None):
            pg.evaluate(js, arg); pg.wait_for_timeout(900)
        def fits():
            r = pg.evaluate("(()=>{const r=document.querySelector('#bulletin-banner').getBoundingClientRect();return {l:r.left,r:r.right,b:r.bottom,w:innerWidth,h:innerHeight}})()")
            return r['l'] >= -1 and r['r'] <= r['w'] + 1 and r['b'] <= r['h'] + 1
        # welcome (first time and back)
        for wt, want in (('first-time', 'welcome'), ('back', 'welcome back')):
            show("(wt)=>window.showBulletin({priority:1,type:'welcome',welcomeType:wt,matchId:'welcome',message:'Welcome. 6 matches are open.',detail:'Pick one.',cta:'Begin',action:'navigate',targetUrl:'/vote.html'})", wt)
            check(f'{tag} welcome ({wt}): tag "{want}", new card, fits', (pg.get_attribute('#bulletin-banner .nv-lead', 'aria-label') or '').strip().lower() == want and pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and fits())
            if wt == 'first-time': pg.screenshot(path=f'{SHOTS}/event-welcome-{tag}.png')
        # welcome on the vote page: the button only closes it
        show("window.showBulletin({priority:1,type:'welcome',welcomeType:'back',matchId:'welcome',message:'Hi.',detail:'',cta:'Ok',action:'dismiss',targetUrl:'/vote.html'})")
        url0 = pg.url; pg.click('#bulletin-banner .nv-cta'); pg.wait_for_timeout(700)
        check(f'{tag} welcome with action dismiss: the button closes it and does not navigate', pg.url == url0 and not pg.evaluate("document.querySelector('#bulletin-banner')?.classList.contains('show')"), pg.url)
        # encouragement
        show("window.showBulletin({priority:5,type:'encouragement',encouragementType:'gentle',matchId:'encouragement',message:'Still deciding? Pick one.',detail:'Every vote counts.',cta:'Vote now',action:'navigate',targetUrl:'/matches.html'})")
        check(f'{tag} encouragement: tag, new card, fits', (pg.get_attribute('#bulletin-banner .nv-lead', 'aria-label') or '').strip().lower() == 'still deciding?' and pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and fits())
        with pg.expect_navigation(timeout=4000): pg.click('#bulletin-banner .nv-cta')
        check(f'{tag} encouragement: the button opens the matches page', pg.url.endswith('/matches.html'), pg.url)
        pg.go_back(); pg.wait_for_timeout(1500)
        # level up
        show("window.__lvl=0; window.showBulletin({type:'level-up',level:7,message:'A new rank. Well earned.',detail:'Hextech Adept. It suits you.',cta:'View progress',ctaAction:()=>{window.__lvl++},duration:60000})")
        check(f'{tag} level up: tag, big level number, new card, fits', (pg.get_attribute('#bulletin-banner .nv-lead', 'aria-label') or '').strip().lower() == 'level up' and pg.inner_text('#bulletin-banner .nv-circle').strip() == '7' and pg.locator('#bulletin-banner .level-badge-large').count() == 0 and fits())
        pg.screenshot(path=f'{SHOTS}/event-levelup-{tag}.png')
        pg.click('#bulletin-banner .nv-cta'); pg.wait_for_timeout(300)
        check(f'{tag} level up: the button runs its action', pg.evaluate('window.__lvl') == 1, pg.evaluate('window.__lvl'))
        # streaks
        for rel, count, headline in (('ally-streak', 10, 'has voted with you 10 matches in a row'), ('rival-streak', 20, 'has voted against you 20 matches in a row')):
            show("([rel,count])=>window.showBulletin({priority:3,type:'streak',matchId:'streak-notification',username:'Mia Lee',triggerUserId:'u2',triggerUsername:'Mia Lee',message:'Ten in a row. That is no coincidence.',detail:'x',icon:'x',cta:'View Mia Lee Profile',ctaAction:'navigate',targetUrl:'/profile?user=Mia Lee',relationship:rel,streakCount:count})", [rel, count])
            act = pg.inner_text('#bulletin-banner .nv-toast-action').strip().lower()
            check(f'{tag} {rel}: headline says "{headline}"', headline in act, act)
            check(f'{tag} {rel}: button says View profile, card fits', pg.inner_text('#bulletin-banner .nv-cta').strip().lower() == 'view profile' and fits())
            if rel == 'ally-streak': pg.screenshot(path=f'{SHOTS}/event-streak-{tag}.png')
            with pg.expect_navigation(timeout=4000): pg.click('#bulletin-banner .nv-cta')
            check(f'{tag} {rel}: the button opens the profile', '/profile.html?user=Mia%20Lee' in pg.url, pg.url)
            pg.go_back(); pg.wait_for_timeout(1500)
        check(f'{tag}: no page errors from welcome / encouragement / level up / streak', not errs, errs)
        pg.context.close()
    b.close()
print('\n' + ('ALL CHECKS PASSED' if not failed else f'{len(failed)} FAILED'))
sys.exit(1 if failed else 0)
