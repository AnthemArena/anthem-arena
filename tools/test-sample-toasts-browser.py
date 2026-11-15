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
    check('level up sample: new card, level 5 badge, rank filled in (no placeholders)', pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and pg.locator('#bulletin-banner .rank-badge--silver').count() == 1 and 'Level 5' in pg.inner_text('#bulletin-banner') and '{' not in pg.inner_text('#bulletin-banner') and '(' not in pg.inner_text('#bulletin-banner .nv-bubble'), pg.inner_text('#bulletin-banner'))
    show('testMasteryUp(3)')
    check('mastery up sample: labelled with the champion, Mastery 3, unlocked skins named, no placeholders', pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and 'MASTERY UP' in pg.inner_text('#bulletin-banner') and 'Mastery 3' in pg.inner_text('#bulletin-banner .nv-ach-name') and 'Crime City, Firecracker' in pg.inner_text('#bulletin-banner .nv-ach-desc') and '{' not in pg.inner_text('#bulletin-banner'), pg.inner_text('#bulletin-banner'))
    for call in ('testAchievement("first-choice")', 'testAchievement("arcane-legend")'):
        show(call)
        txt = pg.inner_text('#bulletin-banner')
        check(f'{call}: achievement card with its real name and no {{placeholders}}', pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and '{' not in txt and ('first choice' in txt.lower() or 'arcane legend' in txt.lower()), txt)
    # the one pop-up style has no button: the card opens the matches list (round-opening / welcome / encouragement strips are hidden too)
    for typ, extra in (('round-opening', "round:3,matchCount:8"), ('welcome', "welcomeType:'back'"), ('encouragement', "encouragementType:'gentle'")):
        pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
        pg.evaluate("(a)=>window.showBulletin({priority:1,type:a[0],"+extra+",message:'Hi',detail:'',cta:'Go',action:'navigate',targetUrl:'/vote.html'})", [typ]); pg.wait_for_timeout(900)
        check(f'{typ}: the button is hidden (one pop-up style)', not pg.locator('#bulletin-banner .nv-cta').is_visible())
        with pg.expect_navigation(timeout=5000, wait_until='commit'): pg.click('#bulletin-banner .nv-bubble')
        check(f'{typ}: the card opens the matches list', pg.url.split('?')[0].endswith('/matches.html'), pg.url)
    check('no page errors', not errs, errs)
    # where a click goes: the card opens the thing the alert is about, the button follows what its label promises
    def route(n_json, sel):
        pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
        pg.evaluate("(n)=>window.showBulletin(n)", n_json); pg.wait_for_timeout(900)
        with pg.expect_navigation(timeout=6000, wait_until='commit'): pg.click(sel)
        return pg.url.replace(f'http://127.0.0.1:{PORT}', '')
    won = lambda cta: {'priority': 2, 'type': 'match-won', 'matchId': 'm-real', 'message': 'You won.', 'detail': '', 'cta': cta, 'action': 'navigate', 'targetUrl': '/vote.html?match=m-real'}
    check('match won, "Next match": the card still opens the match', route(won('Next match'), '#bulletin-banner .nv-bubble') == '/vote.html?match=m-real')
    danger = {'priority': 1, 'type': 'danger', 'matchId': 'm-real', 'message': 'Behind.', 'detail': '', 'cta': 'Rally some votes', 'action': 'navigate', 'targetUrl': '/vote.html?match=m-real', 'voteDiff': 5}
    check('danger: the card opens the match with the share panel', route(danger, '#bulletin-banner .nv-bubble') == '/vote.html?match=m-real&share=1')
    ach = lambda cta: {'priority': 2, 'type': 'achievement', 'matchId': 'achievement-x', 'achievementName': 'Spark', 'message': 'Nice.', 'detail': 'x \u2022 +50 XP', 'cta': cta, 'action': 'navigate', 'targetUrl': '/profile#achievements', 'rarity': 'common'}
    check('achievement, "Next match": the card opens the achievements tab', route(ach('Next match'), '#bulletin-banner .nv-bubble').endswith('/profile#achievements'))
    check('closing (several matches): the card opens the matches list, not the home page anchor', route({'priority': 1, 'type': 'closing', 'matchId': 'm-real', 'message': 'Closing.', 'detail': '', 'cta': 'Show me', 'action': 'navigate', 'targetUrl': '/matches.html'}, '#bulletin-banner .nv-bubble').startswith('/matches.html'))
    # polish: tap area, status role, the pill on the match's own page, auto-dismiss that pauses on hover
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
    pg.evaluate("(n)=>window.showBulletin(n)", won('See the result')); pg.wait_for_timeout(900)
    box = pg.evaluate("(()=>{const x=document.querySelector('#bulletin-banner .nv-bubble-x');const r=getComputedStyle(x,'::before');return [parseFloat(r.width),parseFloat(r.height)];})()")
    check('the x has a tap area of at least 44 x 44', box[0] >= 44 and box[1] >= 44, box)
    check('the alert is a polite status region', pg.get_attribute('#bulletin-banner', 'role') == 'status' and pg.get_attribute('#bulletin-banner', 'aria-live') == 'polite')
    check('while an alert shows, <html> says so (the inline bubble steps aside)', pg.evaluate("document.documentElement.classList.contains('toast-up')"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('Escape closes the alert and clears the flag', not pg.evaluate("document.querySelector('#bulletin-banner').classList.contains('show') || document.documentElement.classList.contains('toast-up')"))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
    pg.evaluate("history.replaceState(null, '', '/vote.html?match=m-real')")
    pg.evaluate("(n)=>window.showBulletin(n)", won('See the result')); pg.wait_for_timeout(900)
    u0 = pg.url; pg.click('#bulletin-banner .nv-bubble', position={'x': 20, 'y': 10}); pg.wait_for_timeout(500)
    check('on that match already: the pill is marked, shows no arrow and does nothing when tapped', pg.evaluate("document.querySelector('#bulletin-banner').classList.contains('nv-here')") and pg.url == u0 and pg.evaluate("getComputedStyle(document.querySelector('#bulletin-banner .nv-bubble'),'::after').display") == 'none', pg.url)
    pg.evaluate("history.replaceState(null, '', '/vote.html?match=another')")
    pg.evaluate("(n)=>window.showBulletin(n)", won('See the result')); pg.wait_for_timeout(900)
    check('on a different match: the pill is a normal link', not pg.evaluate("document.querySelector('#bulletin-banner').classList.contains('nv-here')"))
    # auto-dismiss after ~14 s (the alert has a button label), paused while hovered
    pg.clock.install(); pg.evaluate("(n)=>window.showBulletin(n)", won('See the result')); pg.clock.run_for(500)
    pg.hover('#bulletin-banner .nv-bubble'); pg.clock.run_for(30000)
    check('hovering the alert pauses its timer', pg.evaluate("document.querySelector('#bulletin-banner').classList.contains('show')"))
    pg.mouse.move(2, 2); pg.clock.run_for(15000)
    check('after the pointer leaves, the alert closes by itself', not pg.evaluate("document.querySelector('#bulletin-banner').classList.contains('show')"))
    # achievement card: solid backing, the name is the biggest text, criterion + XP shown, several unlocks join into one, other alerts wait
    ACH = lambda name, desc, xp, rar: {'priority': 2, 'type': 'achievement', 'matchId': 'achievement-' + name, 'achievementName': name, 'description': desc, 'xp': xp, 'rarity': rar,
                                       'message': 'Nice.', 'detail': 'Coming back is the hard part. \u2022 +%d XP' % xp, 'cta': 'View achievements', 'action': 'navigate', 'targetUrl': '/profile#achievements'}
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
    pg.evaluate("(n)=>window.showBulletin(n)", ACH('Spark', 'Win a match you were losing', 50, 'rare')); pg.wait_for_timeout(900)
    bg = pg.evaluate("getComputedStyle(document.querySelector('#bulletin-banner')).backgroundColor")
    check('achievement card has a solid backing (not transparent)', bg not in ('rgba(0, 0, 0, 0)', 'transparent'), bg)
    sizes = pg.evaluate("(()=>{const f=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);return {name:f('.nv-ach-name'),label:f('.nv-ach-label'),desc:f('.nv-ach-desc'),line:f('.nv-bubble')};})()")
    check('the achievement name is the biggest text, the champion line is secondary', sizes['name'] > sizes['line'] and sizes['name'] > sizes['desc'] > 0 and sizes['name'] > sizes['label'], sizes)
    txt = pg.inner_text('#bulletin-banner')
    check('card says what it was for and what it paid', 'Win a match you were losing' in txt and '+50 XP' in txt and 'Rare' in txt, txt)
    lefts = pg.evaluate("(()=>{const l=s=>document.querySelector(s).getBoundingClientRect().left;return [l('.nv-ach-icon'),l('.nv-jinx')];})()")
    check('header and champion line share one left edge', abs(lefts[0] - lefts[1]) < 2, lefts)
    pg.screenshot(path=f'{SHOTS}/achievement-card.png')
    h = pg.evaluate("document.querySelector('#bulletin-banner').getBoundingClientRect().height")
    check('card is compact (under 190px)', h < 190, h)
    # a second achievement joins the card
    pg.evaluate("(n)=>window.showBulletin(n)", ACH('Founding Member', 'One of the first 1,000 voters', 150, 'legendary')); pg.wait_for_timeout(500)
    txt = pg.inner_text('#bulletin-banner')
    check('two achievements: one card, "2 achievements unlocked", both names, XP added', '2 ACHIEVEMENTS UNLOCKED' in txt and 'Spark' in txt and 'Founding Member' in txt and '+200 XP' in txt, txt)
    pg.screenshot(path=f'{SHOTS}/achievement-card-two.png')
    check('still exactly one banner', pg.locator('#bulletin-banner').count() == 1)
    # another alert waits until the card closes, then appears
    pg.evaluate("(n)=>window.showBulletin(n)", {'priority': 2, 'type': 'danger', 'matchId': 'm-real', 'message': 'Behind.', 'detail': '', 'cta': 'Rally', 'action': 'navigate', 'targetUrl': '/vote.html?match=m-real', 'voteDiff': 5}); pg.wait_for_timeout(500)
    check('a non-achievement alert does not replace the achievement card', '2 ACHIEVEMENTS UNLOCKED' in pg.inner_text('#bulletin-banner'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(1800)
    check('after the card closes, the waiting alert shows', pg.evaluate("document.querySelector('#bulletin-banner').classList.contains('show')") and 'ACHIEVEMENT' not in pg.inner_text('#bulletin-banner'), pg.inner_text('#bulletin-banner'))
    # dwell: an achievement stays longer than a normal alert
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
    pg.clock.install(); pg.evaluate("(n)=>window.showBulletin(n)", ACH('Spark', 'Win a match you were losing', 50, 'rare')); pg.clock.run_for(16000)
    check('an achievement card is still up after 16 s', pg.evaluate("document.querySelector('#bulletin-banner').classList.contains('show')"))
    pg.clock.run_for(6000)
    check('and closes by itself after about 20 s', not pg.evaluate("document.querySelector('#bulletin-banner').classList.contains('show')"))
    # level up + mastery up: the same solid card, labelled, number biggest, the x on the card's corner, sized to content
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
    pg.evaluate("(n)=>window.showBulletin(n)", {'type': 'level-up', 'level': 5, 'rankTitle': 'Streetwise', 'nextLevel': 6, 'xpToNext': 140, 'message': 'You moved up.', 'detail': 'x', 'cta': 'View progress', 'duration': 6000}); pg.wait_for_timeout(900)
    txt = pg.inner_text('#bulletin-banner')
    check('level up: label, "Level 5", rank and XP to the next level', 'LEVEL UP' in txt and 'Level 5' in txt and 'Streetwise' in txt and '140 XP to Level 6' in txt, txt)
    bg = pg.evaluate("getComputedStyle(document.querySelector('#bulletin-banner')).backgroundColor")
    check('level up: solid backing', bg not in ('rgba(0, 0, 0, 0)', 'transparent'), bg)
    check('level up: the level badge (tier ring, icon) and an arrow, with "Level 5" in the title', pg.locator('#bulletin-banner .rank-badge--silver').count() == 1 and pg.inner_text('#bulletin-banner .nv-ach-name').strip() == 'Level 5' and pg.locator('#bulletin-banner .nv-level-arrow').count() == 1)
    geo = pg.evaluate("(()=>{const c=document.querySelector('#bulletin-banner').getBoundingClientRect(),x=document.querySelector('#bulletin-banner .nv-card-x').getBoundingClientRect();return {w:c.width,xr:c.right-x.right,xt:x.top-c.top,bubbleX:getComputedStyle(document.querySelector('#bulletin-banner .nv-bubble-x')).display};})()")
    check('level up: the x sits on the card corner (the bubble x is hidden) and the card is sized to its content', geo['xr'] < 16 and geo['xt'] < 16 and geo['bubbleX'] == 'none' and geo['w'] <= 421, geo)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    pg.evaluate("(n)=>window.showBulletin(n)", {'type': 'mastery-up', 'level': 3, 'packId': 'jinx', 'message': 'Jinx would call that progress.', 'detail': 'Unlocked: Arcane Enemy', 'cta': 'View champions', 'duration': 6000}); pg.wait_for_timeout(900)
    txt = pg.inner_text('#bulletin-banner')
    check('mastery up: label names the champion, "Mastery 3", the unlock named', 'MASTERY UP' in txt and 'JINX' in txt and 'Mastery 3' in txt and 'Unlocked: Arcane Enemy' in txt, txt)
    pg.screenshot(path=f'{SHOTS}/mastery-card.png')
    # level-ups waiting behind an achievement are never dropped
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    pg.evaluate("(n)=>window.showBulletin(n)", ACH('Spark', 'Win a match you were losing', 50, 'rare')); pg.wait_for_timeout(600)
    pg.evaluate("(n)=>window.showBulletin(n)", {'type': 'level-up', 'level': 5, 'rankTitle': 'Streetwise', 'message': 'Up.', 'detail': 'x', 'cta': 'View progress'})
    pg.evaluate("(n)=>window.showBulletin(n)", {'type': 'mastery-up', 'level': 3, 'packId': 'jinx', 'message': 'Up.', 'detail': 'Mastery 3', 'cta': 'View champions'})
    pg.evaluate("(n)=>window.showBulletin(n)", {'priority': 2, 'type': 'danger', 'matchId': 'm-real', 'message': 'Behind.', 'detail': '', 'cta': 'Rally', 'action': 'navigate', 'targetUrl': '/vote.html?match=m-real', 'voteDiff': 5})
    pg.wait_for_timeout(400)
    check('while the achievement card is up, it stays', 'ACHIEVEMENT UNLOCKED' in pg.inner_text('#bulletin-banner'))
    seen = []
    for _ in range(3):
        pg.keyboard.press('Escape'); pg.wait_for_timeout(1500)
        seen.append(pg.inner_text('#bulletin-banner'))
    check('after it closes: the level up, then the mastery up, then the other alert, none dropped', 'LEVEL UP' in seen[0] and 'MASTERY UP' in seen[1] and 'LEVEL UP' not in seen[2] and 'MASTERY' not in seen[2] and 'Behind' in seen[2], seen)
    b.close()
print('\nFAILED: ' + ', '.join(failed) if failed else '\nALL CHECKS PASSED')
sys.exit(1 if failed else 0)
