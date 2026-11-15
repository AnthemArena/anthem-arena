# Optional browser test of the REAL feed page (feed.html + js/feed-page.js) with mocked /api/activity and /api/matches:
# a vote post must name the edits by their short titles, with no hashtags and no "||" runs.
#   python3 tools/test-feed-browser.py            (screenshots go to /tmp/feed-shots)
import os, sys, json, subprocess, threading, http.server, socketserver, functools, re, base64, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/feed-shots'
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
# the mocked Firestore has no snapshot.docChanges (the notification listeners start once a user id is set): not a page bug
real = lambda errs: [e for e in errs if 'docChanges' not in e]
def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'   got: {got}'))
    if not ok: failed.append(name)

RAW1 = 'Bro tried to rizz Jinx \U0001F480 - JINX EDIT || Britney Spears - Toxic #jinxedit #jinx #arcane #edit'
RAW2 = 'Jinx edit \U0001F499\U0001F525 #arcane #leagueoflegends #arcaneedit #jinx #jinxarcane #edit'
matches = json.load(open(f'{FIX}/groups-mid-16.json'))
m = next(x for x in matches if x['status'] == 'live')
m['song1'].update(title=RAW1); m['song1'].pop('shortTitle', None)
m['song2'].update(title=RAW2); m['song2'].pop('shortTitle', None)
activity = [{'activityId': 'a1', 'userId': 'u1', 'username': 'SwiftRanger194', 'avatar': 'default', 'matchId': m['matchId'], 'choice': 'song1',
             'songId': m['song1']['id'], 'songTitle': RAW1, 'timestamp': int(time.time() * 1000) - 7200000, 'tournamentId': m['tournament'], 'type': 'vote'}]

