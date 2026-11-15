# Browser test of reporting, blocking and posting limits on the REAL feed page, with the in-memory Firestore.
#   python3 tools/test-moderation-browser.py            (screenshots go to /tmp/moderation-shots)
import os, sys, json, subprocess, threading, http.server, socketserver, functools, base64, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/tmp/bracket-fixtures'; SHOTS = '/tmp/moderation-shots'
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
real = lambda errs: [e for e in errs if 'docChanges' not in e]
def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'   got: {got}'))
    if not ok: failed.append(name)

now = int(time.time() * 1000)
def post(pid, uid, name, text, **kw):
    return (f'posts/{pid}', dict(postId=pid, userId=uid, username=name, avatar={'type': 'emoji', 'value': '🎵'}, type='user_post', content=text,
                                 timestamp=now - 60000, privacy='public', likeCount=0, commentCount=1 if pid == 'p-ok' else 0, **kw))
def comment(cid, pid, uid, name, text, **kw):
    return (f'comments/{cid}', dict(commentId=cid, postId=pid, userId=uid, username=name, avatar={'type': 'emoji', 'value': '🎵'}, content=text, timestamp=now - 30000, **kw))
SEED = [post('p-ok', 'u2', 'Maya', 'Hello from Maya'), post('p-held', 'u3', 'Spammer', 'Buy cheap stuff', reportCount=3),
        post('p-troll', 'u4', 'Troll', 'Troll post here'), post('p-mine', 'u9', 'tester', 'My own held post', reportCount=4),
        comment('c-ok', 'p-ok', 'u2', 'Maya', 'Nice one'), comment('c-held', 'p-ok', 'u5', 'Rude', 'Held comment', reportCount=3)]

