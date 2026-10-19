// node tools/test-champion-lines.mjs: the welcome and encouragement lines of every pack can be found where the loader looks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dialogFor, fillWelcomeText, WELCOME_PLACEHOLDERS } from '../js/champion-lines.js';
let pass = 0; const t = (n, f) => { f(); console.log('  ok  ', n); pass++; };
const TYPES = ['welcome-first-time', 'welcome-streak', 'welcome-comeback', 'welcome-back', 'encouragement'];
for (const id of ['jinx', 'vi', 'caitlyn', 'default']) {
    const pack = JSON.parse(fs.readFileSync(new URL(`../champion-packs/${id}.json`, import.meta.url), 'utf8'));
    t(`${id}: every welcome type and encouragement resolves to lines and buttons`, () => {
        for (const type of TYPES) {
            const d = dialogFor(pack, type);
            if (id === 'default' && type === 'encouragement') continue;     // the default pack has its own plain fallback in code
            assert.ok(d, `${id} ${type}`);
            assert.ok(d.messages.length && d.buttons.length, `${id} ${type} parts (details are optional)`);
        }
    });
}
t('unknown or empty input gives null', () => { assert.equal(dialogFor(null, 'welcome-back'), null); assert.equal(dialogFor({ alerts: {} }, 'welcome-back'), null); assert.equal(dialogFor({ alerts: { welcome: { x: { messages: [] } } } }, 'x'), null); });
t('fillWelcomeText fills every occurrence of {days} and {liveCount}, and leaves other text alone', () => {
    assert.equal(fillWelcomeText('{days} days. {days}!', { days: 5 }), '5 days. 5!');
    assert.equal(fillWelcomeText('No rules. {liveCount} matches. Have fun.', { liveCount: 12 }), 'No rules. 12 matches. Have fun.');
    assert.equal(fillWelcomeText('Both {days} and {liveCount}', { days: 3, liveCount: 0 }), 'Both 3 and 0');
    assert.equal(fillWelcomeText('Nothing to fill', { days: 5 }), 'Nothing to fill');
    assert.equal(fillWelcomeText(undefined, {}), '');
});
t('every welcome line of every pack uses only placeholders the toast fills in ({days}, {liveCount})', () => {
    const files = fs.readdirSync(new URL('../champion-packs/', import.meta.url)).filter(f => f.endsWith('.json'));
    assert.ok(files.length > 40, 'all packs are scanned');
    const bad = [];
    for (const f of files) {
        const pack = JSON.parse(fs.readFileSync(new URL(`../champion-packs/${f}`, import.meta.url), 'utf8'));
        for (const type of TYPES.filter(x => x.startsWith('welcome-'))) {
            const d = dialogFor(pack, type); if (!d) continue;
            for (const text of [...(d.messages || []), ...(d.details || [])].filter(x => typeof x === 'string')) {
                for (const m of text.matchAll(/\{(\w+)\}/g)) if (!WELCOME_PLACEHOLDERS.includes(m[1])) bad.push(`${f} ${type}: {${m[1]}}`);
            }
        }
    }
    assert.deepEqual(bad, []);
});
console.log(`${pass} passed`);
