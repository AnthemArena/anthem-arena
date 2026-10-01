import { db } from './firebase-config.js';
import {
    doc,
    setDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const TOURNAMENT_ID = 'arcane-test-01';
const TOURNAMENT_NAME = 'Arcane Moments — Test Tournament';

async function loadMoments() {
    const response = await fetch('/data/arcane-moments-test.json');

    if (!response.ok) {
        throw new Error(`Could not load test moments: ${response.status}`);
    }

    return response.json();
}

function toCompetitor(moment) {
    return {
        id: moment.id,
        seed: moment.seed,
        shortTitle: moment.shortTitle,
        title: moment.title,
        artist: 'Arcane',
        videoId: moment.videoId,
        year: moment.year,
        slug: moment.slug,
        votes: 0
    };
}

export async function initializeArcaneTest() {
    console.log('🚀 Initializing Arcane Moments test tournament...');

    const moments = await loadMoments();

    if (moments.length !== 4) {
        throw new Error(`Expected 4 test moments, found ${moments.length}`);
    }

    await setDoc(doc(db, 'tournaments', TOURNAMENT_ID), {
        id: TOURNAMENT_ID,
        name: TOURNAMENT_NAME,
        status: 'active',
        format: 'single-elimination',
        totalMatches: 3,
        totalCompetitors: 4,
        description: 'Temporary four-moment tournament used to test the Arcane Moments tournament engine.',
        createdAt: new Date().toISOString()
    });

    const matches = [
        {
            matchId: 'round-1-match-1',
            matchNumber: 1,
            song1: moments[0],
            song2: moments[1]
        },
        {
            matchId: 'round-1-match-2',
            matchNumber: 2,
            song1: moments[2],
            song2: moments[3]
        }
    ];

    for (const match of matches) {
        await setDoc(
            doc(db, `tournaments/${TOURNAMENT_ID}/matches`, match.matchId),
            {
                matchId: match.matchId,
                tournament: TOURNAMENT_ID,
                tournamentName: TOURNAMENT_NAME,
                round: 1,
                matchNumber: match.matchNumber,
                status: 'live',
                totalVotes: 0,
                winnerId: null,
                song1: toCompetitor(match.song1),
                song2: toCompetitor(match.song2)
            }
        );

        console.log(`✅ Created ${match.matchId}`);
    }

    console.log('🎉 Arcane test tournament created!');
}

window.initializeArcaneTest = initializeArcaneTest;

console.log('🎭 Arcane test initializer loaded');