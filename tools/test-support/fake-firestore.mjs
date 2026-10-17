// A small in-memory Firestore: only what js/init-*.js use. Batches are atomic and limited to 500 writes, like the real thing.
export const store = new Map();                 // path -> data
export const stats = { commits: 0, lastBatchSize: 0 };
const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
export const collection = (_db, path) => ({ kind: 'col', path });
export const doc = (base, ...rest) => base.kind === 'col' ? { kind: 'doc', path: `${base.path}/${rest[0]}` } : { kind: 'doc', path: rest.join('/') };
export const getDoc = async ref => ({ exists: () => store.has(ref.path), data: () => clone(store.get(ref.path)), id: ref.path.split('/').pop() });
export const getDocs = async col => {
    const prefix = col.path + '/';
    const docs = [...store.keys()].filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(k => ({ id: k.split('/').pop(), data: () => clone(store.get(k)), ref: { kind: 'doc', path: k } }));
    return { empty: docs.length === 0, size: docs.length, docs, forEach: f => docs.forEach(f) };
};
const setDeep = (obj, dotted, value) => {
    const parts = dotted.split('.'); let o = obj;
    for (const p of parts.slice(0, -1)) o = (o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {});
    o[parts.at(-1)] = value;
};
export const writeBatch = () => {
    const ops = [];
    return {
        set: (ref, data) => { ops.push(['set', ref.path, clone(data)]); },
        update: (ref, data) => { ops.push(['update', ref.path, clone(data)]); },
        commit: async () => {
            if (ops.length > 500) throw new Error(`A write batch is limited to 500 operations (got ${ops.length}).`);
            const staged = new Map(store);       // atomic: apply to a copy first, swap only if every op is valid
            for (const [kind, path, data] of ops) {
                if (kind === 'set') staged.set(path, data);
                else {
                    if (!staged.has(path)) throw new Error(`No document to update: ${path}`);
                    const cur = clone(staged.get(path));
                    for (const [k, v] of Object.entries(data)) setDeep(cur, k, v);
                    staged.set(path, cur);
                }
            }
            store.clear(); for (const [k, v] of staged) store.set(k, v);
            stats.commits++; stats.lastBatchSize = ops.length;
        }
    };
};

// --- added for the emote/notification tests ---
const hasUndefined = o => Object.values(o).some(v => v === undefined || (v && typeof v === 'object' && !Array.isArray(v) && hasUndefined(v)));
let autoId = 0;
export const addDoc = async (col, data) => {
    // the real SDK refuses undefined field values
    if (hasUndefined(data)) throw new Error('Function addDoc() called with invalid data. Unsupported field value: undefined');
    const id = `auto${++autoId}`;
    store.set(`${col.path}/${id}`, clone(data));
    return { id };
};
export const updateDoc = async (ref, data) => { store.set(ref.path, { ...clone(store.get(ref.path)), ...clone(data) }); };
export const query = (col) => col;
export const where = () => ({});
export const orderBy = () => ({});
export const limit = () => ({});
