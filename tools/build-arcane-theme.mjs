#!/usr/bin/env node
// Builds css/arcane-theme.generated.css: the OLD gold-and-serif styling, re-coloured for the Arcane look.
//
//   npm install --save-dev postcss        (once)
//   node tools/build-arcane-theme.mjs
//
// How it works
//   For every rule in the legacy stylesheets listed in SOURCES that uses an old gold colour (or the old serif
//   headings), it writes a COPY of just those declarations under `body.theme-arcane`, with the gold swapped for
//   the Arcane pink. The legacy files are never edited, and a page only changes when its <body> has the
//   `theme-arcane` class, so pages are converted one at a time.
//
//   Shape changes (pill buttons, panel cards, eyebrow labels...) are NOT done here: they live by hand in
//   css/arcane-theme.css, which loads after this file and wins.
//
// Adding a page: put every legacy stylesheet that page loads into SOURCES, re-run, link both theme files
// after the page's other stylesheets, and add class="theme-arcane" to <body>.
// Final cleanup (when every page is converted): apply the same COLOUR_MAP to the legacy files in place
// and delete this overlay.
import fs from 'node:fs';
import postcss from 'postcss';

// A source is a path, or { file, greens: true, scope: '...' }. `scope` narrows that file's rules to one page (see profile.css below). greens also turns green/teal into pink, for pages whose
// "voted / success" state is green (vote.css). It is off by default because green is also used for real success
// messages elsewhere.
const SOURCES = [
    'css/main.css', 'css/navigation.css', 'css/footer.css', 'css/brackets.css',
    'css/modal.css', 'css/scrollbar.css', 'css/settings.css',
    'css/activity.css', { file: 'css/vote.css', greens: true },
    { file: 'css/matches.css', greens: true },
    { file: 'css/live.css', greens: true },
    // profile.css reuses generic class names (.section-title, .stat-label...) that other themed pages also use,
    // so its rules only apply when <body> also has class="page-profile".
    { file: 'css/profile.css', scope: 'body.theme-arcane.page-profile' }
].map(s => typeof s === 'string' ? { file: s } : s);
const OUT = 'css/arcane-theme.generated.css';
const SCOPE = 'body.theme-arcane';

