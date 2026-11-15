# Browser test: vote-page players take each edit's shape, and Expand opens the focused player (js/watch-dialog.js).
#   python3 tools/test-vote-player.py            (screenshots go to /tmp/vote-shots)
import os, json
_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test-vote-browser.py')).read()
exec(_src[:_src.rindex('with sync_playwright() as p:')])     # harness: server, mocks, load(), rect(), check()

cur = next(m for m in matches if m['matchId'] == CURRENT)
V1, V2 = cur['song1']['videoId'], cur['song2']['videoId']
EDITS_BODY = json.dumps([{'videoId': V1, 'aspect': '1:1'}, {'videoId': V2, 'aspect': '16:9'}])

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- shapes ----------
    pg, errs = load(b, 1280, 900, voted=False)
    w1, w2 = rect(pg, '.video-wrapper', 0), rect(pg, '.video-wrapper', 1)
    check('desktop: a square edit gets a square player', w1 and abs(w1['w'] / w1['h'] - 1) < 0.03, w1)
    check('desktop: a 16:9 edit gets a wide player', w2 and abs(w2['w'] / w2['h'] - 16 / 9) < 0.05, w2)
    check('desktop: square player is bigger than it was in the 9:16 box (wider than 9/16 of its height)', w1['w'] > w1['h'] * 0.6, w1)
    check('desktop: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    pg.screenshot(path=f'{SHOTS}/vote-shapes-desktop.png')
    pg.context.close()

    pg, errs = load(b, 390, 844, voted=False)
    w1, w2 = rect(pg, '.video-wrapper', 0), rect(pg, '.video-wrapper', 1)
    check('phone: square player fits the screen', w1 and abs(w1['w'] / w1['h'] - 1) < 0.03 and w1['r'] <= 390 and w1['x'] >= 0, w1)
    check('phone: wide player fits the screen', w2 and abs(w2['w'] / w2['h'] - 16 / 9) < 0.05 and w2['r'] <= 390 and w2['x'] >= 0, w2)
    check('phone: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    pg.context.close()

    EDITS_BODY = '{"broken":'      # unreadable file: every player keeps 9:16
    pg, errs = load(b, 1280, 900, voted=False)
    w1 = rect(pg, '.video-wrapper', 0)
    check('a broken edits.json leaves the 9:16 default', w1 and abs(w1['w'] / w1['h'] - 9 / 16) < 0.03, w1)
    pg.context.close()
    EDITS_BODY = json.dumps([{'videoId': V1, 'aspect': '1:1'}, {'videoId': V2, 'aspect': '16:9'}])

    # ---------- Expand, before voting ----------
    pg, errs = load(b, 390, 844, voted=False)
    check('before voting the page is in the pre-vote state', pg.evaluate("document.body.classList.contains('pre-vote')"))
    pg.click('.expand-btn[data-video="competitor1"]'); pg.wait_for_timeout(400)
    check('Expand opens the dialog', pg.evaluate("document.querySelector('.wd-dialog')?.open === true"))
    src = pg.get_attribute('#wdFrame', 'src') or ''
    check('it plays that edit with autoplay', V1 in src and 'autoplay=1' in src, src)
    check('its title is the edit name', pg.inner_text('#wdTitle').strip() != '' and pg.inner_text('#wdTitle').strip() == pg.inner_text('#competitor1-name').strip(), pg.inner_text('#wdTitle'))
    check('before voting it names no creator and has no links', pg.inner_text('#wdMeta').strip() == '' and pg.locator('.wd-dialog a').count() == 0, pg.inner_text('#wdMeta'))
    fr = rect(pg, '.wd-frame')
    check('the frame is the edit\'s square shape and on screen', fr and abs(fr['w'] / fr['h'] - 1) < 0.03 and fr['r'] <= 390 and fr['x'] >= 0, fr)
    pg.screenshot(path=f'{SHOTS}/vote-expand-phone.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('Esc closes it and stops playback', not pg.evaluate("document.querySelector('.wd-dialog').open") and pg.get_attribute('#wdFrame', 'src') == 'about:blank', pg.get_attribute('#wdFrame', 'src'))
    check('focus returns to the Expand button', pg.evaluate("document.activeElement?.classList.contains('expand-btn')"))
    pg.click('.expand-btn[data-video="competitor2"]'); pg.wait_for_timeout(300)
    check('the second player opens its own edit, wide', V2 in (pg.get_attribute('#wdFrame', 'src') or '') and pg.evaluate("document.querySelector('.wd-dialog').classList.contains('is-wide')"))
    pg.mouse.click(3, 3); pg.wait_for_timeout(300)
    check('clicking the backdrop closes it', not pg.evaluate("document.querySelector('.wd-dialog').open"))
    _real = [e for e in errs if 'docChanges' not in e]     # the mock Firestore has no docChanges; unrelated to the player
    check('no page errors from the player', not _real, _real)
    pg.context.close()

    # ---------- the dialog is big: most of the window height, nothing cut off ----------
    EDITS_BODY = json.dumps([{'videoId': V1, 'aspect': '9:16'}, {'videoId': V2, 'aspect': '16:9'}])
    for (W, H, tag) in ((1280, 900, 'desktop'), (390, 844, 'phone')):
        pg, errs = load(b, W, H, voted=False)
        pg.click('.expand-btn[data-video="competitor1"]'); pg.wait_for_timeout(400)
        fr, hd, mt = rect(pg, '.wd-frame'), rect(pg, '.wd-head'), rect(pg, '#wdMeta')
        check(f'{tag}: title row, picture and credit line all fit the window', hd['y'] >= 0 and mt['b'] <= H + 1 and fr['x'] >= 0 and fr['r'] <= W, (hd, fr, mt))
        check(f'{tag}: a vertical edit is shown tall (most of the height the window allows)', fr['h'] >= min(H - 128, 980) - 4 or fr['w'] >= 0.94 * W - 4, (fr, H))
        check(f'{tag}: the title row is as wide as the picture, never wider', abs(hd['w'] - fr['w']) < 2, (hd, fr))
        if tag == 'desktop':
            print(f"        info: desktop vertical edit frame is {round(fr['w'])}x{round(fr['h'])} (was about 349x620)")
            pg.screenshot(path=f'{SHOTS}/vote-expand-big-desktop.png')
        pg.context.close()
    EDITS_BODY = json.dumps([{'videoId': V1, 'aspect': '1:1'}, {'videoId': V2, 'aspect': '16:9'}])

    # ---------- Expand, after voting ----------
    pg, errs = load(b, 1280, 900, voted=True)
    check('after voting the page is not in the pre-vote state', not pg.evaluate("document.body.classList.contains('pre-vote')"))
    pg.click('.expand-btn[data-video="competitor1"]'); pg.wait_for_timeout(400)
    check('after voting the dialog shows the credit line', pg.inner_text('#wdMeta').strip() != '', pg.inner_text('#wdMeta'))
    pg.screenshot(path=f'{SHOTS}/vote-expand-desktop.png')
    pg.context.close()
    b.close()

print('\n' + ('ALL PASSED' if not failed else f'{len(failed)} FAILED: {failed}'))
raise SystemExit(1 if failed else 0)
