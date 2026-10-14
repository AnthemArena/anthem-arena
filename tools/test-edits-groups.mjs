// Offline test for tools/edits-groups.js (headings in data/edit-urls.txt).   node tools/test-edits-groups.mjs
import { headingOf, charactersFromHeading } from './edits-groups.js';
let failed = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`); if (!ok) failed++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [line, want] of [['#jinx', 'jinx'], ['#jinxandvi', 'jinxandvi'], ['# Vi', 'vi'], ['  #ekkoandjinx  ', 'ekkoandjinx'], ['#jinx-and-vi', 'jinx-and-vi'],
  ['# One link per line. Any YouTube link format works', null], ['# Optional tags after a pipe', null], ['#', null], ['https://youtu.be/abc', null], ['', null]])
  check(`headingOf(${JSON.stringify(line)}) = ${want}`, headingOf(line) === want);

for (const [h, want] of [['jinx', ['Jinx']], ['vi', ['Vi']], ['jayce', ['Jayce']], ['jinxandvi', ['Jinx', 'Vi']], ['ekkoandjinx', ['Ekko', 'Jinx']],
  ['jinxandisha', ['Jinx', 'Isha']], ['jinxandsilco', ['Jinx', 'Silco']], ['luxandjinx', ['Lux', 'Jinx']], ['jinx-and-vi', ['Jinx', 'Vi']], ['jinx&vi', ['Jinx', 'Vi']],
  ['jinxandvander', ['Jinx', 'Vander']], ['vanderandjinx', ['Vander', 'Jinx']], ['powderandvi', ['Jinx', 'Vi']], ['jinxjinx', ['Jinx']], ['viandjinx', ['Vi', 'Jinx']]])
  check(`"${h}" -> ${want.join(' + ')}`, same(charactersFromHeading(h), want), `(got ${JSON.stringify(charactersFromHeading(h))})`);

for (const h of ['jinxandbob', 'randomstuff', 'jinxand', 'andvi', 'tutorials'])
  check(`"${h}" cannot be split -> null`, charactersFromHeading(h) === null);
process.exit(failed ? 1 : 0);
