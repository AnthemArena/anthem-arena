// Profile "Champions" tab: loads the person's votes and profile, then draws js/champions-tab-model.js.
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase-config.js';
import { readPackXp, mergePackXp, activePackId, backfillPackXp } from './xp-ledger.js';
import { readLooks, saveLook } from './companion-look.js';
import { ACHIEVEMENTS } from './achievements.js';
import { announceChampionSelected } from './champion-selected.js';
import { buildChampionsView, championsHtml, avatarKeyOf, skinAvatar } from './champions-tab-model.js';

let shown = null;
const filters = {};   // which skins each card shows: { jinx: 'locked' }   // { userId, own, data } so a click can redraw without asking Firestore again

function draw(host) {
    const { own, data } = shown;
    const view = buildChampionsView({
        votes: data.votes, packXp: data.packXp, achievements: data.achievements,
        activePack: data.activePack, avatarKey: avatarKeyOf(data.avatar), looks: data.looks,
        achievementNames: Object.fromEntries(Object.values(ACHIEVEMENTS).map(a => [a.id, a.name]))
    });
    host.innerHTML = championsHtml(view, { own, filters });
}

// One choice: the champion, the skin you see everywhere (profile picture, alerts) and where your XP goes.
function setChampionLocally(packId) {
    if (window.championLoader?.setUserCompanionPack) return window.championLoader.setUserCompanionPack(packId);
    localStorage.setItem('companionId', packId);
    localStorage.setItem('companionChosen', 'true');
    localStorage.setItem('championPack', packId);
    return Promise.resolve(true);
}

async function useChampion(host, packId, num) {
    const avatar = skinAvatar(packId, num);
    const looks = saveLook(packId, num);
    const changed = shown.data.activePack !== packId;
    try {
        await setChampionLocally(packId);
        localStorage.setItem('avatar', JSON.stringify(avatar));
        shown.data.avatar = avatar; shown.data.looks = looks; shown.data.activePack = packId;
        window.updateNavProfile?.();
        await updateDoc(doc(db, 'profiles', shown.userId), { avatar, companionSkins: looks, companionId: packId, championPackId: packId, updatedAt: Date.now() });
        if (changed) announceChampionSelected(packId, num);
        else (window.showNotification || (() => {}))('Skin updated', 'success');
    } catch (e) {
        console.warn('Could not save the champion', e);
        (window.showNotification || (() => {}))('Saved on this device only; could not reach your profile', 'error');
    }
    draw(host);
}

export async function loadChampionsTab(profile, own) {
    const host = document.getElementById('championsContent');
    if (!host || !profile?.userId) return;
    host.innerHTML = '<p class="cm-empty">Loading champions…</p>';
    try {
        const [votesSnap, profileSnap] = await Promise.all([
            getDocs(query(collection(db, 'votes'), where('userId', '==', profile.userId))),
            getDoc(doc(db, 'profiles', profile.userId))
        ]);
        const saved = profileSnap.exists() ? profileSnap.data() : {};
        shown = {
            userId: profile.userId, own,
            data: {
                votes: votesSnap.docs.map(d => d.data()),
                packXp: backfillPackXp(own ? mergePackXp(readPackXp(), saved.packXp) : (saved.packXp || {}), Math.max(Number(saved.xp) || 0, own ? Number(localStorage.getItem('userTotalXP')) || 0 : 0), saved.companionId || saved.championPackId || (own ? activePackId() : 'jinx')),
                achievements: saved.unlockedAchievements || [],
                activePack: saved.companionId || saved.championPackId || (own ? activePackId() : null),
                avatar: own ? (safeJson(localStorage.getItem('avatar')) || saved.avatar) : saved.avatar,
                looks: own ? { ...(saved.companionSkins || {}), ...readLooks() } : (saved.companionSkins || {})
            }
        };
        draw(host);
        if (!host.dataset.bound) {
            host.dataset.bound = '1';
            const pick = e => {
                const chip = e.target.closest('.cm-chip');
                if (chip) { filters[chip.dataset.pack] = chip.dataset.filter; draw(host); return; }
                const el = e.target.closest('.cm-act');
                if (!el || !shown?.own) return;
                const num = Number(el.dataset.skin);
                useChampion(host, el.dataset.pack, num);
            };
            host.addEventListener('click', pick);
        }
    } catch (e) {
        console.warn('Champions tab unavailable:', e);
        host.innerHTML = '<p class="cm-empty">Could not load champions right now.</p>';
    }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
