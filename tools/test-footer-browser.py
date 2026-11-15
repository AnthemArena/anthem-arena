# Footer, legal strip and the profile share band (desktop, 393px, 360px), and the id-based profile link, on the REAL pages with the in-memory Firestore.
#   python3 tools/test-footer-browser.py
import os, sys
_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test-profile-mobile-browser.py')).read()
exec(compile(_src[:_src.index('with sync_playwright() as p:')], 'harness', 'exec'))   # same fixtures, server and mocks as the profile mobile test
import datetime, re
FOOTER_CAP = 1200

def goto(browser, url_path, viewer='owner', seed=None, w=1280, h=900):
    ctx = browser.new_context(viewport={'width': w, 'height': h})
    ids = (f"localStorage.setItem('username',{json.dumps(viewer)});localStorage.setItem('tournamentUserId','u_{viewer}');localStorage.setItem('userId','u_{viewer}');") if viewer else ''
    init = ids + "if(!sessionStorage.getItem('fs'))sessionStorage.setItem('fs'," + json.dumps(json.dumps(seed or [PROFILE])) + ");"
    init += "window.__opened=[];window.open=function(u){window.__opened.push(String(u));return null;};window.__copied=[];try{Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__copied.push(String(t));return Promise.resolve();}},configurable:true});}catch(e){}"
    ctx.add_init_script(init)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def route(r):
        u = r.request.url; path = urlparse(u).path
        if 'firebase-firestore' in u: r.fulfill(body=FS, content_type='application/javascript')
        elif 'firebase-app' in u: r.fulfill(body=APP, content_type='application/javascript')
        elif 'firebase-auth' in u: r.fulfill(body=AUTH, content_type='application/javascript')
        elif path.endswith('/api/matches'): r.fulfill(body=json.dumps(matches), content_type='application/json', headers={'X-Cache': 'MOCK'})
        elif '/api/' in u: r.fulfill(status=404, body='{}', content_type='application/json')
        elif u.startswith('https://ddragon.leagueoflegends.com') or u.startswith('https://img.youtube.com'): r.fulfill(body=PNG, content_type='image/png')
        elif 'gstatic.com' in u or 'googleapis' in u or 'cdnjs' in u or 'google-analytics' in u or 'googletagmanager' in u: r.fulfill(body='', content_type='text/css' if u.endswith('.css') else 'text/javascript')
        else: r.continue_()
    pg.route('**/*', route)
    pg.goto(f'http://127.0.0.1:{PORT}{url_path}')
    pg.wait_for_timeout(2500)
    return pg, errs

FOOTER_JS = """(() => {
  const f = document.querySelector('footer.main-footer'); if (!f) return null;
  const small = [...f.querySelectorAll('a, button')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 24) || e.getAttribute('aria-label'), Math.round(r.width), Math.round(r.height)]; }).filter(x => x[2] < 44 && !(x[0] || '').startsWith('see For') );
  const inline = [...f.querySelectorAll('.footer-disclaimer a')].map(e => e.textContent.trim());
  const com = f.querySelector('.footer-community'), soc = f.querySelector('.footer-social'), txt = com && com.querySelector('.footer-text');
  return { small, inline, overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    social: !!(com && soc && com.contains(soc)), sameEdge: !!(txt && soc && Math.abs(txt.getBoundingClientRect().left - soc.getBoundingClientRect().left) < 2),
    below: !!(txt && soc && soc.getBoundingClientRect().top >= txt.getBoundingClientRect().bottom - 1 && soc.getBoundingClientRect().top - txt.getBoundingClientRect().bottom < 80),
    text: f.innerText };
})()"""

