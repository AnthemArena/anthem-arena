// node tools/test-champion-lines.mjs: the welcome and encouragement lines of every pack can be found where the loader looks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dialogFor } from '../js/champion-lines.js';
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
console.log(`${pass} passed`);
