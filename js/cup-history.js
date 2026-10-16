// Profile "Cup history": every real cup the viewed user has voted in, plus lifetime totals.
// Data: the user's vote docs (all cups), data/cups.json (which cups count), and /api/matches?tournament=<cup> per cup voted in.
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase-config.js';
import { getAllMatches } from './api-client.js';
import { buildCupHistory, renderCupHistory } from './cup-history-model.js';

async function loadCups() {
    const res = await fetch('/data/cups.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`cups.json ${res.status}`);
    return (await res.json()).cups || [];
}

export async function loadCupHistory(userId) {
    const host = document.getElementById('cupHistory');
    if (!host || !userId) return;
    try {
        const [cups, snap] = await Promise.all([loadCups(), getDocs(query(collection(db, 'votes'), where('userId', '==', userId)))]);
        const votes = snap.docs.map(d => d.data());
        const voted = new Set(votes.map(v => v.tournament));
        const matchesByCup = {};
        await Promise.all(cups.filter(c => voted.has(c.id)).map(async c => {
            const m = await getAllMatches(false, c.id);
            if (m.length) matchesByCup[c.id] = m;
        }));
        host.innerHTML = renderCupHistory(buildCupHistory({ votes, cups, matchesByCup }));
        host.hidden = false;
    } catch (error) {
        console.warn('Cup history unavailable:', error);
        host.hidden = true;
    }
}
