# Navigation (desktop, tablet, phone), avatar menu, phone menu backdrop, on the REAL pages with the in-memory Firestore.
#   python3 tools/test-nav-browser.py
import os, sys
_dir = os.path.dirname(os.path.abspath(__file__))
_fsrc = open(os.path.join(_dir, 'test-footer-browser.py')).read()
exec(compile(_fsrc[:_fsrc.rindex('with sync_playwright() as p:')], 'harness', 'exec'))   # profile harness + footer goto()
_goto_src = _fsrc[_fsrc.index('def goto('):_fsrc.index('FOOTER_JS')]
_goto_src = _goto_src.replace("w=1280, h=900):", "w=1280, h=900, extra=''):").replace("ctx.add_init_script(init)", "ctx.add_init_script(init + extra)")
exec(_goto_src)

VOTED = "localStorage.setItem('userVotes', JSON.stringify({'m1': {pick: 'a'}}));"
H = 852

def box(pg, sel):
    return pg.evaluate("(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height,v:r.width>0&&r.height>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'}}", sel)

def overflow(pg):
    return pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")

with sync_playwright() as p:
    b = p.chromium.launch()
    for W in (1280, 1024, 768, 393, 360):
        phone = W <= 768
        print(f'--- signed in at {W}px ---')
        pg, errs = goto(b, '/profile.html?user=Owner', w=W, h=H if phone else 900)
        links = box(pg, '.nav-links'); first = pg.evaluate("document.querySelector('.nav-links a').textContent.trim()")
        check(f'{W}: no gear, no dividers, no icon on any link', pg.locator('.nav-settings-btn, .nav-separator, .nav-links a i').count() == 0)
        check(f'{W}: nav is labelled "Main"', pg.get_attribute('nav.main-nav', 'aria-label') == 'Main')
        check(f'{W}: no sideways scroll', not overflow(pg))
        taps = pg.evaluate("(()=>['.notification-bell','.nav-avatar-btn'].concat(window.innerWidth<=768?['.mobile-menu-toggle']:[]).map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,Math.round(r.width),Math.round(r.height)]}))()")
        check(f'{W}: every nav control is 44px or more', all(w_ >= 44 and h_ >= 44 for _, w_, h_ in taps), taps)
        if not phone:
            lk = box(pg, '.nav-links')
            centre = (lk['l'] + lk['r']) / 2
            check(f'{W}: links are centred on the page axis (within 2px)', abs(centre - W / 2) <= 2, (centre, W / 2))
            check(f'{W}: links do not wrap (each link is one line)', all(h < 40 for h in pg.eval_on_selector_all('.nav-links a', 'els=>els.map(e=>e.getBoundingClientRect().height)')), box(pg, '.nav-links'))
            logo = box(pg, '.logo-link'); card = box(pg, '#navProfileCard')
            check(f'{W}: logo left of the links, card right of them, nothing overlaps', logo['r'] <= lk['l'] and card['l'] >= lk['r'] and card['r'] <= W, (logo['r'], lk['l'], lk['r'], card['l'], card['r']))
            check(f'{W}: hamburger hidden', not box(pg, '.mobile-menu-toggle')['v'])
        else:
            logo = box(pg, '.logo-link'); bell = box(pg, '.notification-bell'); av = box(pg, '.nav-avatar-btn'); ham = box(pg, '.mobile-menu-toggle')
            check(f'{W}: order is logo, bell, avatar, hamburger (left to right)', logo['r'] <= bell['l'] and bell['r'] <= av['l'] and av['r'] <= ham['l'], (logo['r'], bell['l'], av['l'], ham['l']))
            check(f'{W}: user cluster is on the right (bell starts in the right half)', bell['r'] > W / 2 and av['l'] > W / 2, bell)
            check(f'{W}: hamburger is the last control, inside the screen', ham['r'] <= W + 0.5, ham)
        # sticky on scroll
        pg.evaluate("window.scrollTo(0, 400)"); pg.wait_for_timeout(200)
        check(f'{W}: bar stays at the top when scrolled', abs(box(pg, '.main-nav')['t']) < 1, box(pg, '.main-nav'))
        pg.evaluate("window.scrollTo(0, 0)")

        # avatar menu
        pg.click('#navAvatarBtn'); pg.wait_for_timeout(150)
        m = box(pg, '#navUserMenu')
        items = pg.eval_on_selector_all('#navUserMenu [role=menuitem]', 'els=>els.map(e=>[e.textContent.trim(),e.getAttribute("href"),Math.round(e.getBoundingClientRect().height)])')
        check(f'{W}: avatar opens a menu: Profile, My votes, Settings', [i[0] for i in items] == ['Profile', 'My votes', 'Settings'] and pg.get_attribute('#navAvatarBtn', 'aria-expanded') == 'true', items)
        check(f'{W}: Profile -> /profile?user=Owner, My votes -> /profile?tab=votes', items[0][1].lower() == '/profile?user=owner' and items[1][1] == '/profile?tab=votes', items)
        check(f'{W}: menu rows are 44px+ and the menu is inside the screen', all(i[2] >= 44 for i in items) and m['l'] >= 0 and m['r'] <= W + 0.5, (items, m))
        check(f'{W}: focus moved to the first item', pg.evaluate("document.activeElement.textContent.trim()") == 'Profile')
        pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowDown')
        check(f'{W}: arrow keys move through the items', pg.evaluate("document.activeElement.textContent.trim()") == 'Settings')
        pg.keyboard.press('Home'); pg.keyboard.press('End')
        check(f'{W}: Home / End jump', pg.evaluate("document.activeElement.textContent.trim()") == 'Settings')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        check(f'{W}: Esc closes it and focus returns to the avatar', not box(pg, '#navUserMenu')['v'] and pg.evaluate("document.activeElement.id") == 'navAvatarBtn' and pg.get_attribute('#navAvatarBtn', 'aria-expanded') == 'false')
        pg.click('#navAvatarBtn'); pg.wait_for_timeout(100)
        pg.mouse.click(2, 300); pg.wait_for_timeout(100)
        check(f'{W}: tapping outside closes it', not box(pg, '#navUserMenu')['v'])
        if phone:
            ham = box(pg, '.mobile-menu-toggle'); pg.click('#navAvatarBtn'); pg.wait_for_timeout(100)
            m = box(pg, '#navUserMenu'); bar = box(pg, '.main-nav')
            check(f'{W}: the avatar menu does not cover the hamburger or move the bar', (m['t'] >= bar['b'] - 1 or m['l'] >= ham['r'] or m['r'] <= ham['l']) and abs(box(pg, '.main-nav')['h'] - bar['h']) < 1 and abs(box(pg, '.mobile-menu-toggle')['l'] - ham['l']) < 1, (m, ham, bar))
            pg.click('.mobile-menu-toggle'); pg.wait_for_timeout(300)
            check(f'{W}: opening the phone menu closes the avatar menu (one at a time)', not box(pg, '#navUserMenu')['v'] and pg.get_attribute('.mobile-menu-toggle', 'aria-expanded') == 'true')
            pg.click('#navAvatarBtn', force=True); pg.wait_for_timeout(300)
            check(f'{W}: ...and the avatar menu closes the phone menu', box(pg, '#navUserMenu')['v'] and pg.get_attribute('.mobile-menu-toggle', 'aria-expanded') == 'false')
            pg.keyboard.press('Escape')
        else:
            pg.click('#navAvatarBtn'); pg.wait_for_timeout(100); pg.click('#navMenuSettings'); pg.wait_for_timeout(500)
            check(f'{W}: Settings opens the settings modal and closes the menu', pg.locator('.settings-modal-overlay.active').count() == 1 and not box(pg, '#navUserMenu')['v'])
            pg.keyboard.press('Escape'); pg.evaluate("document.querySelector('.settings-modal-overlay.active .settings-close, .settings-modal-overlay.active [aria-label=Close]')?.click()")
        # bell still opens the panel (fresh page so the modal steps above cannot interfere)
        pg.context.close()
        pg, errs = goto(b, '/profile.html?user=Owner', w=W, h=H if phone else 900)
        pg.click('#notificationBell'); pg.wait_for_timeout(500)
        check(f'{W}: the bell still opens the notification panel', pg.evaluate("(()=>{const p=document.getElementById('notificationPanel');return !!p && getComputedStyle(p).display!=='none' && p.classList.contains('open')})()"))
        check(f'{W}: no JS errors', not [e for e in errs if 'docChanges' not in e], errs)
        pg.screenshot(path=f'{SHOTS}/nav-{W}.png')
        pg.context.close()

        if phone:
            print(f'--- phone menu at {W}px ---')
            pg, errs = goto(b, '/profile.html?user=Owner', w=W, h=H)
            pg.click('.mobile-menu-toggle'); pg.wait_for_timeout(400)
            sc = box(pg, '#navScrim'); nav = box(pg, '.main-nav'); ul = box(pg, '.nav-links')
            check(f'{W}: a dimmed backdrop sits under the bar and covers the page', sc['v'] and abs(sc['t'] - nav['b']) < 2 and sc['b'] >= H - 1 and float(pg.evaluate("getComputedStyle(document.getElementById('navScrim')).opacity")) > 0.9, sc)
            check(f'{W}: the bar stays above the backdrop', int(pg.evaluate("getComputedStyle(document.querySelector('.main-nav')).zIndex")) > int(pg.evaluate("getComputedStyle(document.getElementById('navScrim')).zIndex")))
            rows = pg.eval_on_selector_all('.nav-links a', 'els=>els.map(e=>Math.round(e.getBoundingClientRect().height))')
            check(f'{W}: menu rows are about 56px (not 70)', all(54 <= r <= 60 for r in rows) and len(rows) == 6, rows)
            check(f'{W}: all six items fit with room below', ul['b'] < H - 20, ul)
            check(f'{W}: page scroll is locked while open', pg.evaluate("getComputedStyle(document.body).overflow") == 'hidden')
            check(f'{W}: focus moved into the menu', pg.evaluate("document.activeElement.closest('.nav-links')!==null"))
            pg.mouse.click(W / 2, H - 40); pg.wait_for_timeout(400)
            check(f'{W}: tapping the backdrop closes it, restores scroll, focus on the hamburger', pg.get_attribute('.mobile-menu-toggle', 'aria-expanded') == 'false' and not box(pg, '#navScrim')['v'] and pg.evaluate("getComputedStyle(document.body).overflow") != 'hidden' and pg.evaluate("document.activeElement.className").find('mobile-menu-toggle') >= 0)
            pg.click('.mobile-menu-toggle'); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
            check(f'{W}: Esc closes it and returns focus to the hamburger', pg.get_attribute('.mobile-menu-toggle', 'aria-expanded') == 'false' and 'mobile-menu-toggle' in pg.evaluate("document.activeElement.className"))
            pg.click('.mobile-menu-toggle'); pg.wait_for_timeout(300)
            pg.evaluate("document.querySelector('.nav-links a[href=\"/stats\"]').addEventListener('click',e=>e.preventDefault())")
            pg.click('.nav-links a[href="/stats"]'); pg.wait_for_timeout(400)
            check(f'{W}: choosing a link closes the menu', pg.get_attribute('.mobile-menu-toggle', 'aria-expanded') == 'false' and not box(pg, '#navScrim')['v'])
            pg.screenshot(path=f'{SHOTS}/nav-{W}-menu.png')
            pg.context.close()

    print('--- claim states: no menu ---')
    for W in (1280, 393):
        pg, errs = goto(b, '/index.html', viewer=None, w=W, h=H)
        check(f'{W}: first visit shows the small claim avatar, no account menu', pg.locator('.claim-avatar').count() == 1 and pg.locator('#navAvatarBtn, #navUserMenu').count() == 0)
        pg.click('.claim-avatar'); pg.wait_for_timeout(500)
        check(f'{W}: the small claim avatar goes straight to the claim flow', pg.locator('.settings-modal-overlay.active, .username-modal, [class*=username-modal]').count() >= 1 and pg.locator('#navUserMenu').count() == 0)
        check(f'{W}: logged-out: nav links and bell present, no overflow, 44px targets', pg.locator('.nav-links a').count() == 6 and not overflow(pg) and all(t[1] >= 44 and t[2] >= 44 for t in pg.evaluate("['.claim-avatar','.notification-bell'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,Math.round(r.width),Math.round(r.height)]})")))
        if W == 1280:
            lk = box(pg, '.nav-links'); check(f'{W}: logged-out links are centred', abs((lk['l'] + lk['r']) / 2 - W / 2) <= 2, lk)
        pg.screenshot(path=f'{SHOTS}/nav-claim-small-{W}.png'); pg.context.close()
        pg, errs = goto(b, '/index.html', viewer=None, w=W, h=H, extra=VOTED)
        card = pg.locator('.profile-claim-state[role=button]')
        check(f'{W}: after a vote the full "Claim Your Profile!" card shows, no menu', card.count() == 1 and pg.locator('#navAvatarBtn, #navUserMenu').count() == 0 and not overflow(pg), card.count())
        card.click(); pg.wait_for_timeout(500)
        check(f'{W}: the card goes straight to the claim flow', pg.locator('.settings-modal-overlay.active, .username-modal, [class*=username-modal]').count() >= 1)
        pg.screenshot(path=f'{SHOTS}/nav-claim-card-{W}.png'); pg.context.close()

    print('--- nav on other pages, and the My votes target ---')
    for path in ('/index.html', '/feed.html', '/vote.html'):
        pg, errs = goto(b, path, w=393, h=H)
        ok = pg.locator('#navAvatarBtn').count() == 1 and not overflow(pg) and pg.locator('.nav-links a').count() == 6
        check(f'{path} (393): same nav, avatar menu present, no sideways scroll', ok)
        pg.context.close()
    pg, errs = goto(b, '/profile.html?tab=votes', w=393, h=H)
    check('/profile?tab=votes opens the Votes tab', pg.evaluate("document.querySelector('.tab-btn[data-tab=votes]')?.classList.contains('active')"))
    pg.context.close()
    pg, errs = goto(b, '/profile.html?tab=bogus', w=393, h=H)
    check('an unknown ?tab= value is ignored (no error)', not errs)
    pg.context.close()
    b.close()

httpd.shutdown()
print('FAILED: ' + ', '.join(failed) if failed else 'all nav checks passed')
sys.exit(1 if failed else 0)
