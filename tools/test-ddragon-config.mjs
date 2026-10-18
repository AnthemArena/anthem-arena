import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DATA_DRAGON_VERSION, ddragonUrl, withCurrentVersion, ARCANE_CONFIG } from '../js/arcane-config.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
t('urls carry the one configured version', () => {
    assert.equal(ddragonUrl('img/champion/Jinx.png'), `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/Jinx.png`);
    assert.equal(ARCANE_CONFIG.dataDragonVersion, DATA_DRAGON_VERSION);
    assert.equal(ARCANE_CONFIG.dataDragonChampionCdn, ddragonUrl('img/champion/'));
});
t('an old versioned url is brought to the current version; unversioned and other urls are left alone', () => {
    assert.equal(withCurrentVersion('https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/Vi.png'), ddragonUrl('img/champion/Vi.png'));
    assert.equal(withCurrentVersion('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Vi_0.jpg'), 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Vi_0.jpg');
    assert.equal(withCurrentVersion('https://example.com/cdn/1.2.3/x.png'), 'https://example.com/cdn/1.2.3/x.png');
    assert.equal(withCurrentVersion(undefined), undefined);
});
t('no code file hard-codes a Data Dragon version any more (only the config, the pack data and old helper pages may)', () => {
    const bad = [];
    for (const f of fs.readdirSync(new URL('../js/', import.meta.url))) {
        if (!f.endsWith('.js') || f === 'arcane-config.js') continue;
        if (/ddragon\.leagueoflegends\.com\/cdn\/\d/.test(fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8'))) bad.push(f);
    }
    assert.deepEqual(bad, []);
});
console.log(`\n${n} passed`);