with sync_playwright() as p:
    b = p.chromium.launch()
    year = str(datetime.date.today().year)
    for W in (1280, 393, 360):
        print(f'--- profile page at {W}px: share band, footer, legal strip ---')
        pg, errs = goto(b, '/profile.html?user=Owner', w=W, h=900 if W > 500 else 852)
        band = pg.locator('#profileShareBand')
        check(f'{W}: band is on the profile page, titled "Share this profile", with X, Reddit and Copy link only (no Discord, no Ko-fi)', band.is_visible() and 'Share this profile' in band.inner_text() and [t.strip().lower() for t in band.locator('button').all_inner_texts()] == ['post', 'reddit', 'copy link'] and pg.locator('#shareTwitterBtn').get_attribute('aria-label') == 'Post on X' and 'ko-fi' not in band.inner_text().lower() and 'discord' not in band.inner_text().lower(), band.inner_text()[:120])
        check(f'{W}: the band uses the X logo (not the bird), and the button reads Post', band.locator('svg.x-logo').count() == 1)
        bb = pg.evaluate("(() => { const a = document.querySelector('#profileShareBand .cta-actions'); const bs = [...a.querySelectorAll('button')].map(b => b.getBoundingClientRect()); return { cols: getComputedStyle(a).gridTemplateColumns.split(' ').length, hs: bs.map(r => Math.round(r.height)), over: a.scrollWidth > a.clientWidth + 1, inside: bs.every(r => r.left >= 0 && r.right <= innerWidth), span: [...a.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().width)) }; })()")
        if W < 500:
            check(f'{W}: share grid is 2 columns with Copy link full width, every button 44px+, nothing clipped', bb['cols'] == 2 and all(h >= 44 for h in bb['hs']) and not bb['over'] and bb['inside'] and bb['span'][2] > bb['span'][0] * 1.7, bb)
        else:
            check(f'{W}: share buttons are 44px+ and inside the page', all(h >= 44 for h in bb['hs']) and bb['inside'], bb)
        pg.locator('#copyLinkBtn').scroll_into_view_if_needed(); pg.click('#copyLinkBtn'); pg.wait_for_timeout(300)
        copied = pg.evaluate('window.__copied')
        check(f'{W}: Copy link copies this profile by id (not the site root)', copied == [f'http://127.0.0.1:{PORT}/profile?uid=u_owner'], copied)
        live = pg.evaluate("(() => { const l = document.getElementById('copyLiveRegion'); return l ? [l.getAttribute('role'), l.getAttribute('aria-live'), l.textContent] : null; })()")
        check(f'{W}: "Profile link copied" is announced (role=status, aria-live) and shown', live and live[0] == 'status' and live[1] == 'polite' and live[2] == 'Profile link copied' and 'Profile link copied' in pg.inner_text('.copy-success-toast'), live)
        pg.click('#shareTwitterBtn'); pg.click('#shareRedditBtn'); pg.wait_for_timeout(200)
        opened = pg.evaluate('window.__opened')
        body = ' '.join(opened).lower()
        check(f'{W}: X and Reddit share the id link with fixed neutral text (no pick, percentage or standing)', len(opened) == 2 and 'uid%3du_owner' in body.replace('%253d', '%3d').lower() and 'owner%20on%20arcane%20moments' in body and '%25' not in body.replace('%2520', '') and not any(w in body for w in ('pick', 'voted', 'winning', 'losing', 'underdog', 'lead')), opened)
        f = pg.evaluate(FOOTER_JS)
        check(f'{W}: footer: nothing overflows the page', f and not f['overflow'], f and f['overflow'])
        check(f'{W}: footer: every link, icon and button is 44px+ tall', f and not f['small'], f and f['small'])
        check(f'{W}: footer: social icons sit in the Community column, directly under its text, on its left edge', f and f['social'] and f['sameEdge'] and f['below'], f and [f['social'], f['sameEdge'], f['below']])
        t = f['text']
        check(f'{W}: legal strip: this year, "Site design and code", no "All rights reserved", creators sentence, disclaimer words, "·" separators, About only once', (f'© {year} Arcane Moments. Site design and code.' in t) and 'All rights reserved' not in t and 'Edits belong to their creators and play from their own YouTube channels.' in t and 'see For creators' in t and 'Riot Games does not endorse' in t and '•' not in t and pg.evaluate("[...document.querySelectorAll('.footer-legal-links .separator')].map(e => e.textContent.trim()).join('')") == '··' and len(re.findall(r'\babout\b', t.lower())) == 1, t[-700:])
        rl = pg.evaluate("(() => { const a = [...document.querySelectorAll('.footer-disclaimer a')].find(e => e.textContent.includes('Legal Jibber')); return a ? [a.href, a.target, a.rel] : null; })()")
        check(f'{W}: "Legal Jibber Jabber" links to Riot\'s own page, in a new tab with noopener', rl and rl[0] == 'https://www.riotgames.com/en/legal' and rl[1] == '_blank' and 'noopener' in rl[2], rl)
        labels = pg.evaluate("[...document.querySelectorAll('.footer-social a')].map(a => a.getAttribute('aria-label'))")
        check(f'{W}: social icons have full names', labels == ['Arcane Moments on X', 'Arcane Moments on YouTube', 'Arcane Moments on TikTok', 'Arcane Moments on Instagram', 'Arcane Moments on Facebook', 'Arcane Moments on Tumblr'], labels)
        nav = pg.evaluate("[...document.querySelectorAll('nav[aria-label=Footer] a')].map(a => a.textContent.trim())")
        check(f'{W}: footer links: Home, Feed, Matches, Brackets, Gallery, Stats, About (one list)', nav == ['Home', 'Feed', 'Matches', 'Brackets', 'Gallery', 'Stats', 'About'], nav)
        ct = pg.evaluate("""(() => {
          const parse = c => { const m = c.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
          const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          const bgOf = el => { let layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0) layers.push(c); if (c.a >= 1) break; } let base = { r: 10, g: 6, b: 16 }; for (const c of layers.reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) }; return base; };
          const ratio = el => { const fg = parse(getComputedStyle(el).color), bg = bgOf(el); const a = lum(fg) + 0.05, b = lum(bg) + 0.05; return Math.max(a, b) / Math.min(a, b); };
          const out = {};
          for (const [k, sel] of [['disclaimer', '.footer-disclaimer'], ['copyright', '.footer-copyright'], ['links', '.footer-links a'], ['support', '.footer-support'], ['legal', '.footer-legal-links a'], ['heading', '.footer-heading']]) { const e = document.querySelector('footer.main-footer ' + sel); out[k] = e ? Math.round(ratio(e) * 10) / 10 : null; }
          return out;
        })()""")
        check(f'{W}: footer text contrast is at least 4.5:1 (legal text, links, headings, support line)', all(v is not None and v >= 4.5 for v in ct.values()), ct)
        if W < 500:
            lay = pg.evaluate("""(() => {
              const f = document.querySelector('footer.main-footer'); const links = [...document.querySelectorAll('nav[aria-label=Footer] a')].map(a => a.getBoundingClientRect());
              const legal = [...document.querySelectorAll('.footer-legal-links a')].map(a => Math.round(a.getBoundingClientRect().top));
              const cp = document.querySelector('.footer-copyright'); const lh = parseFloat(getComputedStyle(cp).lineHeight) || parseFloat(getComputedStyle(cp).fontSize) * 1.5;
              const tg = document.querySelector('.footer-tagline');
              return { h: Math.round(f.getBoundingClientRect().height), lefts: [...new Set(links.map(r => Math.round(r.left)))].length, rows: [...new Set(links.map(r => Math.round(r.top)))].length, legal, cpLines: Math.round(cp.getBoundingClientRect().height / lh), tagline: tg ? getComputedStyle(tg).display : 'none' };
            })()""")
            check(f'{W}: mobile footer is short (under {FOOTER_CAP}px), the tagline is hidden', lay['h'] < FOOTER_CAP and lay['tagline'] == 'none', lay)
            check(f'{W}: Explore links are in two columns (7 links in 4 rows)', lay['lefts'] == 2 and lay['rows'] == 4, lay)
            check(f'{W}: For creators, Privacy and Terms are one row', len(lay['legal']) == 3 and len(set(lay['legal'])) == 1, lay['legal'])
            check(f'{W}: the copyright line is one line', lay['cpLines'] == 1, lay['cpLines'])
        pg.screenshot(path=f'{SHOTS}/footer-{W}.png', full_page=True)
        check(f'{W}: no JS errors', not real(errs), real(errs)[:2])
        pg.context.close()

    print('--- a page that is not the profile: no band ---')
    pg, errs = goto(b, '/about.html', w=393, h=852)
    check('about page: no share band, footer and Ko-fi line still there', pg.locator('#profileShareBand').count() == 0 and pg.locator('.footer-cta-banner').count() == 0 and pg.locator('footer.main-footer').count() == 1 and pg.locator('.footer-support a[rel*=noopener]').count() == 1)
    pg.context.close()

    print('--- id link: rename, old name, unknown id, both in the URL ---')
    RENAMED = [('profiles/u_owner', dict(PROFILE[1], username='Renamed')), ('profiles/u_other', dict(username='Other', avatar={'type': 'emoji', 'value': '🎵'}, companionId='jinx', createdAt=now - 86400000))]
    pg, errs = goto(b, '/profile.html?uid=u_owner', viewer='visitor', seed=RENAMED)
    check('uid link lands on the renamed person (name shown, share band links by id)', pg.inner_text('#profileUsername').strip().lower() == 'renamed' and pg.locator('#profileShareBand').is_visible(), pg.inner_text('#profileUsername'))
    pg.context.close()
    pg, errs = goto(b, '/profile.html?user=Owner', viewer='visitor', seed=RENAMED)
    dbg = [pg.inner_text('#profileUsername'), pg.evaluate("document.body.innerText.toLowerCase().includes('new to arcane moments')"), pg.locator('#profileShareBand').is_hidden(), pg.evaluate("document.body.innerText.toLowerCase().includes('renamed')")]
    check('old name link after a rename does not show the renamed person (it shows the existing generated placeholder, and no share band)', dbg[0].strip().lower() == 'owner' and not dbg[3] and dbg[2], dbg)
    pg.context.close()
    pg, errs = goto(b, '/profile.html?uid=u_nobody', viewer='visitor', seed=RENAMED)
    check('unknown uid shows "profile not found" (no placeholder profile)', pg.locator('#notFoundState').is_visible() and pg.locator('#profileContent').is_hidden() and pg.locator('#profileShareBand').is_hidden())
    pg.context.close()
    pg, errs = goto(b, '/profile.html?uid=../x', viewer='visitor', seed=RENAMED)
    check('malformed uid shows "profile not found"', pg.locator('#notFoundState').is_visible() and pg.locator('#profileContent').is_hidden())
    pg.context.close()
    pg, errs = goto(b, '/profile.html?uid=u_other&user=Renamed', viewer='visitor', seed=RENAMED)
    check('uid wins when both are in the URL', pg.inner_text('#profileUsername').strip().lower() == 'other', pg.inner_text('#profileUsername'))
    pg.context.close()
    pg, errs = goto(b, '/profile.html?uid=u_nobody&user=Renamed', viewer='visitor', seed=RENAMED)
    check('an unknown uid never falls back to the name in the URL', pg.locator('#notFoundState').is_visible() and pg.locator('#profileContent').is_hidden())
    pg.context.close()
    b.close()

httpd.shutdown()
print('FAILED: ' + ', '.join(failed) if failed else 'all footer checks passed')
sys.exit(1 if failed else 0)
