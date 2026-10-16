#!/usr/bin/env node
// Runs every test in tools/ and prints ONE pass/fail list.   npm run test:all     (or: node tools/test-all.mjs)
//   --quick   skip the browser tests (they need Python + Playwright and take a few minutes)
// A test that cannot start because a package is missing is shown as SKIP with the fix, not as a failure.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const files = fs.readdirSync(path.join(root, 'tools')).filter(f => /^test-.*\.(mjs|py)$/.test(f) && f !== 'test-all.mjs').sort();
const results = [];

for (const f of files) {
    const isPy = f.endsWith('.py');
    if (isPy && quick) { results.push({ f, status: 'SKIP', note: 'browser test (--quick)' }); continue; }
    process.stdout.write(`running ${f} ...`);
    const r = spawnSync(isPy ? 'python3' : 'node', [path.join('tools', f)], { cwd: root, encoding: 'utf8', timeout: 15 * 60 * 1000 });
    const out = (r.stdout || '') + (r.stderr || '');
    let status = r.status === 0 ? 'PASS' : 'FAIL', note = '';
    if (status === 'FAIL') {
        const missing = /Cannot find package '([^']+)'/.exec(out) || /No module named '([^']+)'/.exec(out);
        if (missing) { status = 'SKIP'; note = `needs "${missing[1]}": ${isPy ? 'pip install --break-system-packages ' : 'npm install # '}${missing[1]}`; }
        else note = out.trim().split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300);
    } else {
        const m = /(\d+) tests? passed|ALL CHECKS PASSED|all passed/i.exec(out); note = m ? m[0] : '';
    }
    console.log(` ${status}`);
    results.push({ f, status, note });
}

console.log('\n==== RESULTS ====');
for (const r of results) console.log(`${r.status.padEnd(5)} ${r.f.padEnd(34)} ${r.note}`);
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`\n${results.filter(r => r.status === 'PASS').length} passed, ${failed} failed, ${results.filter(r => r.status === 'SKIP').length} skipped`);
process.exit(failed ? 1 : 0);
