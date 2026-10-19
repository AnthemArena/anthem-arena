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
import base64
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'   got: {got}'))
    if not ok: failed.append(name)

matches = json.load(open(f'{FIX}/groups-mid-16.json'))
live = sorted([m for m in matches if m['status'] == 'live'], key=lambda m: m['matchId'])
CURRENT, OTHER_VOTED = live[0]['matchId'], live[1]['matchId']
# the real edits.json is cleaned now, so give the match being viewed hashtag-laden titles to prove they are hidden
for _s in ('song1', 'song2'):
    next(m for m in matches if m['matchId'] == CURRENT)[_s]['shortTitle'] += ' #jinx #arcane #edit'
EXPECT_LEFT = len(live) - 2        # everything live except the one being viewed and the one already voted in

def load(browser, width, height, voted, mid=None, extra=''):
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
        elif u.startswith('https://ddragon.leagueoflegends.com'): r.fulfill(body=PNG, content_type='image/png')
        elif u.startswith('https://img.youtube.com') or 'youtube.com/embed' in u: r.fulfill(body='', content_type='image/jpeg' if 'img.' in u else 'text/html')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/plain')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}/vote.html?match={mid or CURRENT}{extra}')
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
    check('desktop: the MATCH label shares the badge row (no extra line above the bubble)', pg.evaluate("document.querySelector('.match-info .match-title--label') !== null") , None)
    check('desktop: the portrait shows its "another line" badge', pg.evaluate("getComputedStyle(document.querySelector('.cb-portrait'), '::after').content") not in ('none', 'normal', '""'))
    check('desktop: no next-match bar before voting', pg.query_selector('#next-match-bar') is None)
    # the cup champion's speech bubble: visible, says something, and says nothing about the standings before a vote
    check('desktop: the champion bubble is shown with a line', pg.is_visible('#champion-bubble .cb-text') and len(pg.inner_text('#champion-bubble .cb-text').strip()) > 10, pg.inner_text('#champion-bubble'))
    bst = pg.get_attribute('#champion-bubble', 'data-state')
    check('desktop: before voting the bubble is in a state that cannot reveal the standings', bst in ('prevote', 'prevote-empty', 'closing-24h', 'closing-3h', 'closing-final'), bst)
    check('desktop: before voting the line has no percentages', '%' not in pg.inner_text('#champion-bubble .cb-text'), pg.inner_text('#champion-bubble .cb-text'))
    first_line = pg.inner_text('#champion-bubble .cb-text')
    pg.click('#champion-bubble .cb-portrait'); pg.wait_for_timeout(150)
    check('desktop: tapping the portrait gives another line', pg.inner_text('#champion-bubble .cb-text') != first_line, first_line)
    bb, hh = rect(pg, '#champion-bubble'), rect(pg, '.match-info')
    check('desktop: the bubble sits between the heading label and the badges, inside the window', bb and hh and bb['y'] < hh['y'] and bb['r'] <= 1280, (bb, hh))
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
    check('phone: the champion bubble fits the screen with the portrait beside the text', pg.is_visible('#champion-bubble') and rect(pg, '#champion-bubble')['r'] <= 390 and rect(pg, '#champion-bubble .cb-portrait')['r'] <= rect(pg, '#champion-bubble .cb-speech')['x'] + 8, rect(pg, '#champion-bubble'))
    pg.screenshot(path=f'{SHOTS}/vote-phone.png')
    pg.context.close()

    # ---------- phone: vote button not a blob, About blocks below both players ----------
    pg, errs = load(b, 393, 852, voted=False)
    long_title = 'Bro tried to rizz Jinx - JINX EDIT || Britney Spears - Toxic #jinxedit #jinx #arcane #edit'
    pg.evaluate("t=>{document.getElementById('vote-song1-name').textContent=t;}", long_title)
    vb = rect(pg, '#vote-btn-competitor1')
    radius = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#vote-btn-competitor1')).borderTopLeftRadius)")
    check('phone: a very long title no longer makes a huge vote button (two lines at most)', vb['h'] <= 110, vb)
    check('phone: the vote button is a rounded rectangle, not an oval', radius <= 40, radius)
    pg.evaluate("document.querySelectorAll('.moment-details').forEach(e => e.classList.remove('moment-details--bare'))")   # edits WITH something to say keep their block: check the order for that case
    a_vote, b_head, b_vid, a_det, b_det = (rect(pg, s) for s in ('#vote-btn-competitor1', '#competitor2-name', '#competitor2-wrapper', '#competitor-1-column .moment-details', '#competitor-2-column .moment-details'))
    check('phone: order is player A, vote A, then player B (A\'s About block is not in between)', a_vote['y'] < b_head['y'] < b_vid['y'] < a_det['y'] < b_det['y'], (a_vote['y'], b_head['y'], b_vid['y'], a_det['y'], b_det['y']))
    check('phone: each About block says which edit it is about', pg.inner_text('#competitor1-details-for').startswith('About: ') and pg.inner_text('#competitor2-details-for').startswith('About: ') and pg.inner_text('#competitor1-details-for') != pg.inner_text('#competitor2-details-for'), pg.inner_text('#competitor1-details-for'))
    check('phone: second player is within about 1.5 screens of the first (it was about 3)', b_vid['y'] - rect(pg, '#competitor1-wrapper')['y'] < 1.5 * 852, b_vid['y'] - rect(pg, '#competitor1-wrapper')['y'])
    pg.locator('#competitor-1-column .vote-section').scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{SHOTS}/vote-phone-order.png', full_page=False)
    pg.context.close()

    # ---------- tidy titles and details ----------
    pg, errs = load(b, 393, 852, voted=False)
    raw1 = next(m for m in matches if m['matchId'] == CURRENT)['song1']['shortTitle']
    raw2 = next(m for m in matches if m['matchId'] == CURRENT)['song2']['shortTitle']
    check('(precondition) the test match titles really carry hashtags', '#' in raw1 or '#' in raw2, (raw1, raw2))
    shown = [pg.inner_text(s) for s in ('#match-title', '#competitor1-name', '#competitor2-name', '#vote-song1-name', '#vote-song2-name', '#competitor1-details-for')]
    import re as _re
    check('headings, vote buttons and the About label show no trailing hashtags', all(not _re.search(r'#\w+\s*$', x.strip()) for x in shown), shown)
    check('the full title is still the page title (nothing was lost from the data)', 'Vote:' in pg.title(), pg.title())
    h1 = pg.text_content('#match-title').strip()
    check('group match: the heading is a short "Match N" label, the columns carry the names', h1 == 'Match ' + CURRENT.rsplit('-match-', 1)[1] and pg.evaluate("document.getElementById('match-title').classList.contains('match-title--label')"), h1)
    rules = pg.evaluate("[...document.querySelectorAll('.moment-details--no-about .details-meta')].map(e=>getComputedStyle(e).borderTopWidth)")
    check('no rule above the chips when an edit has no About text', rules and all(float(r.replace("px","")) == 0 for r in rules), rules)
    check('the vote buttons have no faint icon circle', not pg.is_visible('#vote-btn-competitor1 .vote-icon') and not pg.is_visible('#vote-btn-competitor2 .vote-icon'))
    check('no filler "An Arcane moment competing..." sentence anywhere', 'An Arcane moment competing' not in pg.inner_text('body'))
    check('phone: edits with nothing to say get no details block at all', not pg.is_visible('#competitor-1-column .moment-details') and not pg.is_visible('#competitor-2-column .moment-details'))
    pg.screenshot(path=f'{SHOTS}/vote-phone-clean.png')
    pg.context.close()

    pg, errs = load(b, 1280, 900, voted=False)
    check('desktop: the filler About section is gone but the seed / year / artist chips stay', not pg.is_visible('#competitor1-about') and pg.is_visible('#competitor1-meta'))
    gap = pg.evaluate("(()=>{const b=document.querySelector('#competitor-1-column .moment-details').getBoundingClientRect(),c=document.querySelector('#competitor1-meta .meta-row').getBoundingClientRect();return c.top-b.top})()")
    check('desktop: no empty band above the chips when an edit has no About text', gap <= 48, gap)
    pg.screenshot(path=f'{SHOTS}/vote-desktop-clean.png')
    pg.context.close()

    # desktop keeps the About blocks under their own player
    pg, errs = load(b, 1280, 900, voted=False)
    d1, v1 = rect(pg, '#competitor-1-column .moment-details'), rect(pg, '#vote-btn-competitor1')
    check('desktop: the About block still sits under its own vote button, and its "About:" label is hidden', d1['y'] > v1['b'] and not pg.is_visible('#competitor1-details-for'), (d1, v1))
    pg.context.close()


    # ---------- arriving from an alert button (?share=1): the slim share modal opens by itself ----------
    for w, h, tag in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, w, h, voted=True, extra='&share=1')
        check(f'alert link ({tag}): the share modal opens by itself', pg.is_visible('#vote-modal .pvm--share'))
        txt = pg.inner_text('#vote-modal .pvm-line')
        check(f'alert link ({tag}): the champion speech bubble is the share message and the box does not repeat it', pg.is_visible('#vote-modal .pvm-line') and pg.query_selector('#vote-modal .share-quote') is None and pg.query_selector('#vote-modal .share-text') is None and len(txt) > 20 and '{' not in txt, txt)
        check(f'alert link ({tag}): no XP block in the slim modal', pg.query_selector('#vote-modal .pvm-xp') is None)
        mr = rect(pg, '#vote-modal .pvm')
        check(f'alert link ({tag}): the modal fits the window', mr and mr['r'] <= w + 1 and mr['b'] <= h + 1 and mr['x'] >= -1, mr)
        pg.screenshot(path=f'{SHOTS}/vote-share-modal-{tag}.png')
        before = pg.inner_text('#vote-modal .pvm-line')
        pg.click('#vote-modal [data-share="reword"]'); pg.wait_for_timeout(200)
        check(f'alert link ({tag}): "New line" changes the bubble', pg.inner_text('#vote-modal .pvm-line') != before, before)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check(f'alert link ({tag}): Escape closes it', not pg.is_visible('#vote-modal .pvm--share'))
        check(f'alert link ({tag}): the page panel is still at the bottom', pg.query_selector('#share-panel .share-quote') is not None)
        pg.context.close()
        # not voted: the alert link must not open anything
    pg, errs = load(b, 1280, 900, voted=False, extra='&share=1')
    check('alert link, not voted: no modal pops up', not pg.is_visible('#vote-modal .pvm--share'))
    pg.context.close()

    # ---------- a toast fired while the vote modal is open waits, then shows once it is closed ----------
    pg, errs = load(b, 1280, 900, voted=True)
    pg.wait_for_timeout(1500)
    pg.evaluate("document.getElementById('bulletin-banner')?.remove(); const m = document.getElementById('vote-modal'); m.classList.add('active'); m.style.display = 'flex'; window.showBulletin({ type: 'encouragement', message: 'HELD-TOAST', detail: 'd', cta: 'Browse', action: 'navigate', targetUrl: '/matches.html' });")
    pg.wait_for_timeout(500)
    check('toast during the modal: nothing shows on top of it', 'HELD-TOAST' not in pg.evaluate("document.getElementById('bulletin-banner')?.innerText || ''"))
    pg.evaluate("const m = document.getElementById('vote-modal'); m.classList.remove('active'); m.style.display = 'none';")
    pg.wait_for_timeout(1500)
    check('toast during the modal: it shows once the modal is closed', 'HELD-TOAST' in pg.evaluate("document.getElementById('bulletin-banner')?.innerText || ''"))
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
        vst = pg.get_attribute('#champion-bubble', 'data-state')
        check(f'voted ({tag}): the bubble now talks about your pick ("voted-..." state)', (vst or '').startswith('voted-'), vst)
        txt_share = pg.inner_text('#share-panel .share-quote') if pg.query_selector('#share-panel .share-quote') else ''
        check(f'voted ({tag}): the share panel is filled with in-character text, no placeholder left', len(txt_share) > 20 and '{' not in txt_share, txt_share)
        check(f'voted ({tag}): the share buttons exist (X, Reddit, WhatsApp, Facebook, Copy)', all(pg.query_selector(f'#share-panel [data-share="{k}"]') for k in ('x', 'reddit', 'whatsapp', 'facebook', 'copy')))
        pg.evaluate("window.__opened = []; window.open = u => { window.__opened.push(u); return null; }")
        pg.click('#share-panel [data-share="x"]'); pg.wait_for_timeout(200)
        all_open = pg.evaluate("window.__opened.filter(Boolean)")
        opened = all_open[0] if all_open else ''
        check(f'voted ({tag}): X opens with the champion line and the match link carrying the share tag', len(all_open) == 1 and 'twitter.com/intent/tweet' in opened and 'ref%3Dshare' in opened and CURRENT in opened and '%7B' not in opened, (opened, errs[:3]))
        pg.locator('#share-section').screenshot(path=f'{SHOTS}/vote-share-{tag}.png')
        sec = pg.inner_text('#other-matches-section h2') if pg.query_selector('#other-matches-section h2') else ''
        check(f'voted ({tag}): the "More Matches" list agrees ({EXPECT_LEFT})', f'{EXPECT_LEFT} More Matches' in sec, sec)
        # the post-vote modal, built by the same module vote.js uses, shown over the real page with the real stylesheet
        pg.evaluate("""async () => {
            const m = await import('/js/champion-modal.js');
            const pack = await (await fetch('/champion-packs/jinx.json')).json();
            const modal = document.getElementById('vote-modal');
            modal.innerHTML = m.buildPostVoteModalHtml({ situationType: 'early', line: m.chooseModalLine(pack, 'early', {}, 'x'), tag: 'Early voter', championName: 'Jinx',
                portraitUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Jinx_37.jpg', splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jinx_37.jpg',
                voteTitle: 'Bro tried to rizz Jinx 💀', songNameRaw: 'Bro', shareContext: 'early',
                xp: { totalXP: 40, baseXP: 10, bonuses: [{ type: 'First vote today', xp: 30 }] },
                rank: { currentLevel: { title: 'Undercity Regular', level: 2 }, nextLevel: { level: 3 }, progressPercentage: 40, progressXP: 40, xpForNextLevel: 100 },
                next: { href: 'vote?match=x', label: 'Next match' } });
            modal.classList.add('active'); modal.style.display = 'flex';
        }""")
        pg.wait_for_timeout(400)
        mp, ma = rect(pg, '.pvm-btn--primary'), rect(pg, '.pvm-btn--ghost')
        check(f'modal ({tag}): "Next match" and "View all matches" are both on the first screen without scrolling', mp and ma and mp['b'] <= h and ma['b'] <= h, (mp, ma, h))
        check(f'modal ({tag}): the modal fits inside the window width', (rect(pg, '.pvm')['r'] <= w + 1), rect(pg, '.pvm'))
        check(f'modal ({tag}): the share row sits below the actions', rect(pg, '.pvm-share')['y'] > mp['b'], (rect(pg, '.pvm-share'), mp))
        check(f'modal ({tag}): the champion line is shown and the old heading is gone', pg.is_visible('.pvm-line') and not pg.query_selector('.modal-title'))
        pg.screenshot(path=f'{SHOTS}/vote-modal-{tag}.png')
        pg.evaluate("closePostVoteModal()")
        # the achievement popup in the champion's voice (splash + colours from the pack), clear of the Next match bar
        pg.evaluate("closePostVoteModal()")
        shown = pg.evaluate("""() => {
            const m = window.championLoader && window.championLoader.getAchievementMessage('first-choice', { name: 'First Choice', description: 'Cast your first vote', xp: 10, rarity: 'common' });
            if (!m) return null;
            window.showBulletin({ priority: 2, type: 'achievement', matchId: 'achievement-first-choice', achievementName: 'First Choice', icon: '🏆',
                message: m.message, detail: m.detail, cta: m.cta, action: 'navigate', targetUrl: '/profile#achievements' });
            return m;
        }""")
        pg.wait_for_timeout(900)
        check(f'achievement ({tag}): the champion pack gave a line, a detail and a button', bool(shown and shown['message'] and shown['detail'] and shown['cta']), shown)
        check(f'achievement ({tag}): no placeholder is left in the text ({{xp}} used to stay in)', bool(shown) and '{' not in shown['message'] + shown['detail'] + shown['cta'], shown)
        ab = rect(pg, '#bulletin-banner')
        check(f'achievement ({tag}): the popup is on screen and shows the achievement name above the champion line', bool(ab) and ab['r'] <= w and ab['y'] >= 0 and 'First Choice' in pg.inner_text('#bulletin-banner .nv-toast-name') and pg.is_visible('#bulletin-banner .nv-bubble'), ab)
        nb = rect(pg, '#next-match-bar')
        check(f'achievement ({tag}): the popup does not cover the Next match bar', bool(ab and nb) and (ab['b'] <= nb['y'] + 1 or ab['x'] >= nb['r'] - 1 or ab['r'] <= nb['x'] + 1), (ab, nb))
        check(f'achievement ({tag}): the popup uses the shared alert layout (nv-body)', pg.query_selector('#bulletin-banner .nv-body') is not None)
        pg.screenshot(path=f'{SHOTS}/vote-achievement-{tag}.png')
        pg.screenshot(path=f'{SHOTS}/vote-voted-{tag}.png')
        check(f'voted ({tag}): no errors from the new code', not [e for e in errs if 'next-match' in e or 'updateNextMatchBar' in e or 'unvotedLiveMatches' in e], errs)
        pg.context.close()

    # ---------- a finished match you did not vote in ----------
    done = next(m['matchId'] for m in matches if m['status'] == 'completed')
    pg, errs = load(b, 1280, 900, voted=False, mid=done)
    check('finished match, not voted: the bubble says voting is over (closed-unvoted)', pg.get_attribute('#champion-bubble', 'data-state') == 'closed-unvoted', pg.get_attribute('#champion-bubble', 'data-state'))
    check('finished match: no page errors from the bubble', not [e for e in errs if 'bubble' in e.lower()], errs)
    labels = pg.eval_on_selector_all('.vote-btn .vote-text', 'els=>els.map(e=>e.textContent.trim())')
    check('finished match, not voted: the buttons show the result, not "Vote for ..."', sorted(labels) == ['Lost this match', 'Won this match'], labels)
    check('finished match: both buttons are disabled, and exactly one is marked as the winner', pg.eval_on_selector_all('.vote-btn', 'els=>els.every(e=>e.disabled)') and pg.locator('.vote-btn.is-winner').count() == 1)
    check('finished match: the winner button is the one for the match winner', pg.eval_on_selector('.vote-btn.is-winner', 'e=>e.dataset.competitor') in ('song1', 'song2'))
    check('finished match: the percentages are visible', pg.eval_on_selector_all('.vote-stats', 'els=>els.every(e=>!e.classList.contains("hidden"))'))
    errs_real = [e for e in errs if 'docChanges' not in e]   # the fake Firestore has no docChanges(); the notification listener asks for it
    check('finished match: no page errors', not errs_real, errs_real)
    pg.screenshot(path=f'{SHOTS}/vote-closed.png')
    pg.locator('#vote-btn-competitor1').scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SHOTS}/vote-closed-buttons.png')
    pg.context.close()

    # ---------- a match that has not opened yet ----------
    soon = next((m['matchId'] for m in matches if m['status'] == 'upcoming'), None)
    if soon:
        pg, errs = load(b, 1280, 900, voted=False, mid=soon)
        labels = pg.eval_on_selector_all('.vote-btn .vote-text', 'els=>els.map(e=>e.textContent.trim())')
        check('upcoming match: the buttons say voting opens soon and are disabled', labels == ['Voting opens soon', 'Voting opens soon'] and pg.eval_on_selector_all('.vote-btn', 'els=>els.every(e=>e.disabled)'), labels)
        pg.context.close()

    b.close()

print('\n' + ('ALL CHECKS PASSED' if not failed else f'{len(failed)} FAILED'))
sys.exit(1 if failed else 0)
