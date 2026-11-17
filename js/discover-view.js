// Pure helpers for the admin "Discover new edits" panel (js/admin-discover.js), kept apart so they can be tested.
// groups: [{ id: 'jinx', label: 'Jinx', candidates: [{ videoId, url, ... }] }]   ignored: Map of discover-ignored document ids.
//
// "Ignore" is per champion: "Not for Jinx" hides the video from the Jinx list only, so a Jinx + Ekko edit can still be
// picked up for an Ekko cup. The document id is "<champion>_<videoId>". An older document with the bare video id (made
// before ignores were per champion) still hides the video everywhere.

export const ignoreKey = (ruleId, videoId) => `${ruleId}_${videoId}`;
export const isIgnored = (ignored, ruleId, videoId) => ignored.has(ignoreKey(ruleId, videoId)) || ignored.has(videoId);

export const visibleFor = (groups, ignored, ruleId) =>
    (groups.find(g => g.id === ruleId)?.candidates || []).filter(c => !isIgnored(ignored, ruleId, c.videoId));

// The champions a video is still wanted for (matched, and not ignored there), in panel order.
export const championsFor = (groups, ignored, videoId) =>
    groups.filter(g => g.candidates.some(c => c.videoId === videoId) && !isIgnored(ignored, g.id, videoId)).map(g => ({ id: g.id, label: g.label }));

// Text for data/edit-urls.txt when copying one champion's list. A video wanted for several champions goes under a joint
// heading (#jinxandekko), which tools/edits-groups.js turns into both characters. Order of first appearance is kept.
export function importerText(groups, ignored, ruleId) {
    const buckets = new Map();
    for (const c of visibleFor(groups, ignored, ruleId)) {
        const heading = championsFor(groups, ignored, c.videoId).map(x => x.id).join('and');
        if (!buckets.has(heading)) buckets.set(heading, []);
        buckets.get(heading).push(c.url);
    }
    return [...buckets].map(([h, urls]) => `#${h}\n${urls.join('\n')}\n`).join('\n');
}

// Everything hidden, as [{ ruleId, label, candidate }], for the "Show ignored" list.
export const ignoredList = (groups, ignored) =>
    groups.flatMap(g => g.candidates.filter(c => isIgnored(ignored, g.id, c.videoId)).map(c => ({ ruleId: g.id, label: g.label, candidate: c })));
