// One place that turns a match's song object into a picture. Match songs have carried the YouTube id under different fields
// (videoId, or id), or a ready-made thumbnail url, so every field is tried and only a real 11-character YouTube id is used.
// lookup (optional): id -> YouTube id, for pages that have the music list loaded (a numeric song id or seed maps to its video).
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function songThumb(song, lookup = null) {
    if (!song) return null;
    for (const c of [song.videoId, song.id]) {
        if (typeof c === 'string' && YT_ID.test(c)) return `https://img.youtube.com/vi/${c}/mqdefault.jpg`;
    }
    if (lookup) {
        for (const c of [song.videoId, song.id, song.seed]) {
            const v = c != null ? lookup(c) : null;
            if (typeof v === 'string' && YT_ID.test(v)) return `https://img.youtube.com/vi/${v}/mqdefault.jpg`;
        }
    }
    if (typeof song.thumbnail === 'string' && /^https?:/.test(song.thumbnail)) return song.thumbnail;
    return null;
}
