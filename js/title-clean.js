// ========================================
// TITLE CLEANER: shows an edit's YouTube title without its trailing hashtags
// ========================================
// YouTube titles for edits usually end in a hashtag run:  "Bro tried to rizz Jinx 💀 - JINX EDIT || Britney Spears - Toxic #jinxedit #jinx #arcane #edit"
// On a phone that is four lines of noise. This returns the part people actually read. It is for DISPLAY only: ids, stored
// vote records and the full title (edits.json `title`) are never changed by it.
//
//   cleanTitle('Song - Edit || Artist #jinx #arcane')  ->  'Song - Edit || Artist'
//
// Only a TRAILING run of hashtags is removed (a #word in the middle of a sentence is part of the sentence), then any dangling
// separator left in front of it ( ||  |  -  –  —  •  :  , ). If nothing sensible is left (under 3 characters), the original is returned.

// a hashtag needs at least one letter (so "Top 10 #1" keeps its #1) and may be glued to the word before it ("her finger#jinx")
const TRAILING_TAGS = /(?:[\s\u00a0]*#(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]+)+[\s\u00a0]*$/u;
const DANGLING = /[\s\u00a0|\-\u2013\u2014\u2022\u00b7:,]+$/u;

export function cleanTitle(title) {
    if (title == null) return '';
    const original = String(title).replace(/\s+/g, ' ').trim();
    let t = original;
    // a title that is ONLY hashtags (or starts with one and has nothing else) is left alone
    t = t.replace(TRAILING_TAGS, '');
    t = t.replace(DANGLING, '');
    t = t.trim();
    return t.length >= 3 ? t : original;
}
