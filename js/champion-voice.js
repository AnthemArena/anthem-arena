// Which voice a skin speaks with. A champion pack (champion-packs/<id>.json) is the base voice; a skin can use another voice
// set instead (champion-packs/<voice>.json holds only the sections it rewrites). Several skins can share one set, so a
// skin never needs its own copy of the lines. Pure helpers (no DOM, no fetch), tested by tools/test-champion-voice.mjs.

// A champion pack (champion-packs/<id>.json) is the voice. Every skin uses it (see VOICES).
export const VOICES = {
    // One voice per champion: every skin speaks with the champion's own pack (champion-packs/<id>.json).
    // The machinery below is kept so a champion could get skin voice sets again: add `skins: { <skinNum>: '<voice-file-id>' }` (and
    // `other` for a default set), put the voice file in champion-packs/, and tools/test-champion-voice.mjs shows what a set must cover.
    jinx: { baseSkins: [], skins: {}, other: null },
    vi: { baseSkins: [], skins: {}, other: null },
    caitlyn: { baseSkins: [], skins: {}, other: null },
    ekko: { baseSkins: [], skins: {}, other: null }
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