// old gold family -> Arcane pink. Order matters (first match wins per token).
const COLOUR_MAP = [
    [/#c8aa6e\b|#c89b3c\b/gi,                                    'var(--pink-bright)'],
    [/#f0e6d2\b/gi,                                              'var(--text)'],
    [/#d4b876\b|#d4b87a\b/gi,                                    '#ff9bd6'],
    [/#b89a5e\b/gi,                                              '#e85aae'],
    [/#8b6914\b|#a88a4d\b/gi,                                    '#b02d78'],
    [/rgba\(\s*200\s*,\s*(?:170\s*,\s*110|155\s*,\s*60)\s*,\s*([\d.]+)\s*\)/gi, 'rgba(255, 79, 180, $1)'],
    [/rgba\(\s*139\s*,\s*105\s*,\s*20\s*,\s*([\d.]+)\s*\)/gi,    'rgba(176, 45, 120, $1)']
];
const GOLD_TEST = /#c8aa6e\b|#c89b3c\b|#f0e6d2\b|#d4b87[6a]\b|#b89a5e\b|#8b6914\b|#a88a4d\b|rgba\(\s*200\s*,\s*(?:170\s*,\s*110|155\s*,\s*60)\s*,|rgba\(\s*139\s*,\s*105\s*,\s*20\s*,/i;
const OLD_FONT = /cinzel|lora|bebas neue/i;

// Anything gold / yellow / amber that the table above does not name is mapped by hue, so a new shade cannot slip through.
const COLOUR_TOKEN = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/gi;
function parseColour(tok) {
    if (tok[0] === '#') {
        let h = tok.slice(1);
        if (h.length === 3) h = [...h].map(c => c + c).join('');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : null];
    }
    const n = tok.match(/[\d.]+/g).map(Number);
    return [n[0], n[1], n[2], n.length > 3 ? n[3] : null];
}
function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d === 0) return [0, 0, l];
    const sat = l > .5 ? d / (2 - max - min) : d / (max + min);
    const hue = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [hue * 60, sat, l];
}
function hueMap(tok, opts) {
    const [r, g, b, a] = parseColour(tok);
    const [h, sat, l] = hsl(r, g, b);
    const warm = h >= 30 && h <= 62 && sat >= .2;                       // gold, amber, yellow
    const green = opts.greens && h >= 95 && h <= 190 && sat >= .3;      // green, teal
    if (!warm && !green) return tok;
    const base = l < .28 ? [122, 31, 85] : l < .45 ? [176, 45, 120] : l < .62 ? [255, 79, 180] : [255, 112, 195];
    if (a != null) return `rgba(${base.join(', ')}, ${+a.toFixed(2)})`;
    return base[0] === 255 && base[1] === 79 ? 'var(--pink)' : base[0] === 255 ? 'var(--pink-bright)' : `rgb(${base.join(', ')})`;
}
const DARK_BG = /#0a0a0a\b/gi;

function recolour(prop, value, opts = {}) {
    let out = value;
    for (const [re, to] of COLOUR_MAP) out = out.replace(re, to);
    out = out.replace(COLOUR_TOKEN, tok => hueMap(tok, opts));
    if (/^background(-color)?$/i.test(prop)) out = out.replace(DARK_BG, 'var(--bg-veil)');   // let the cover image show through
    else out = out.replace(DARK_BG, 'var(--bg)');
    if (/^font-family$/i.test(prop) && OLD_FONT.test(out)) out = 'var(--font)';
    return out;
}

function scopeSelector(sel, scope = SCOPE) {
    sel = sel.trim();
    if (!sel || /^html\b/i.test(sel)) return null;                 // cannot be scoped under body
    if (sel === ':root') return scope;
    if (/^body\b/i.test(sel)) return sel.replace(/^body/i, scope);
    return `${scope} ${sel}`;
}

const stats = { rules: 0, decls: 0, keyframes: [], sourceGoldDecls: 0 };

// @keyframes that use gold are copied as <name>-arcane (recoloured); scoped rules that run them are pointed at the copy.
const GOLD_KEYFRAMES = new Set();
function collectGoldKeyframes(root, opts) {
    root.walkAtRules(/^(-\w+-)?keyframes$/i, at => {
        let changes = false;
        at.walkDecls(d => { if (recolour(d.prop, d.value, opts) !== d.value) changes = true; });
        if (changes) GOLD_KEYFRAMES.add(at.params);
    });
}
function renameAnimations(prop, value) {
    if (!/^animation(-name)?$/i.test(prop)) return value;
    let out = value;
    for (const name of GOLD_KEYFRAMES) out = out.replace(new RegExp(`(^|[\\s,])${name}(?=[\\s,;]|$)`, 'g'), `$1${name}-arcane`);
    return out;
}

function transform(container, target, opts) {
    container.each(node => {
        if (node.type === 'rule') {
            const changed = [];
            node.each(d => {
                if (d.type !== 'decl') return;
                const isGold = GOLD_TEST.test(d.value);
                if (isGold) stats.sourceGoldDecls++;
                const next = renameAnimations(d.prop, recolour(d.prop, d.value, opts));
                if (next !== d.value) changed.push({ prop: d.prop, value: next, important: d.important });
            });
            if (!changed.length) return;
            const selectors = node.selectors.map(sel => scopeSelector(sel, opts.scope)).filter(Boolean);
            if (!selectors.length) return;
            const rule = postcss.rule({ selectors });
            for (const c of changed) rule.append(postcss.decl({ prop: c.prop, value: c.value, important: c.important }));
            target.append(rule);
            stats.rules++; stats.decls += changed.length;
        } else if (node.type === 'atrule') {
            if (/^(-\w+-)?keyframes$/i.test(node.name)) {
                if (GOLD_KEYFRAMES.has(node.params)) {
                    const copy = postcss.atRule({ name: node.name, params: `${node.params}-arcane` });
                    node.walkRules(step => {
                        const r = postcss.rule({ selector: step.selector });
                        step.each(d => { if (d.type === 'decl') r.append(postcss.decl({ prop: d.prop, value: recolour(d.prop, d.value, opts) })); });
                        copy.append(r);
                    });
                    target.append(copy);
                    stats.keyframes.push(node.params);
                }
            } else if (/^(media|supports|layer)$/i.test(node.name)) {
                const shell = postcss.atRule({ name: node.name, params: node.params });
                transform(node, shell, opts);
                if (shell.nodes && shell.nodes.length) target.append(shell);
            }
        }
    });
}

let css = `/* GENERATED by tools/build-arcane-theme.mjs: do not edit by hand.
   The old gold styling re-coloured for Arcane. Only applies under <body class="theme-arcane">.
   Sources: ${SOURCES.map(s => s.file).join(', ')} */\n\n`;

for (const src of SOURCES) {
    const { file } = src;
    const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
    collectGoldKeyframes(root, src);
    const out = postcss.root();
    transform(root, out, src);
    css += `/* ===== ${file} ===== */\n${out.toString()}\n\n`;
}

fs.writeFileSync(OUT, css);
console.log(`${OUT}: ${stats.rules} override rules, ${stats.decls} declarations (${(css.length / 1024).toFixed(0)} KB)`);
if (stats.keyframes.length) console.log(`Recoloured @keyframes copies: ${[...new Set(stats.keyframes)].join(', ')}`);
