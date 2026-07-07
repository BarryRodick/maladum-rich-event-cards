/**
 * Test suite for the play snapshot seam
 * Run with: node tests/playSnapshot.test.js
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadModule(relativePath) {
    return import(pathToFileURL(path.join(__dirname, '..', relativePath)).href);
}

(async () => {
    const {
        buildPlaySnapshot,
        restoreBasicConfigFromSnapshot,
        restoreDeckStateFromSnapshot
    } = await loadModule('play-snapshot.mjs');

    console.log('Testing play snapshot...');

    {
        const state = {
            selectedGames: ['Base Game'],
            enableSentryRules: true,
            enableCorrupterRules: false,
            selectedDifficultyIndex: 2,
            currentDeck: [{ id: 1, card: 'A' }],
            currentIndex: 0,
            discardPile: [{ id: 2, card: 'B' }],
            sentryDeck: [{ id: 3, card: 'C' }],
            initialDeckSize: 1,
            inPlayCards: [{ id: 4, card: 'D' }],
            deck: {
                main: [{ id: 1, card: 'A' }],
                special: [{ id: 3, card: 'C' }],
                combined: [{ id: 1, card: 'A' }, { id: 3, card: 'C' }]
            }
        };

        const snapshot = buildPlaySnapshot(state, {
            cardCounts: { Dungeon: 2 },
            specialCardCounts: { Revenant: 1 }
        });

        assert.deepStrictEqual(snapshot.selectedGames, ['Base Game']);
        assert.deepStrictEqual(snapshot.cardCounts, { Dungeon: 2 });
        assert.deepStrictEqual(snapshot.specialCardCounts, { Revenant: 1 });
        assert.strictEqual(snapshot.deckState.currentDeck[0].id, 1);
        assert.strictEqual(snapshot.deckState.combinedDeck.length, 2);
    }

    {
        const state = {
            selectedGames: [],
            enableSentryRules: false,
            enableCorrupterRules: true,
            selectedDifficultyIndex: 0,
            cardCounts: {},
            specialCardCounts: {}
        };

        restoreBasicConfigFromSnapshot(state, {
            selectedGames: ['Expansion'],
            enableSentryRules: true,
            enableCorrupterRules: false,
            selectedDifficultyIndex: 3,
            cardCounts: { Dungeon: 4 },
            specialCardCounts: { Cabal: 2 }
        });

        assert.deepStrictEqual(state.selectedGames, ['Expansion']);
        assert.strictEqual(state.enableSentryRules, true);
        assert.strictEqual(state.enableCorrupterRules, false);
        assert.strictEqual(state.selectedDifficultyIndex, 3);
        assert.deepStrictEqual(state.cardCounts, { Dungeon: 4 });
        assert.deepStrictEqual(state.specialCardCounts, { Cabal: 2 });
    }

    {
        const richCard = { id: 10, card: 'Rich Card', renderMode: 'rich' };
        const missingCard = { id: 99, card: 'Missing Card', renderMode: 'image' };
        const warnings = [];
        const state = {
            currentDeck: [],
            currentIndex: -1,
            discardPile: [],
            sentryDeck: [],
            initialDeckSize: 0,
            inPlayCards: [],
            deck: { main: [], special: [], combined: [] },
            cards: { selected: new Map([['stale', true]]) }
        };

        restoreDeckStateFromSnapshot(state, {
            currentDeck: [{ id: 10, card: 'Old Card', renderMode: 'image' }],
            currentIndex: 0,
            discardPile: [missingCard],
            sentryDeck: [],
            initialDeckSize: 2,
            inPlayCards: [],
            mainDeck: [{ id: 10, card: 'Old Card', renderMode: 'image' }],
            specialDeck: [],
            combinedDeck: []
        }, {
            resolveCardById: id => Number(id) === 10 ? richCard : null,
            warn: message => warnings.push(message)
        });

        assert.strictEqual(state.currentDeck[0], richCard,
            'snapshot restore should use canonical cards when available');
        assert.strictEqual(state.discardPile[0], missingCard,
            'snapshot restore should preserve missing cards as fallbacks');
        assert.strictEqual(state.deck.combined, state.currentDeck,
            'snapshot restore should fall back to currentDeck when no combined deck is saved');
        assert.strictEqual(state.cards.selected.has('stale'), false);
        assert.strictEqual(state.cards.selected.has(10), true);
        assert.strictEqual(state.cards.selected.has(99), true);
        assert.strictEqual(warnings.length, 1);
    }

    console.log('All play snapshot tests passed!');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
