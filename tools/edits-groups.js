// Headings in data/edit-urls.txt. A line like  #jinxandvi  (a # followed by ONE word, no spaces) starts a group: every link under it
// belongs to that group until the next heading. Ordinary comments ("# some note", with spaces) are not headings.
// The heading also tells us which characters the edit is about, which is far more reliable than guessing from descriptions.
export const CHARACTERS = ['Jinx', 'Vi', 'Caitlyn', 'Jayce', 'Viktor', 'Silco', 'Ekko', 'Mel', 'Vander', 'Sevika', 'Heimerdinger', 'Ambessa', 'Mylo', 'Claggor', 'Singed', 'Warwick', 'Isha', 'Lux'];
export const ALIASES = { powder: 'Jinx' };   // Powder is the same character as Jinx

// "#jinxandvi" -> "jinxandvi".  Returns null for anything that is not a heading.
export const headingOf = line => { const m = /^#\s*([A-Za-z][A-Za-z_-]*)$/.exec(line.trim()); return m ? m[1].toLowerCase() : null; };

// "ekkoandjinx" -> ["Ekko", "Jinx"].  Names may be joined by and, &, +, - or _ (or nothing). Returns null when the heading
// cannot be split into known characters (the importer then reports it instead of guessing).
export function charactersFromHeading(heading) {
  const names = new Map([...CHARACTERS.map(c => [c.toLowerCase(), c]), ...Object.entries(ALIASES)]);
  const byLength = [...names.keys()].sort((a, b) => b.length - a.length);
  const split = (s, first) => {
    if (!s) return first ? null : [];
    for (const n of byLength) {
      if (!s.startsWith(n)) continue;
      const rest = s.slice(n.length), stripped = rest.replace(/^(?:[-_&+]|and)+/, '');
      for (const r of stripped && stripped !== rest ? [stripped, rest] : [rest]) {   // a separator must be followed by another name
        const tail = split(r, false);
        if (tail) return [names.get(n), ...tail];
      }
    }
    return null;
  };
  const found = split(heading.toLowerCase(), true);
  return found && [...new Set(found)];
}
