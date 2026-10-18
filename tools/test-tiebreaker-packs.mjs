// node tools/test-tiebreaker-packs.mjs: every champion pack voices both tie-breaker steps, with only known placeholders.
import assert from 'node:assert/strict';
import fs from 'node:fs';
let pass = 0; const t = (n, f) => { f(); console.log('  ok  ', n); pass++; };
const KNOWN = new Set(['matchTitle', 'moment1', 'moment2', 'hoursLeft']);
for (const id of ['jinx', 'vi', 'caitlyn']) {
    const pack = JSON.parse(fs.readFileSync(new URL(`../champion-packs/${id}.json`, import.meta.url), 'utf8'));
    for (const key of ['tiebreaker', 'tiebreaker-final']) {
        t(`${id}: ${key} has lines and buttons, only known placeholders`, () => {
            const a = pack.alerts[key];
            assert.ok(a && a.messages.length >= 3 && a.buttons.length >= 3, 'lines and buttons');
            for (const m of a.messages) { assert.equal(typeof m, 'string'); for (const [, name] of m.matchAll(/\{(\w+)\}/g)) assert.ok(KNOWN.has(name), `${m}: {${name}}`); }
            if (key === 'tiebreaker-final') assert.ok(a.messages.every(m => !/admin/i.test(m)), 'does not mention how a real tie is settled');
        });
    }
}
console.log(`${pass} passed`);
