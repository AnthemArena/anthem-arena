# Browser test: the sample alerts on test-toasts.html show a real match's two edit pictures (the sample ids are made up).
#   python3 tools/test-sample-toasts-browser.py
# Reuses the page setup (mock Firebase / API / pictures) from test-social-toast-browser.py, but loads test-toasts.html.
import os
here = os.path.dirname(os.path.abspath(__file__))
setup = open(os.path.join(here, 'test-social-toast-browser.py')).read().split('rect = lambda')[0]
exec(setup.replace("/index.html'", "/test-toasts.html'"))

CASES = [('testDanger(15)', True), ('testNailbiter(1)', True), ('testComeback(5)', True), ('testWinning(75)', True),
         ('testMatchWon()', True), ('testMatchLost()', True), ('testNoVotes()', True), ('testLowVotes()', True)]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs = load(b, 1280, 900)
    for call, want_pair in CASES:
        pg.evaluate("document.querySelector('#bulletin-banner')?.remove()")
        pg.evaluate(call); pg.wait_for_timeout(1800)
        n = pg.locator('#bulletin-banner .nv-edits .nv-edit').count()
        check(f'{call}: {"two edit pictures" if want_pair else "no match pictures"}', n == (2 if want_pair else 0), n)
        if call == 'testDanger(15)': pg.screenshot(path=f'{SHOTS}/sample-danger.png')
    ring = lambda sel: pg.evaluate("(sel)=>[...document.querySelectorAll(sel)].map(e=>getComputedStyle(e).borderTopColor)", sel)
    def show(call):
        pg.evaluate("document.querySelector('#bulletin-banner')?.remove()"); pg.evaluate(call); pg.wait_for_timeout(1800)
    show('testNailbiter(0)'); r = ring('#bulletin-banner .nv-edits .nv-edit')
    check('perfect tie: both edits ringed the same (amber), none dimmed', len(r) == 2 and r[0] == r[1] and pg.locator('#bulletin-banner .nv-edit.nv-dim').count() == 0, r)
    show('testDanger(15)')
    check('danger: your pick ringed, the other dimmed', pg.locator('#bulletin-banner .nv-edit.nv-dim').count() == 1)
    for call in ('testNoVotes()', 'testLowVotes()'):
        show(call); r = ring('#bulletin-banner .nv-edits .nv-edit')
        check(f'{call}: neither edit highlighted (both even)', len(r) == 2 and r[0] == r[1] and pg.locator('#bulletin-banner .nv-edit.nv-dim').count() == 0, r)
    show('testRoundOpening()')
    n = pg.locator('#bulletin-banner .nv-strip .nv-strip-th').count()
    check('round opening: a strip of the entering edits under the champion line, no play symbol', 1 <= n <= 5 and pg.locator('#bulletin-banner .nv-glyph').count() == 0 and pg.locator('#bulletin-banner .nv-chip', has_text='matches').count() == 0, n)
    pg.screenshot(path=f'{SHOTS}/sample-round.png')
    check('round opening: no second line under the champion', pg.locator('#bulletin-banner .nv-event-detail').count() == 0)
    show('testDanger(15)')
    chips = [c.strip() for c in pg.locator('#bulletin-banner .nv-chip').all_inner_texts()]
    check('danger: no second line and no pills (the vote page shows the numbers)', pg.locator('#bulletin-banner .nv-event-detail').count() == 0 and chips == [], chips)
    show('testWelcome("first-time")')
    more = pg.inner_text('#bulletin-banner .nv-strip-more').strip() if pg.locator('#bulletin-banner .nv-strip-more').count() else ''
    check('first-time welcome: strip of every live edit (6 matches = 12 edits, 5 shown, +7)', pg.locator('#bulletin-banner .nv-strip-th').count() == 5 and more == '+7' and pg.locator('#bulletin-banner .nv-event-detail').count() == 0, more)
    for call in ('testWelcome("streak")', 'testWelcome("comeback")', 'testWelcomeBack()', 'testEncouragement()'):
        show(call)
        more = pg.inner_text('#bulletin-banner .nv-strip-more').strip() if pg.locator('#bulletin-banner .nv-strip-more').count() else ''
        check(f'{call}: strip leaves out the match already voted in (10 edits, +5), no second line', pg.locator('#bulletin-banner .nv-strip-th').count() == 5 and more == '+5' and pg.locator('#bulletin-banner .nv-event-detail').count() == 0, more)
    for call in ('testWelcomeBack()', 'testEncouragement()', 'testWelcome("comeback")'):
        show(call)
        g = pg.inner_text('#bulletin-banner .nv-glyph').strip(); line = pg.inner_text('#bulletin-banner .nv-bubble').strip()
        check(f'{call}: the symbol in the circle is not repeated at the start of the champion line', not line.startswith(g), (g, line))
    for call, plain in (('testWelcome("first-time")', 'Welcome to Arcane Moments!'), ('testWelcome("streak")', 'Day 2! You came back!'), ('testWelcome("comeback")', 'Welcome back after 5 days!'), ('testWelcomeBack()', 'Welcome back!'), ('testEncouragement()', 'Still deciding?')):
        show(call); line = pg.inner_text('#bulletin-banner .nv-bubble').strip()
        check(f'{call}: the champion pack line is used (not the test page fallback)', line and plain.lower() not in line.lower(), line)
    pg.screenshot(path=f'{SHOTS}/sample-encourage.png')
    for call, tier in (('testTieBreaker()', 'tied'), ('testTieBreaker(true)', 'final')):
        show(call); r = ring('#bulletin-banner .nv-edits .nv-edit')
        chips = [c.strip() for c in pg.locator('#bulletin-banner .nv-chip').all_inner_texts()]
        line = pg.inner_text('#bulletin-banner .nv-bubble').strip()
        check(f'{call}: both edits ringed alike with "=", no second line, no pills', len(r) == 2 and r[0] == r[1] and pg.locator('#bulletin-banner .nv-edit.nv-dim').count() == 0 and pg.inner_text('#bulletin-banner .nv-mark').strip() == '=' and pg.locator('#bulletin-banner .nv-event-detail').count() == 0 and chips == [], (r, chips))
        check(f'{call}: the champion line comes from the pack (not the plain fallback)', line not in ('GODS vs RISE is tied right now. Your vote would break it.', 'GODS vs RISE is still tied and closing soon. Last chance to break it.'), line)
        check(f'{call}: pack line has no unfilled {{placeholders}}', '{' not in line and line != '', line)
    show('testLevelUp(5)')
    check('level up sample: new card, number 5, rank filled in (no placeholders)', pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and pg.inner_text('#bulletin-banner .nv-circle').strip() == '5' and '{' not in pg.inner_text('#bulletin-banner') and '(' not in pg.inner_text('#bulletin-banner .nv-bubble'), pg.inner_text('#bulletin-banner'))
    show('testMasteryUp(3)')
    check('mastery up sample: level badge 3, unlocked skins listed with their art, no placeholders', pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and pg.inner_text('#bulletin-banner .nv-circle').strip() == '3' and 'Crime City, Firecracker' in pg.inner_text('#bulletin-banner .nv-event-detail') and pg.locator('#bulletin-banner .nv-strip-th').count() == 2 and '{' not in pg.inner_text('#bulletin-banner'), pg.inner_text('#bulletin-banner'))
    for call in ('testAchievement("first-choice")', 'testAchievement("arcane-legend")'):
        show(call)
        txt = pg.inner_text('#bulletin-banner')
        check(f'{call}: achievement card with its real name and no {{placeholders}}', pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and '{' not in txt and ('first choice' in txt.lower() or 'arcane legend' in txt.lower()), txt)
    # alerts with a strip open the matches list; already there, the button just closes the alert
    for typ, extra in (('round-opening', "round:3,matchCount:8"), ('welcome', "welcomeType:'back'"), ('encouragement', "encouragementType:'gentle'")):
        pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
        pg.evaluate("(a)=>window.showBulletin({priority:1,type:a[0],"+extra+",message:'Hi',detail:'',cta:'Go',action:'navigate',targetUrl:'/vote.html'})", [typ]); pg.wait_for_timeout(900)
        with pg.expect_navigation(timeout=5000): pg.click('#bulletin-banner .nv-cta')
        check(f'{typ}: from another page the button opens the matches list', pg.url.split('?')[0].endswith('/matches.html'), pg.url)
        pg.wait_for_timeout(2500)
        pg.evaluate("(a)=>window.showBulletin({priority:1,type:a[0],"+extra+",message:'Hi',detail:'',cta:'Go',action:'navigate',targetUrl:'/vote.html'})", [typ]); pg.wait_for_timeout(900)
        u0 = pg.url; pg.click('#bulletin-banner .nv-cta'); pg.wait_for_timeout(700)
        check(f'{typ}: already on the matches list, the button just closes the alert', pg.url == u0 and not pg.evaluate("document.querySelector('#bulletin-banner')?.classList.contains('show')"), pg.url)
    check('no page errors', not errs, errs)
    # where a click goes: the card opens the thing the alert is about, the button follows what its label promises
    def route(n_json, sel):
        pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
        pg.evaluate("(n)=>window.showBulletin(n)", n_json); pg.wait_for_timeout(900)
        with pg.expect_navigation(timeout=6000, wait_until='commit'): pg.click(sel)
        return pg.url.replace(f'http://127.0.0.1:{PORT}', '')
    won = lambda cta: {'priority': 2, 'type': 'match-won', 'matchId': 'm-real', 'message': 'You won.', 'detail': '', 'cta': cta, 'action': 'navigate', 'targetUrl': '/vote.html?match=m-real'}
    check('match won, "See the result": button opens the match', route(won('See the result'), '#bulletin-banner .nv-cta') == '/vote.html?match=m-real')
    check('match won, "Next match": button opens the matches list', route(won('Next match'), '#bulletin-banner .nv-cta').startswith('/matches.html'))
    check('match won, "Next match": the card still opens the match', route(won('Next match'), '#bulletin-banner .nv-bubble') == '/vote.html?match=m-real')
    danger = {'priority': 1, 'type': 'danger', 'matchId': 'm-real', 'message': 'Behind.', 'detail': '', 'cta': 'Rally some votes', 'action': 'navigate', 'targetUrl': '/vote.html?match=m-real', 'voteDiff': 5}
    check('danger: button and card both open the match with the share panel', route(danger, '#bulletin-banner .nv-cta') == '/vote.html?match=m-real&share=1' and route(danger, '#bulletin-banner .nv-bubble') == '/vote.html?match=m-real&share=1')
    ach = lambda cta: {'priority': 2, 'type': 'achievement', 'matchId': 'achievement-x', 'achievementName': 'Spark', 'message': 'Nice.', 'detail': 'x \u2022 +50 XP', 'cta': cta, 'action': 'navigate', 'targetUrl': '/profile#achievements', 'rarity': 'common'}
    check('achievement, "View achievements": button opens the profile achievements tab', route(ach('View achievements'), '#bulletin-banner .nv-cta').endswith('/profile#achievements'))
    check('achievement, "Next match": button opens the matches list', route(ach('Next match'), '#bulletin-banner .nv-cta').startswith('/matches.html'))
    check('achievement, "Next match": the card opens the achievements tab', route(ach('Next match'), '#bulletin-banner .nv-bubble').endswith('/profile#achievements'))
    check('closing (several matches): opens the matches list, not the home page anchor', route({'priority': 1, 'type': 'closing', 'matchId': 'm-real', 'message': 'Closing.', 'detail': '', 'cta': 'Show me', 'action': 'navigate', 'targetUrl': '/matches.html'}, '#bulletin-banner .nv-cta').startswith('/matches.html'))
    b.close()
print('\nFAILED: ' + ', '.join(failed) if failed else '\nALL CHECKS PASSED')
sys.exit(1 if failed else 0)
