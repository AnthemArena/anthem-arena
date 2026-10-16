// node tools/test-champion-bubble.mjs
// The speech bubble: which state the viewer is in, which line is shown, and that the lines are well formed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickBubbleState, shortName, fillPlaceholders, chooseLine, linesFor, BUBBLE_STATES } from '../js/champion-bubble.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; };
const NOW = Date.parse('2026-10-16T12:00:00Z');
const live = (o) => ({ status: 'live', now: NOW, ...o });
const H = 3600 * 1000;

test('upcoming and finished matches', () => {
    assert.equal(pickBubbleState({ status: 'upcoming' }), 'upcoming');
    assert.equal(pickBubbleState({ status: 'completed', hasVoted: false }), 'closed-unvoted');
    assert.equal(pickBubbleState({ status: 'completed', hasVoted: true, pickIsWinner: true }), 'closed-won');
    assert.equal(pickBubbleState({ status: 'completed', hasVoted: true, pickIsWinner: false }), 'closed-lost');
    assert.equal(pickBubbleState({ status: 'completed', hasVoted: true, tied: true }), 'closed-tied');
});
test('open, not voted: only the clock and "nobody yet" decide, never the standings', () => {
    assert.equal(pickBubbleState(live({ hasVoted: false, total: 0 })), 'prevote-empty');
    assert.equal(pickBubbleState(live({ hasVoted: false, total: 40, pickVotes: 30, otherVotes: 10 })), 'prevote');
    assert.equal(pickBubbleState(live({ hasVoted: false, total: 40, endDate: NOW + 20 * H })), 'closing-24h');
    assert.equal(pickBubbleState(live({ hasVoted: false, total: 40, endDate: NOW + 2 * H })), 'closing-3h');
    assert.equal(pickBubbleState(live({ hasVoted: false, total: 40, endDate: NOW + 0.5 * H })), 'closing-final');
    assert.equal(pickBubbleState(live({ hasVoted: false, total: 40, endDate: NOW + 3 * 24 * H })), 'prevote');
    assert.equal(pickBubbleState(live({ hasVoted: false, total: 40, endDate: NOW - H })), 'prevote');   // already past: not "closing"
});
test('voted: early / ahead / close / tied / behind', () => {
    assert.equal(pickBubbleState(live({ hasVoted: true, total: 2, pickVotes: 1, otherVotes: 1 })), 'voted-early');
    assert.equal(pickBubbleState(live({ hasVoted: true, total: 100, pickVotes: 70, otherVotes: 30 })), 'voted-ahead');
    assert.equal(pickBubbleState(live({ hasVoted: true, total: 100, pickVotes: 55, otherVotes: 45 })), 'voted-close');
    assert.equal(pickBubbleState(live({ hasVoted: true, total: 100, pickVotes: 50, otherVotes: 50 })), 'voted-tied');
    assert.equal(pickBubbleState(live({ hasVoted: true, total: 100, pickVotes: 30, otherVotes: 70 })), 'voted-behind');
    assert.equal(pickBubbleState(live({ hasVoted: true, total: 100, pickVotes: 45, otherVotes: 55 })), 'voted-close');
});
test('names: first part of a long edit title, shortened', () => {
    assert.equal(shortName('Bro tried to rizz Jinx \u{1F480} - JINX EDIT || Britney Spears - Toxic'), 'Bro tried to rizz Jinx \u{1F480}');
    assert.equal(shortName('JINX edit|wannabe-why mona|Arcane'), 'JINX edit');
    assert.equal(shortName('A'.repeat(60)).length, 34);
    assert.equal(shortName(''), '');
    assert.equal(shortName(undefined), '');
});
test('placeholders are filled, unknown ones vanish', () => {
    assert.equal(fillPlaceholders('{pick} is at {pct}%', { pick: 'X', pct: 61 }), 'X is at 61%');
    assert.equal(fillPlaceholders('hi {nope}!', {}), 'hi !');
});
test('a line is stable for the same match + state, "bump" moves to the next, and it wraps', () => {
    const pack = { bubble: { prevote: ['one', 'two', 'three'] } };
    const a = chooseLine(pack, 'prevote', {}, 'm1', 0);
    assert.equal(a, chooseLine(pack, 'prevote', {}, 'm1', 0));
    const seen = new Set([0, 1, 2].map(b => chooseLine(pack, 'prevote', {}, 'm1', b)));
    assert.equal(seen.size, 3);
    assert.equal(chooseLine(pack, 'prevote', {}, 'm1', 3), a);
});
test('a pack without bubble lines (or without a state) falls back to the plain lines, and every state has one', () => {
    for (const s of BUBBLE_STATES) assert.ok(linesFor({}, s).length > 0, s);
    assert.deepEqual(linesFor({ bubble: { prevote: ['x'] } }, 'prevote'), ['x']);
    assert.ok(linesFor({ bubble: { prevote: ['x'] } }, 'voted-ahead').length > 0);
});

// ---- the real Jinx pack ----
const jinx = JSON.parse(fs.readFileSync(new URL('../champion-packs/jinx.json', import.meta.url), 'utf8'));
test('Jinx has lines for every state, each a short plain sentence (no stray placeholders, no shouting)', () => {
    for (const s of BUBBLE_STATES) {
        const lines = jinx.bubble?.[s];
        assert.ok(Array.isArray(lines) && lines.length >= 1, `no lines for ${s}`);
        for (const l of lines) {
            assert.ok(l.length >= 12 && l.length <= 120, `${s}: length ${l.length}: ${l}`);
            for (const m of l.matchAll(/\{(\w+)\}/g)) assert.ok(['pick', 'other', 'winner', 'pct', 'otherPct', 'diff'].includes(m[1]), `${s}: unknown {${m[1]}}`);
            assert.ok(!/[A-Z]{6,}/.test(l.replace(/\{\w+\}/g, '')), `${s}: shouting: ${l}`);
        }
    }
});
test('before a vote, no Jinx line mentions standings or names a side', () => {
    for (const s of ['upcoming', 'prevote', 'prevote-empty', 'closing-24h', 'closing-3h', 'closing-final']) {
        for (const l of jinx.bubble[s]) assert.ok(!/\{(pick|other|pct|otherPct|diff|winner)\}|ahead|behind|winning|losing|leading/i.test(l), `${s}: ${l}`);
    }
});
test('lines that use {pick}/{winner} appear only in states where those are known', () => {
    const needsVote = /\{(pick|other|pct|otherPct|diff)\}/;
    for (const [s, lines] of Object.entries(jinx.bubble)) {
        if (/^(upcoming|prevote|prevote-empty|closing-)/.test(s)) continue;
        if (s === 'closed-unvoted') { for (const l of lines) assert.ok(!/\{(pick|pct|otherPct|diff)\}/.test(l), l); continue; }
        assert.ok(lines.every(l => typeof l === 'string'), s);
    }
    assert.ok(needsVote.test(JSON.stringify(jinx.bubble['voted-ahead'])));
});
test('no line is repeated within a state, and no two states share a line', () => {
    const all = Object.values(jinx.bubble).flat();
    assert.equal(new Set(all).size, all.length);
});

console.log(`${passed} tests passed`);