def load(browser, width, height, voted=True):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    vote_key = f"localStorage.setItem('vote_{m['tournament']}_{m['matchId']}','song1');" if voted else ''
    ctx.add_init_script("localStorage.setItem('username','tester');localStorage.setItem('isPublic','true');localStorage.setItem('tournamentUserId','u9');localStorage.setItem('userId','u9');localStorage.setItem('userTotalXP','300');" + vote_key)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif path.endswith('/api/activity'): r.fulfill(body=json.dumps(activity), content_type='application/json')
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com') or u.startswith('https://img.youtube.com'): r.fulfill(body=PNG, content_type='image/png')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/feed.html')
    try: pg.wait_for_selector('.vote-text-copy', timeout=20000)   # the feed fills in after the match list and activity arrive
    except Exception: pass
    pg.wait_for_timeout(500)
    return pg, errs

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        # a viewer who has not voted in this live match: who was picked, and the split, stay hidden
        pg, errs = load(b, w, h, voted=False)
        txt0 = pg.inner_text('.vote-text-copy') if pg.locator('.vote-text-copy').count() else ''
        check(f'{tag}: unvoted viewer sees "voted in <edit> vs <edit>" and not who was picked', txt0.strip().startswith('voted in ') and ' vs ' in txt0 and 'voted for' not in txt0 and ' over ' not in txt0, txt0)
        row0 = pg.inner_text('.feed-post-vote')
        check(f'{tag}: unvoted viewer sees where the rule applies: "Vote in it to see who they picked" and a Vote now button, with the live chip naming the group', 'Vote in it to see who they picked' in txt0 and 'Vote now' in pg.inner_text('.feed-post-vote .match-view-btn') and 'live · group' in pg.inner_text('.feed-post-vote .match-status-chip').lower() and pg.locator('.feed-post-vote .vote-text-copy strong').count() == 2, txt0)
        check(f'{tag}: unvoted viewer: no percentages, no split strip, and the link says Vote now', pg.locator('.feed-post-vote .vote-split').count() == 0 and '%' not in row0 and pg.inner_text('.feed-post-vote .match-view-btn').strip() == 'Vote now', row0)
        check(f'{tag}: a vote is one compact row: no nested match card, no zero counts', pg.locator('.match-embed-card').count() == 0 and not any(c.strip() == '0' for c in pg.eval_on_selector_all('.feed-post-vote .like-btn, .feed-post-vote .comment-btn', 'els=>els.map(e=>e.innerText)')), row0)
        check(f'{tag}: unvoted viewer sees both edits as thumbnails, neither ringed as the pick', pg.locator('.feed-post-vote .vote-thumb').count() == 2 and pg.locator('.feed-post-vote .vote-thumb.picked').count() == 0, pg.locator('.feed-post-vote .vote-thumb').count())
        check(f'{tag}: compact vote row is short (under 320px, with the two thumbnails)', pg.eval_on_selector('.feed-post-vote', 'e=>e.getBoundingClientRect().height') < 320, pg.eval_on_selector('.feed-post-vote', 'e=>e.getBoundingClientRect().height'))
        check(f'{tag}: Recent Activity, Tournament Stats and Round Progress are gone', not any(pg.query_selector(s) for s in ['#recentActivityWidget', '.stats-widget', '#roundProgressWidget']))
        pg.context.close()
        pg, errs = load(b, w, h)
        check(f'{tag}: a voter sees the pick and no locked note', 'voted for' in pg.inner_text('.vote-text-copy') and pg.locator('.vote-locked-note').count() == 0)
        check(f'{tag}: a voter sees the same two thumbnails with the pick ringed', pg.locator('.feed-post-vote .vote-thumb').count() == 2 and pg.locator('.feed-post-vote .vote-thumb.picked').count() == 1)
        if pg.locator('.personal-rank-card').count():
            fill = pg.eval_on_selector('.personal-rank-card .progress-bar-fill', 'e=>e.style.width'); label = pg.inner_text('.personal-rank-card .progress-text').strip()
            check(f'{tag}: XP bar and label agree (300 XP = 50 / 250 into level 3)', fill == '20%' and label == '50 / 250 XP', (fill, label))
        os.makedirs('/tmp/feed-shots', exist_ok=True); pg.screenshot(path=f'/tmp/feed-shots/feed-{tag}.png'); pg.locator('.feed-post-vote').first.screenshot(path=f'/tmp/feed-shots/vote-row-{tag}.png')
        check(f'{tag}: page is called Feed', pg.inner_text('.feed-title').strip() == 'Feed' and pg.title().startswith('Feed'))
        if tag == 'phone':
            check('phone: the first feed item starts on the first screen', pg.eval_on_selector('.feed-post-vote', 'e=>e.getBoundingClientRect().top') < 844)
            check('phone: search is behind an icon until tapped', not pg.evaluate("getComputedStyle(document.getElementById('feedSearchContainer')).display!=='none'"))
            pg.click('#feedSearchToggle'); check('phone: the search icon opens the search box', pg.evaluate("getComputedStyle(document.getElementById('feedSearchContainer')).display!=='none'") and pg.get_attribute('#feedSearchToggle', 'aria-expanded') == 'true')
        vis_composer = lambda: pg.evaluate("getComputedStyle(document.getElementById('createPostBox')).display!=='none'")
        check(f'{tag}: composer shows on All Activity', vis_composer())
        pg.click('.filter-btn[data-filter="following"]'); pg.wait_for_timeout(600)
        check(f'{tag}: composer is hidden on Following', not vis_composer())
        check(f'{tag}: Following empty state offers "See what\'s trending"', pg.locator('[data-goto-filter="trending"]').count() == 1)
        pg.click('[data-goto-filter="trending"]'); pg.wait_for_timeout(600)
        check(f'{tag}: that button opens Trending', 'active' in pg.get_attribute('.filter-btn[data-filter="trending"]', 'class'))
        pg.click('.filter-btn[data-filter="all"]'); pg.wait_for_timeout(600)
        check(f'{tag}: composer is back on All Activity', vis_composer())
        check(f'{tag}: composer counter is empty until near the limit', pg.inner_text('#charCount').strip() == '')
        n = pg.locator('.vote-text-copy').count()
        check(f'{tag}: the vote post is on the page', n >= 1, n)
        if n:
            txt = pg.inner_text('.vote-text-copy')
            check(f'{tag}: "voted for ... over ..." uses short names', txt.strip() == 'voted for Bro tried to rizz Jinx \U0001F480 over Jinx edit \U0001F499\U0001F525', txt)
            check(f'{tag}: no hashtags and no || in the post line', '#' not in txt and '||' not in txt, txt)
            check(f'{tag}: voted viewer sees the split strip and "View results"', pg.locator('.feed-post-vote .vote-split').count() == 1 and pg.inner_text('.feed-post-vote .match-view-btn').strip() == 'View results', pg.inner_text('.feed-post-vote'))
        pg.click('.share-btn'); pg.wait_for_timeout(300)
        check(f'{tag}: share menu opens with the options', pg.locator('.share-menu .share-menu-item').count() >= 5, pg.locator('.share-menu .share-menu-item').count())
        check(f'{tag}: share menu is on screen', pg.evaluate("(()=>{const r=document.querySelector('.share-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0})()"))
        pg.evaluate("window.__copied=null;navigator.clipboard.writeText=t=>{window.__copied=t;return Promise.resolve()}")
        pg.click('.share-menu-item[data-act="link"]'); pg.wait_for_timeout(200)
        copied = pg.evaluate('window.__copied')
        check(f'{tag}: copy link gives the match link', copied and copied.endswith('/vote?match=' + m['matchId']), copied)
        pg.click('.filter-btn[data-filter="trending"]'); pg.wait_for_timeout(1500)
        check(f'{tag}: trending tab loads without errors', not real(errs), real(errs))
        check(f'{tag}: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check(f'{tag}: no page errors', not real(errs), real(errs))
        pg.screenshot(path=f'{SHOTS}/{tag}.png')
    b.close()
print('\nALL CHECKS PASSED' if not failed else f'\n{len(failed)} FAILED')
sys.exit(1 if failed else 0)
