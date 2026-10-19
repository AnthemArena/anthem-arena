import assert from 'node:assert/strict';
import fs from 'node:fs';
import { voiceSetFor } from '../js/champion-voice.js';
import { SKIN_UNLOCKS } from '../js/champion-unlocks.js';
// every prestige (achievement) skin speaks with the voice of the skin it is a prestige version of, and that voice file exists
assert.equal(voiceSetFor('caitlyn', 20), 'caitlyn-arcade');
assert.equal(voiceSetFor('caitlyn', 29), 'caitlyn-arcade');
assert.equal(voiceSetFor('caitlyn', 51), 'caitlyn-arcane-commander');
assert.equal(voiceSetFor('jinx', 40), 'jinx-battle-cat');
for (const [packId, d] of Object.entries(SKIN_UNLOCKS)) for (const s of d.skins.filter(x => x.achievement)) {
    const id = voiceSetFor(packId, s.num);
    assert.ok(id && !/-original$/.test(id), `${packId} ${s.name} falls back to the generic voice`);
    assert.ok(fs.existsSync(new URL(`../champion-packs/${id}.json`, import.meta.url)), `${id}.json is missing`);
}
console.log('prestige voices tests passed');
