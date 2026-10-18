// getAllMatches: callers within a few seconds share one request; bypass always fetches; failures are not shared.   node tools/test-api-client-share.mjs
import assert from 'node:assert/strict';
let calls = 0, fail = false;
globalThis.fetch = async () => { calls++; if (fail) return { ok: false, status: 500, headers: { get: () => null }, json: async () => [] }; return { ok: true, headers: { get: () => 'MOCK' }, json: async () => [{ matchId: 'm' }] }; };
globalThis.window = { location: { hostname: 'x' } };
const { getAllMatches } = await import('../js/api-client.js');
let pass = 0; const t = async (n, f) => { await f(); console.log(`  ok   ${n}`); pass++; };
await t('three callers at once make one request', async () => { await Promise.all([getAllMatches(), getAllMatches(), getAllMatches()]); assert.equal(calls, 1); });
await t('a later call inside the window reuses it', async () => { await getAllMatches(); assert.equal(calls, 1); });
await t('bypass always fetches', async () => { await getAllMatches(true); assert.equal(calls, 2); });
await t('another tournament is a separate request', async () => { await getAllMatches(false, 'old-cup'); assert.equal(calls, 3); });
await t('a failed request is not shared', async () => { fail = true; await getAllMatches(false, 'other').catch(() => {}); fail = false; await getAllMatches(false, 'other'); assert.equal(calls, 5); });
console.log(`${pass} passed`);
