# Browser test: the sample alerts on test-toasts.html show a real match's two edit pictures (the sample ids are made up).
#   python3 tools/test-sample-toasts-browser.py
# Reuses the page setup (mock Firebase / API / pictures) from test-social-toast-browser.py, but loads test-toasts.html.
import os
here = os.path.dirname(os.path.abspath(__file__))
setup = open(os.path.join(here, 'test-social-toast-browser.py')).read().split('rect = lambda')[0]
exec(setup.replace("/index.html'", "/test-toasts.html'"))

CASES = [('testDanger(15)', True), ('testNailbiter(1)', True), ('testComeback(5)', True), ('testWinning(75)', True),
         ('testMatchWon()', True), ('testMatchLost()', True), ('testMatchTied()', True), ('testNoVotes()', True), ('testLowVotes()', True)]
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
    show('testMatchTied()'); r = ring('#bulletin-banner .nv-edits .nv-edit')
    check('match tied: both edits ringed the same, none dimmed', len(r) == 2 and r[0] == r[1] and pg.locator('#bulletin-banner .nv-edit.nv-dim').count() == 0, r)
    show('testDanger(15)')
    check('danger: your pick ringed, the other dimmed', pg.locator('#bulletin-banner .nv-edit.nv-dim').count() == 1)
    for call in ('testNoVotes()', 'testLowVotes()'):
        show(call); r = ring('#bulletin-banner .nv-edits .nv-edit')
        check(f'{call}: neither edit highlighted (both even)', len(r) == 2 and r[0] == r[1] and pg.locator('#bulletin-banner .nv-edit.nv-dim').count() == 0, r)
    show('testRoundOpening()')
    n = pg.locator('#bulletin-banner .nv-strip .nv-strip-th').count()
    check('round opening: a strip of the entering edits under the champion line, symbol kept', 1 <= n <= 5 and pg.locator('#bulletin-banner .nv-glyph').count() == 1 and pg.locator('#bulletin-banner .nv-chip', has_text='matches').count() == 0, n)
    pg.screenshot(path=f'{SHOTS}/sample-round.png')
    check('round opening: no second line under the champion', pg.locator('#bulletin-banner .nv-event-detail').count() == 0)
    show('testDanger(15)')
    chips = [c.strip() for c in pg.locator('#bulletin-banner .nv-chip').all_inner_texts()]
    check('danger: no second line; facts are chips (Behind by 15, percentages)', pg.locator('#bulletin-banner .nv-event-detail').count() == 0 and 'Behind by 15' in chips and any('vs' in c for c in chips), chips)
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
    pg.screenshot(path=f'{SHOTS}/sample-encourage.png')
    show('testLevelUp(5)')
    check('level up sample: new card, number 5, rank filled in (no placeholders)', pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and pg.inner_text('#bulletin-banner .nv-circle').strip() == '5' and '{' not in pg.inner_text('#bulletin-banner') and '(' not in pg.inner_text('#bulletin-banner .nv-bubble'), pg.inner_text('#bulletin-banner'))
    for call in ('testAchievement("first-choice")', 'testAchievement("arcane-legend")'):
        show(call)
        txt = pg.inner_text('#bulletin-banner')
        check(f'{call}: achievement card with its real name and no {{placeholders}}', pg.locator('#bulletin-banner.versus-toast .nv-body').count() == 1 and '{' not in txt and ('first choice' in txt.lower() or 'arcane legend' in txt.lower()), txt)
    check('no page errors', not errs, errs)
    b.close()
print('\nFAILED: ' + ', '.join(failed) if failed else '\nALL CHECKS PASSED')
sys.exit(1 if failed else 0)
