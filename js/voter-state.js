// voter-state.js: has this visitor ever voted? Decided by votes cast on this device, not by sign-in (everyone has an anonymous account).
// userVotes is the localStorage "userVotes" map; keys are the other place a vote is remembered (vote_<cup>_<match>).
export function hasCastVotes(userVotes = {}, keys = []) {
    return Object.keys(userVotes || {}).length > 0 || keys.some(k => typeof k === 'string' && k.startsWith('vote_'));
}

// the same question, answered from this browser's storage
export function visitorHasVoted() {
    try {
        return hasCastVotes(JSON.parse(localStorage.getItem('userVotes') || '{}') || {}, Object.keys(localStorage));
    } catch { return false; }
}
