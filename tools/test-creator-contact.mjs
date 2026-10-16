// The creator removal link.   node tools/test-creator-contact.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CREATOR_EMAIL, REMOVAL_SUBJECT, removalMailto } from '../js/creator-contact.js';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

test('the mailto goes to the creator address with a subject and a starter message', () => {
    const u = new URL(removalMailto());
    assert.equal(u.protocol, 'mailto:'); assert.equal(u.pathname, CREATOR_EMAIL);
    assert.equal(u.searchParams.get('subject'), REMOVAL_SUBJECT);
    assert.match(u.searchParams.get('body'), /removed from Arcane Moments/);
});
test('an edit title is quoted in the message and survives odd characters', () => {
    const body = new URL(removalMailto('Jinx & "Vi" #1 \u{1F480}')).searchParams.get('body');
    assert.ok(body.includes('"Jinx & "Vi" #1 \u{1F480}"'));
});
test('the address is written in one file only (js/creator-contact.js), not in the pages', () => {
    for (const f of ['../music-gallery.html', '../about.html', '../js/footer.js', '../js/music-gallery.js']) assert.ok(!read(f).includes(CREATOR_EMAIL), f);
});
test('the gallery, the About page and the footer all link creators to the right place', () => {
    assert.match(read('../music-gallery.html'), /data-creator-mail/); assert.match(read('../music-gallery.html'), /js\/creator-contact\.js/);
    assert.match(read('../about.html'), /id="creators"/); assert.match(read('../about.html'), /js\/creator-contact\.js/);
    assert.match(read('../js/footer.js'), /href="\/about#creators"/);
});
console.log(`\n${passed} tests passed`);
