// node tools/test-feed-time-model.mjs
import assert from 'node:assert/strict';
import { timeAgo, fullTime } from '../js/feed-time-model.js';
const now = Date.parse('2026-11-13T12:00:00Z'), ago = ms => now - ms;
const M = 60000, H = 60 * M, D = 24 * H;
assert.equal(timeAgo(ago(5000), now), 'Just now');
assert.equal(timeAgo(ago(7 * M), now), '7m ago');
assert.equal(timeAgo(ago(7 * H), now), '7h ago');
assert.equal(timeAgo(ago(3 * D), now), '3d ago');
assert.equal(timeAgo(ago(6 * D + 23 * H), now), '6d ago');
assert.equal(timeAgo(ago(26 * D), now), 'Oct 18');                       // a date after a week, no year in the same year
assert.equal(timeAgo(Date.parse('2025-09-29T10:00:00Z'), now), 'Sep 29, 2025');   // the year appears once it is not this year
assert.equal(timeAgo('nope', now), '');
assert.ok(/Nov 13, 2026/.test(fullTime(now)));
console.log('feed time model: all passed');
