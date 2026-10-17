// Rebuilds netlify/shared/og-fonts.js from the .woff files (run after replacing a font).
import { readFileSync, writeFileSync } from 'node:fs';
let out = "// Inter 700 / 800 (OFL licence), embedded so the image function never depends on where Netlify puts extra files.\n// Generated from netlify/functions/assets/*.woff: `node tools/embed-og-fonts.mjs`\n";
for (const w of [700, 800]) out += `export const INTER_${w} = '${readFileSync(new URL(`../netlify/functions/assets/inter-${w}.woff`, import.meta.url)).toString('base64')}';\n`;
writeFileSync(new URL('../netlify/shared/og-fonts.js', import.meta.url), out);
