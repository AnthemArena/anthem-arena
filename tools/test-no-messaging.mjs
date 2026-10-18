// Direct messaging was removed; make sure nothing points at it again.
import fs from 'fs';
import path from 'path';
let bad = 0;
const check = (c, m) => { if (!c) { bad++; console.error('FAIL', m); } else console.log('  ok ', m); };
check(!fs.existsSync('js/message-system.js'), 'js/message-system.js is gone');
const files = fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => path.join('js', f));
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  if (/message-system|messagePrivacy|saveMessageNotification|showMessageComposer|data-tab="messages"/.test(s)) check(false, `${f} still mentions messaging`);
}
check(!/match \/messages\//.test(fs.readFileSync('firestore.rules', 'utf8')), 'no messages rules block');
process.exit(bad ? 1 : 0);
