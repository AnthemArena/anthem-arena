// ========================================
// XP LEDGER (pure helpers, no Firebase)
// ========================================
// One XP total per person lives on their profile document (profiles/<uid>.xp, plus profiles/<uid>.packXp = XP earned per
// companion). The browser keeps a copy; XP only ever goes up, so when two copies disagree the larger one wins.

export const PACK_IDS = ['jinx', 'vi', 'caitlyn'];

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

// The companion that is active right now (falls back to Jinx).
export function activePackId(storage = globalThis.localStorage) {
    try { return storage.getItem('companionId') || storage.getItem('championPack') || 'jinx'; } catch { return 'jinx'; }
}

// { jinx: 120, vi: 40 } kept in localStorage.userPackXP; anything that is not a positive number is dropped.
export function readPackXp(storage = globalThis.localStorage) {
    try { return cleanPackXp(JSON.parse(storage.getItem('userPackXP') || '{}')); } catch { return {}; }
}

export function cleanPackXp(raw) {
    const out = {};
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) { const n = num(v); if (n > 0) out[k] = n; }
    return out;
}

export function addPackXp(storage, packId, amount) {
    const xp = readPackXp(storage);
    const key = packId || 'jinx';
    xp[key] = num(xp[key]) + num(amount);
    try { storage.setItem('userPackXP', JSON.stringify(xp)); } catch { /* storage full or blocked */ }
    return xp;
}

// Per-pack maximum of two copies.
export function mergePackXp(a, b) {
    const x = cleanPackXp(a), y = cleanPackXp(b), out = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) out[k] = Math.max(num(x[k]), num(y[k]));
    return out;
}

// XP earned before per-companion XP existed only lives in the account total. If the companions add up to less than the
// total, the difference is given to the active companion (only ever adds, so running it twice changes nothing).
export function backfillPackXp(packXp, totalXp, activeId = 'jinx') {
    const xp = cleanPackXp(packXp);
    const sum = Object.values(xp).reduce((a, b) => a + b, 0);
    const missing = num(totalXp) - sum;
    if (missing > 0) { const id = PACK_IDS.includes(activeId) ? activeId : 'jinx'; xp[id] = num(xp[id]) + missing; }
    return xp;
}

// Merge this browser's numbers with the profile's: { xp, packXp, changedLocal, changedRemote }.
export function mergeXp(local, remote) {
    const lx = num(local?.xp), rx = num(remote?.xp);
    const xp = Math.max(lx, rx);
    const packXp = mergePackXp(local?.packXp, remote?.packXp);
    const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
    return {
        xp, packXp,
        changedLocal: xp !== lx || !same(packXp, cleanPackXp(local?.packXp)),
        changedRemote: xp !== rx || !same(packXp, cleanPackXp(remote?.packXp))
    };
}

// Consecutive-day voting streak that ends on the most recent vote day (so it can be worked out for anybody, not only the
// viewer). Days are UTC dates, like the rest of the XP rules.
export function streakFromVotes(votes) {
    const days = [...new Set((votes || []).map(v => new Date(v.timestamp).toISOString().slice(0, 10)).filter(d => d.length === 10))].sort();
    if (!days.length) return 0;
    let streak = 1;
    for (let i = days.length - 1; i > 0; i--) {
        const gap = (Date.parse(days[i]) - Date.parse(days[i - 1])) / 86400000;
        if (gap === 1) streak++; else break;
    }
    return streak;
}
