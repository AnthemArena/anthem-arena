// Which voice a skin speaks with. A champion pack (champion-packs/<id>.json) is the base voice; a skin can use another voice
// set instead (champion-packs/<voice>.json holds only the sections it rewrites). Several skins can share one set, so a
// skin never needs its own copy of the lines. Pure helpers (no DOM, no fetch), tested by tools/test-champion-voice.mjs.

// Jinx: the Arcane skins keep the base (Arcane) voice, every other skin speaks with the original, louder Jinx unless it has
// a set of its own (`skins`: skin number -> set). A set can name the set it builds on with "extends" ("jinx-original"), so it only
// has to rewrite what its theme gives it.
export const VOICES = {
    jinx: { baseSkins: [37], skins: { 60: 'jinx-arcane-fractured', 1: 'jinx-crime-city', 2: 'jinx-firecracker', 4: 'jinx-star-guardian', 13: 'jinx-odyssey', 20: 'jinx-project', 51: 'jinx-cafe-cuties', 65: 'jinx-ocean-song', 3: 'jinx-zombie-slayer', 12: 'jinx-ambitious-elf', 29: 'jinx-heartseeker', 62: 'jinx-t1', 38: 'jinx-battle-cat', 40: 'jinx-battle-cat' }, other: 'jinx-original' },
    vi: { baseSkins: [29], skins: { 1: 'vi-neon-strike', 2: 'vi-officer', 3: 'vi-debonair', 4: 'vi-demon', 11: 'vi-project', 5: 'vi-warring-kingdoms', 12: 'vi-heartbreaker', 20: 'vi-psyops', 30: 'vi-heartache', 39: 'vi-primal-ambush', 48: 'vi-arcane-brawler', 49: 'vi-t1' }, other: 'vi-original' },
    // Caitlyn: the Arcane skins (Enforcer 28, Commander 50) keep the base voice, every other skin speaks with the original.
    // The prestige skins (20, 29, 51) speak with the voice of the skin they are a prestige version of
    caitlyn: { baseSkins: [28], skins: { 1: 'caitlyn-resistance', 2: 'caitlyn-sheriff', 3: 'caitlyn-safari', 4: 'caitlyn-arctic-warfare', 5: 'caitlyn-officer', 6: 'caitlyn-headhunter', 10: 'caitlyn-lunar-wraith', 11: 'caitlyn-pulsefire', 13: 'caitlyn-pool-party', 19: 'caitlyn-arcade', 22: 'caitlyn-battle-academia', 30: 'caitlyn-snow-moon', 39: 'caitlyn-heartthrob', 48: 'caitlyn-drx', 50: 'caitlyn-arcane-commander', 54: 'caitlyn-firecracker', 20: 'caitlyn-arcade', 29: 'caitlyn-arcade', 51: 'caitlyn-arcane-commander' }, other: 'caitlyn-original' }
};

// The sections a voice set may rewrite; anything it leaves out falls back to the base pack.
export const VOICE_SECTIONS = ['alerts', 'achievements', 'bubble', 'modal', 'pages', 'share'];

// Voice-set id for a champion wearing a skin, or null for the pack's own (base) voice.
export function voiceSetFor(packId, skinNum) {
    const v = VOICES[packId];
    if (!v) return null;
    const n = Number(skinNum);
    return v.baseSkins.includes(n) ? null : (v.skins?.[n] || v.other);
}

// The base pack with a voice set laid over it, section by section, entry by entry.
export function mergeVoice(base, overlay) {
    if (!overlay) return base;
    const out = { ...base, voiceSet: overlay.id || null };
    for (const s of VOICE_SECTIONS) if (overlay[s]) out[s] = { ...(base[s] || {}), ...overlay[s] };
    return out;
}

// Lays a voice set over the base pack, first the set it extends (if any), then the set itself. `fetchJson(id)` returns a voice file
// or null; a missing file is skipped, so a skin whose set is unavailable still speaks with the voice below it.
export async function applyVoiceSet(base, voiceId, fetchJson) {
    const chain = [];
    for (let id = voiceId, n = 0; id && n < 4; n++) {
        const file = await fetchJson(id);
        if (!file) break;
        chain.unshift({ ...file, id });
        id = file.extends;
    }
    return chain.reduce((pack, set) => mergeVoice(pack, set), base);
}

// Loads the pack for a champion + skin. `fetchJson(id)` returns a pack or voice file (null when missing); a missing voice
// file just leaves the base voice. `cache` is a Map shared by the caller.
export async function loadVoicedPack(packId, skinNum, fetchJson, cache = new Map()) {
    const voiceId = voiceSetFor(packId, skinNum);
    const key = `${packId}:${voiceId || ''}`;
    if (cache.has(key)) return cache.get(key);
    const base = await fetchJson(packId);
    if (!base) return null;
    const pack = voiceId ? await applyVoiceSet(base, voiceId, fetchJson) : base;
    cache.set(key, pack);
    return pack;
}
