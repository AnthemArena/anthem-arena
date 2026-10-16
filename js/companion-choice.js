// ========================================
// WHICH COMPANION (toast pack) A VISITOR GETS
// ========================================
// Pure functions over a localStorage-like object so they can be unit-tested.
//
//   chosen the companion themselves in Settings  -> their pick
//   never chose (or only ever got the default)   -> the cup's champion
//
// Before this existed the first visit wrote companionId = 'jinx' as a default, which looks exactly like a choice.
// So a stored value other than 'jinx' is treated as a choice (the default was always Jinx), and 'jinx' only counts
// as a choice when the explicit `companionChosen` flag is set (written by Settings, never by the default path).

export function hasChosenCompanion(storage) {
    if (storage.getItem('companionChosen') === 'true') return true;
    const stored = storage.getItem('companionId') || storage.getItem('championPack');
    return !!stored && stored !== 'jinx';
}

export function resolveCompanionId(storage, cupChampionId) {
    if (hasChosenCompanion(storage)) {
        return storage.getItem('companionId') || storage.getItem('championPack') || cupChampionId;
    }
    return cupChampionId;
}