def load(browser, width, height, rate=None):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    init = ("localStorage.setItem('username','tester');localStorage.setItem('isPublic','true');localStorage.setItem('tournamentUserId','u9');localStorage.setItem('userId','u9');"
            "if(!sessionStorage.getItem('fs'))sessionStorage.setItem('fs'," + json.dumps(json.dumps(SEED)) + ");")
    if rate: init += "localStorage.setItem('rateLog',JSON.stringify({post:[5000,4000,3000].map(a=>Date.now()-a)}));"
    ctx.add_init_script(init)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(json.load(open(f'{FIX}/groups-mid-16.json'))), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif '/api/' in u: r.fulfill(body='[]', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com') or u.startswith('https://img.youtube.com'): r.fulfill(body=PNG, content_type='image/png')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/feed.html')
    try: pg.wait_for_selector('.feed-post', timeout=20000)
    except Exception: pass
    pg.wait_for_timeout(600)
    return pg, errs

ids = lambda pg: pg.eval_on_selector_all('#feedPosts .feed-post', 'els=>els.map(e=>e.dataset.postId)')
store = lambda pg: pg.evaluate("Object.fromEntries([...window.__store.entries()])")

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h)
        shown = ids(pg)
        check(f'{tag}: a post with 3 reports is hidden from other people', 'p-held' not in shown and 'p-ok' in shown, shown)
        check(f'{tag}: the author still sees their own held post', 'p-mine' in shown, shown)
        check(f'{tag}: other people\'s posts have a Report/Block menu, own posts keep Edit/Delete', pg.locator('[data-post-id="p-ok"] .post-menu-other').count() == 1 and pg.locator('[data-post-id="p-mine"] .delete-post-btn').count() == 1)

        pg.locator('.feed-post[data-post-id="p-ok"]').screenshot(path=f'{SHOTS}/post-{tag}.png')
        # report a post
        pg.click('.feed-post[data-post-id="p-ok"] .post-menu-btn'); pg.click('.feed-post[data-post-id="p-ok"] .report-post-btn')
        check(f'{tag}: Report opens a dialog with the four reasons', pg.locator('#modDialog input[name="reason"]').count() == 4)
        pg.screenshot(path=f'{SHOTS}/report-{tag}.png')
        pg.check('#modDialog input[value="abuse"]'); pg.click('#modDialog .mod-send'); pg.wait_for_timeout(500)
        st = store(pg); rep = st.get('reports/post_p-ok_u9')
        check(f'{tag}: the report is saved under post_<id>_<me> with the reason', rep and rep['reason'] == 'abuse' and rep['authorId'] == 'u2' and rep['reporterId'] == 'u9' and rep['targetType'] == 'post', rep)
        check(f'{tag}: the post\'s report counter went up in the same batch', st['posts/p-ok'].get('reportCount') == 1, st['posts/p-ok'])
        check(f'{tag}: the dialog closed', pg.locator('#modDialog').count() == 0)

        # block a person
        pg.click('.feed-post[data-post-id="p-troll"] .post-menu-btn'); pg.click('.feed-post[data-post-id="p-troll"] .block-user-btn')
        check(f'{tag}: Block asks first and names the person', 'Block Troll?' in pg.inner_text('#modDialog'))
        pg.click('#modDialog .mod-send'); pg.wait_for_timeout(500)
        check(f'{tag}: blocking removes that person\'s posts at once', 'p-troll' not in ids(pg), ids(pg))
        check(f'{tag}: the block is kept on the device', 'u4' in json.loads(pg.evaluate("localStorage.getItem('blockedUsers')")))
        check(f'{tag}: a "Blocked people (1)" link appears', pg.inner_text('#blockedLink').strip() == 'Blocked people (1)')
        pg.reload(); pg.wait_for_selector('.feed-post', timeout=20000); pg.wait_for_timeout(500)
        check(f'{tag}: the block survives a reload', 'p-troll' not in ids(pg))
        pg.click('#blockedLink'); pg.screenshot(path=f'{SHOTS}/blocked-{tag}.png'); pg.click('#modDialog .mod-unblock'); pg.wait_for_timeout(300)
        pg.click('#modDialog .mod-cancel'); pg.wait_for_timeout(500)
        check(f'{tag}: unblocking brings the posts back and removes the link', 'p-troll' in ids(pg) and pg.locator('#blockedLink').count() == 0, ids(pg))

        # comments
        pg.click('.feed-post[data-post-id="p-ok"] .comment-btn'); pg.wait_for_timeout(700)
        cs = pg.eval_on_selector_all('#comments-list-p-ok .comment', 'els=>els.map(e=>e.dataset.commentId)')
        check(f'{tag}: a comment with 3 reports is hidden', cs == ['c-ok'], cs)
        pg.click('#comments-list-p-ok .comment-report-btn', force=True)
        check(f'{tag}: a comment has a Report button that opens the same dialog', 'Report this comment' in pg.inner_text('#modDialog'))
        pg.click('#modDialog .mod-send'); pg.wait_for_timeout(500)
        check(f'{tag}: the comment report is saved with its post', store(pg).get('reports/comment_c-ok_u9', {}).get('postId') == 'p-ok', store(pg).get('reports/comment_c-ok_u9'))
        check(f'{tag}: no page errors', not real(errs), real(errs))
        pg.context.close()

        # posting limit
        pg, errs = load(b, w, h, rate=True)
        before = len([k for k in store(pg) if k.startswith('posts/')])
        pg.fill('#postInput', 'one more post'); pg.click('#submitPostBtn'); pg.wait_for_timeout(600)
        after = len([k for k in store(pg) if k.startswith('posts/')])
        check(f'{tag}: a fourth post within a minute is not sent', after == before, (before, after))
        pg.context.close()
        pg, errs = load(b, w, h)
        before = len([k for k in store(pg) if k.startswith('posts/')])
        pg.fill('#postInput', 'a normal post'); pg.click('#submitPostBtn'); pg.wait_for_timeout(800)
        after = len([k for k in store(pg) if k.startswith('posts/')])
        check(f'{tag}: a normal post still goes through', after == before + 1, (before, after))
        pg.context.close()
    b.close()
print('\nALL CHECKS PASSED' if not failed else f'\n{len(failed)} FAILED')
sys.exit(1 if failed else 0)
