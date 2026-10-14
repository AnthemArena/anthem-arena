// Node resolve hook for the Firestore tests: swaps the browser-only imports (Firebase from gstatic, firebase-config, arcane-config)
// for local fakes, so the real js/init-*.js files run unchanged in Node.
const here = new URL('./', import.meta.url);
export async function resolve(specifier, context, next) {
    if (specifier.startsWith('https://www.gstatic.com/firebasejs/') && specifier.includes('firebase-firestore')) return { url: new URL('fake-firestore.mjs', here).href, shortCircuit: true };
    if (specifier.endsWith('firebase-config.js')) return { url: new URL('stub-firebase-config.mjs', here).href, shortCircuit: true };
    if (specifier.endsWith('arcane-config.js')) return { url: new URL('stub-arcane-config.mjs', here).href, shortCircuit: true };
    return next(specifier, context);
}
