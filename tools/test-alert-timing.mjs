// Static check: background tabs don't poll, and returning to the tab triggers a catch-up.
import fs from 'fs';
const s = fs.readFileSync('js/global-notifications.js', 'utf8');
let bad = 0; const ck = (c, m) => { console.log(c ? '  ok ' : 'FAIL', m); if (!c) bad++; };
const body = s.slice(s.indexOf('async function checkAndShowBulletin()'));
ck(/^async function checkAndShowBulletin\(\) \{\s*try \{\s*if \(document\.hidden\) return;/.test(body), 'match alert poll skips hidden tabs');
ck(/Date\.now\(\) - hiddenAt > 30000/.test(s) && /checkRecentVotes\(\); checkAndShowBulletin\(\)/.test(s), 'return to tab runs both checks');
process.exit(bad ? 1 : 0);
