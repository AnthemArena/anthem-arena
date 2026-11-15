// Footer and share band rules that can be checked without a browser.
//   node tools/test-footer-static.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const htmls = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const footer = read('js/footer.js');

t('only the profile page loads the share band', () => {
    const withBand = htmls.filter(f => /data-share-band\s*=/.test(read(f)));
    assert.deepEqual(withBand, ['profile.html']);
    assert.match(read('profile.html'), /data-share-band="profile"/);
});
t('the band is only built when a page opts in, and shares the id link', () => {
    assert.match(footer, /dataset\?*\.shareBand === 'profile'/);
    assert.match(footer, /\/profile\?uid=/);
    assert.ok(!footer.includes('window.location.origin}`;') , 'no share of the bare site root');
});
t('no Discord button, no Ko-fi block in the band, Ko-fi is one footer line with noopener', () => {
    assert.ok(!/shareDiscordBtn|share-discord/.test(footer));
    assert.ok(!/cta-support|Enjoying the tournament/.test(footer));
    assert.match(footer, /class="footer-support"[^]*?ko-fi\.com\/arcanemoments[^]*?rel="noopener noreferrer"/);
});
t('no old Twitter bird anywhere (glyph, Font Awesome class or path)', () => {
    const files = [...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f), ...htmls];
    const hits = files.filter(f => /fa-twitter|M23 3a10\.9 10\.9 0 01-3\.14/.test(read(f)));
    assert.deepEqual(hits, []);
});
t('footer links list only pages that exist, and mirror the main nav (Feed included)', () => {
    const links = [...footer.matchAll(/<li><a href="(\/[^"?#]*)"/g)].map(m => m[1]);
    for (const l of ['/', '/feed', '/matches', '/brackets', '/music-gallery', '/stats', '/about']) assert.ok(links.includes(l), l);
    const exists = l => l === '/' || fs.existsSync(path.join(root, l.slice(1) + '.html'));
    assert.deepEqual(links.filter(l => !exists(l)), []);
    assert.ok(!footer.includes('status=completed'), 'the Results link had no target page');
    assert.equal(new Set(links).size, links.length, 'no page listed twice');
});
t('legal strip: year from code, no "All rights reserved", creators sentence, Riot link from riotgames.com, disclaimer text unchanged', () => {
    assert.match(footer, /new Date\(\)\.getFullYear\(\)\} Arcane Moments\. Site design and code\./);
    assert.ok(!/All rights reserved/.test(footer));
    assert.match(footer, /Edits belong to their creators and play from their own YouTube channels\./);
    assert.match(footer, /For credit or takedown requests, see <a href="\/about#creators">For creators<\/a>\./);
    assert.match(footer, /href="https:\/\/www\.riotgames\.com\/en\/legal" target="_blank" rel="noopener noreferrer">Legal Jibber Jabber<\/a>/);
    assert.match(footer, /policy using assets owned by Riot Games\. Riot Games does not endorse or\s+sponsor this project\./);
    assert.ok(!/<span class="separator"[^>]*>•/.test(footer), 'one separator: ·');
});
t('X button reads "Post" and is named "Post on X"; the tagline can be hidden on phones', () => {
    assert.match(footer, /id="shareTwitterBtn" aria-label="Post on X"[^]*?<svg class="x-logo"[^]*?<\/svg>\s*Post\s*<\/button>/);
    assert.match(footer, /class="footer-text footer-tagline"/);
});
t('every social icon has a name, opens in a new tab with noopener', () => {
    const anchors = [...footer.matchAll(/<a href="https:\/\/[^"]+" class="social-link"[^>]*>/g)].map(m => m[0]);
    assert.equal(anchors.length, 6);
    for (const a of anchors) assert.ok(/aria-label="Arcane Moments on \w+"/.test(a) && /target="_blank"/.test(a) && /rel="noopener noreferrer"/.test(a), a);
});
t('the profile page has no per-profile preview tags that could carry a pick (the static site cannot render per-profile previews)', () => {
    const h = read('profile.html');
    assert.ok(!/og:(title|description|image)[^>]*(\$\{|{{)/.test(h));
    const tag = p => (h.match(new RegExp('<meta property="' + p + '" content="([^"]*)"')) || [])[1];
    assert.equal(tag('og:title'), 'Profile | Arcane Moments');
    assert.match(tag('og:description'), /^A profile on Arcane Moments/);
    assert.equal(tag('og:image'), 'https://arcanemoments.netlify.app/og-image.png');
    assert.ok(!/\d+\s*%|\bvoted for\b|\bpick/i.test(tag('og:description')), 'nothing that reads as a pick, percentage or standing');
});
console.log(`${n} passed`);
