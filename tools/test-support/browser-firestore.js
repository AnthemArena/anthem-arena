// In-memory Firestore for the browser test. State is exposed on window.__store.
const store = new Map(JSON.parse(sessionStorage.getItem('fs') || '[]')); window.__store = store; window.__commits = [];
const persist = () => sessionStorage.setItem('fs', JSON.stringify([...store])); window.__persist = persist;
const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const DEL = { __delete: true };
export const getFirestore = () => ({});
// a few more names that other scripts on the pages import (they only need to exist for the module to load)
export const addDoc = async (col, data) => { const id = 'auto' + Math.random().toString(36).slice(2, 10); store.set(`${col.path}/${id}`, clone(data)); persist(); return { id, path: `${col.path}/${id}` }; };
export const onSnapshot = (ref, cb) => { Promise.resolve(ref.kind === 'doc' ? getDoc(ref) : getDocs(ref)).then(cb); return () => {}; };
export const serverTimestamp = () => new Date().toISOString();
export const increment = n => n;
export const arrayUnion = (...v) => v;
export const arrayRemove = (...v) => v;
export const Timestamp = { now: () => ({ toDate: () => new Date(), toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) }), fromDate: d => ({ toDate: () => d, toMillis: () => d.getTime(), seconds: Math.floor(d.getTime() / 1000) }) };
export const startAfter = () => ({ t: 'startAfter' });
export const getCountFromServer = async q => ({ data: () => ({ count: (await_free_count(q)) }) });
const await_free_count = q => { const col = q.kind === 'query' ? q.col : q; const prefix = col.path + '/'; return [...store.keys()].filter(k => k.startsWith(prefix)).length; };
export const collection = (_d, path) => ({ kind: 'col', path });
export const doc = (base, ...rest) => base.kind === 'col' ? { kind: 'doc', path: `${base.path}/${rest[0]}` } : { kind: 'doc', path: rest.join('/') };
export const where = (field, op, value) => ({ t: 'where', field, op, value });
export const orderBy = (field, dir) => ({ t: 'orderBy', field, dir });
export const limit = n => ({ t: 'limit', n });
export const query = (col, ...c) => ({ kind: 'query', col, c });
export const deleteField = () => DEL;
export const getDoc = async ref => ({ exists: () => store.has(ref.path), data: () => clone(store.get(ref.path)), id: ref.path.split('/').pop() });
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const OPS = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, 'in': (a, b) => b.includes(a) };
export const getDocs = async q => {
    const col = q.kind === 'query' ? q.col : q, cons = q.kind === 'query' ? q.c : [];
    const prefix = col.path + '/';
    let rows = [...store.entries()].filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map(([k, v]) => ({ k, v }));
    for (const c of cons) if (c.t === 'where') rows = rows.filter(r => OPS[c.op](get(r.v, c.field), c.value));
    const ob = cons.find(c => c.t === 'orderBy'); if (ob) rows.sort((a, b) => (get(a.v, ob.field) > get(b.v, ob.field) ? 1 : -1) * (ob.dir === 'desc' ? -1 : 1));
    const lm = cons.find(c => c.t === 'limit'); if (lm) rows = rows.slice(0, lm.n);
    const docs = rows.map(r => ({ id: r.k.split('/').pop(), data: () => clone(r.v), ref: { kind: 'doc', path: r.k } }));
    return { empty: !docs.length, size: docs.length, docs, forEach: f => docs.forEach(f) };
};
const setDeep = (obj, dotted, value) => {
    const parts = dotted.split('.'); let o = obj;
    for (const p of parts.slice(0, -1)) o = (o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {});
    if (value === DEL) delete o[parts.at(-1)]; else o[parts.at(-1)] = value;
};
const applyUpdate = (cur, data) => { for (const [k, v] of Object.entries(data)) setDeep(cur, k, v); return cur; };
export const setDoc = async (ref, data) => { store.set(ref.path, clone(data)); persist(); };
export const updateDoc = async (ref, data) => { if (!store.has(ref.path)) throw new Error('No document to update: ' + ref.path); store.set(ref.path, applyUpdate(clone(store.get(ref.path)), data)); persist(); };
export const deleteDoc = async ref => { store.delete(ref.path); persist(); };
export const writeBatch = () => {
    const ops = [];
    return {
        set: (ref, data) => ops.push(['set', ref.path, clone(data)]), update: (ref, data) => ops.push(['update', ref.path, clone(data)]),
        commit: async () => {
            if (ops.length > 500) throw new Error('A write batch is limited to 500 operations.');
            const staged = new Map(store);
            for (const [kind, path, data] of ops) { if (kind === 'set') staged.set(path, data); else { if (!staged.has(path)) throw new Error('No document to update: ' + path); staged.set(path, applyUpdate(clone(staged.get(path)), data)); } }
            store.clear(); for (const [k, v] of staged) store.set(k, v); window.__commits.push(ops.length); persist();
        }
    };
};
