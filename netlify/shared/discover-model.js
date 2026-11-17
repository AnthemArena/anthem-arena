// Finding new edits on YouTube (admin "Discover new edits"). Pure functions, no network, so they can be tested.
// The pool of edits we already have is data/edits.json (every entry, including removed ones), keyed by YouTube video id.

export const MAX_SHORT_SECONDS = 180;
export const EDIT_WORDS = ['edit', 'edits', 'amv'];
export const ARCANE_WORDS = ['arcane', 'league of legends', 'lol', 'riot'];

// One rule per champion. names: any of these words must appear (as a whole word). queries: what we ask YouTube.
// A video is kept only if it mentions a name AND an edit word somewhere in its title, description or tags.
export const DISCOVER_RULES = [
    { id: 'jinx',    label: 'Jinx',    names: ['jinx', 'powder'], queries: ['jinx edit', '#jinxedit', 'arcane jinx edit'] },
    { id: 'vi',      label: 'Vi',      names: ['vi'],             queries: ['vi edit arcane', '#viedit', 'arcane vi amv'] },
    { id: 'caitlyn', label: 'Caitlyn', names: ['caitlyn', 'cait'], queries: ['caitlyn edit', '#caitlynedit', 'arcane caitlyn edit'] },
    { id: 'ekko',    label: 'Ekko',    names: ['ekko'],           queries: ['ekko edit', '#ekkoedit', 'arcane ekko edit'] }
];

const norm = s => String(s || '').toLowerCase().replace(/[#_]/g, ' ').replace(/[^\p{L}\p{N}' ]+/gu, ' ');
const hasWord = (text, word) => new RegExp(`(^| )${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`, 'u').test(text);
// "#jinxedit" / "jinxedits" (one tag, no space) must count too: a whole token that is a name plus an edit word, in either order.
const glued = (text, names) => text.split(' ').some(tok => names.some(n => EDIT_WORDS.some(w => tok === n + w || tok === w + n)));

// video: { title, description, tags[] }  ->  { match: boolean, arcane: boolean }
export function matchesRule(video, rule) {
    const text = norm([video.title, video.description, ...(video.tags || [])].join(' ')).replace(/ +/g, ' ');
    const hasName = rule.names.some(n => hasWord(text, n)) || glued(text, rule.names);
    const hasEdit = EDIT_WORDS.some(w => hasWord(text, w)) || glued(text, rule.names);
    return { match: hasName && hasEdit, arcane: ARCANE_WORDS.some(w => hasWord(text, w)) };
}

// "PT45S" / "PT1M5S" -> seconds
export function isoSeconds(iso) {
    const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
    return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : null;
}

// A usable short: public, embeddable, 3 minutes or less.
export function usableShort(item) {
    const s = isoSeconds(item.contentDetails?.duration);
    return s !== null && s > 0 && s <= MAX_SHORT_SECONDS
        && item.status?.embeddable !== false && (!item.status?.privacyStatus || item.status.privacyStatus === 'public');
}

// Every id in the pool, removed ones included: a removed edit must not come back as a "new" find.
export function knownIds(edits) {
    const ids = new Set();
    for (const e of Array.isArray(edits) ? edits : []) { if (e?.videoId) ids.add(e.videoId); if (e?.id) ids.add(e.id); }
    return ids;
}

// Raw YouTube videos.list items + rules + known ids -> { [ruleId]: candidate[] }, newest first, arcane mentions first within a day.
// A video that matches several champions appears under each.
export function buildCandidates(items, rules, known, searchedBy = {}, sortBy = 'date') {
    const out = Object.fromEntries(rules.map(r => [r.id, []]));
    const seen = new Set();
    for (const it of items) {
        if (!it?.id || known.has(it.id) || seen.has(it.id) || !usableShort(it)) continue;
        seen.add(it.id);
        const sn = it.snippet || {};
        const video = { title: sn.title, description: sn.description, tags: sn.tags };
        for (const r of rules) {
            const m = matchesRule(video, r);
            if (!m.match) continue;
            out[r.id].push({
                videoId: it.id, title: sn.title || '', channel: sn.channelTitle || '', channelId: sn.channelId || '',
                published: sn.publishedAt || '', views: Number(it.statistics?.viewCount) || 0,
                seconds: isoSeconds(it.contentDetails.duration), arcane: m.arcane,
                url: `https://www.youtube.com/watch?v=${it.id}`, foundBy: searchedBy[it.id] || []
            });
        }
    }
    const byDate = (a, b) => (b.published || '').localeCompare(a.published || '') || Number(b.arcane) - Number(a.arcane);
    const byViews = (a, b) => b.views - a.views || byDate(a, b);
    for (const id of Object.keys(out)) out[id].sort(sortBy === 'views' ? byViews : byDate);
    return out;
}

// Text for data/edit-urls.txt: a heading line, then one link per line.
export function importerBlock(ruleId, candidates) {
    return candidates.length ? `#${ruleId}\n${candidates.map(c => c.url).join('\n')}\n` : '';
}

// days: 1-365 = that many days back. 0 = no date limit (the whole back catalogue, most viewed first). Anything else = 14.
export function publishedAfter(days, now = Date.now()) {
    if (parseInt(days, 10) === 0) return null;
    const d = Math.min(Math.max(parseInt(days, 10) || 14, 1), 365);
    return new Date(now - d * 86400000).toISOString();
}
