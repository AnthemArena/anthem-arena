// Which voice a skin speaks with. A champion pack (champion-packs/<id>.json) is the base voice; a skin can use another voice
// set instead (champion-packs/<voice>.json holds only the sections it rewrites). Several skins can share one set, so a
// skin never needs its own copy of the lines. Pure helpers (no DOM, no fetch), tested by tools/test-champion-voice.mjs.

// Jinx: the Arcane skins keep the base (Arcane) voice, every other skin speaks with the original, louder Jinx.
export const VOICES = {
    jinx: { baseSkins: [37, 60], other: 'jinx-original' }
};

// The sections a voice set may rewrite; anything it leaves out falls back to the base pack.
export const VOICE_SECTIONS = ['alerts', 'achievements', 'bubble', 'modal', 'pages', 'share'];

// Voice-set id for a champion wearing a skin, or null for the pack's own (base) voice.
export function voiceSetFor(packId, skinNum) {
    const v = VOICES[packId];
    if (!v) return null;
    return v.baseSkins.includes(Number(skinNum)) ? null : v.other;
}

// The base pack with a voice set laid over it, section by section, entry by entry.
export function mergeVoice(base, overlay) {
    if (!overlay) return base;
    const out = { ...base, voiceSet: overlay.id || null };
    for (const s of VOICE_SECTIONS) if (overlay[s]) out[s] = { ...(base[s] || {}), ...overlay[s] };
    return out;
}

// Loads the pack for a champion + skin. `fetchJson(id)` returns a pack or voice file (null when missing); a missing voice
// file just leaves the base voice. `cache` is a Map shared by the caller.
export async function loadVoicedPack(packId, skinNum, fetchJson, cache = new Map()) {
    const voiceId = voiceSetFor(packId, skinNum);
    const key = `${packId}:${voiceId || ''}`;
    if (cache.has(key)) return cache.get(key);
    const base = await fetchJson(packId);
    if (!base) return null;
    const overlay = voiceId ? await fetchJson(voiceId) : null;
    const pack = mergeVoice(base, overlay);
    cache.set(key, pack);
    return pack;
}
