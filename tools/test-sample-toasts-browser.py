# Browser test: the sample alerts on test-toasts.html show a real match's two edit pictures (the sample ids are made up).
#   python3 tools/test-sample-toasts-browser.py
# Reuses the page setup (mock Firebase / API / pictures) from test-social-toast-browser.py, but loads test-toasts.html.
import os
here = os.path.dirname(os.path.abspath(__file__))
setup = open(os.path.join(here, 'test-social-toast-browser.py')).read().split('rect = lambda')[0]
exec(setup.replace("/index.html'", "/test-toasts.html'"))

CASES = [('testDanger(15)', True), ('testNailbiter(1)', True), ('testComeback(5)', True), ('testWinning(75)', True),
         ('testMatchWon()', True), ('testMatchLost()', True), ('testMatchTied()', True), ('testNoVotes()', True), ('testLowVotes()', True),
         ('testRoundOpening()', False)]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs = load(b, 1280, 900)
    for call, want_pair in CASES:
        pg.evaluate("document.querySelector('#bulletin-banner')?.remove()")
        pg.evaluate(call); pg.wait_for_timeout(1800)
        n = pg.locator('#bulletin-banner .nv-edits .nv-edit').count()
        check(f'{call}: {"two edit pictures" if want_pair else "no match pictures"}', n == (2 if want_pair else 0), n)
        if call == 'testDanger(15)': pg.screenshot(path=f'{SHOTS}/sample-danger.png')
    check('no page errors', not errs, errs)
    b.close()
print('\nFAILED: ' + ', '.join(failed) if failed else '\nALL CHECKS PASSED')
sys.exit(1 if failed else 0)
