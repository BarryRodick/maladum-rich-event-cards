/**
 * Test suite for the deck lifecycle seam
 * Run with: node tests/deckLifecycle.test.js
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadModule(relativePath) {
    return import(pathToFileURL(path.join(__dirname, '..', relativePath)).href);
}

function createState(cards, allCardTypes, overrides = {}) {
    const { dataStore: dataStoreOverrides = {}, ...stateOverrides } = overrides;
    const deckDataByType = {};
    cards.forEach(card => {
        card.type.split('+').flatMap(group => group.split('/')).map(type => type.trim()).forEach(type => {
            deckDataByType[type] = deckDataByType[type] || [];
            deckDataByType[type].push({ ...card });
        });
    });

    return {
        selectedGames: ['Base Game'],
        allCardTypes,
        availableCards: [...cards],
        deckDataByType,
        dataStore: {
            sentryTypes: [],
            corrupterTypes: [],
            heldBackCardTypes: [],
            ...dataStoreOverrides
        },
        cards: { selected: new Map() },
        deck: { main: [], special: [], combined: [] },
        currentDeck: [],
        currentIndex: -1,
        discardPile: [],
        sentryDeck: [],
        inPlayCards: [],
        setAsideCards: [],
        initialDeckSize: 0,
        enableSentryRules: false,
        enableCorrupterRules: false,
        ...stateOverrides
    };
}

(async () => {
    const {
        generateDeckState,
        advanceDeckState,
        rewindActiveCardState,
        runDeckAction,
        insertSpecificCardState
    } = await loadModule('deck-lifecycle.mjs');

    console.log('Testing deck lifecycle...');

    {
        const cards = [
            { id: 1, card: 'Dungeon A', type: 'Dungeon', game: 'Base Game' },
            { id: 2, card: 'Novice A', type: 'Novice', game: 'Base Game' },
            { id: 3, card: 'Other Veteran', type: 'Veteran', game: 'Other Game' }
        ];
        const state = createState(cards, ['Dungeon', 'Novice', 'Veteran'], {
            selectedGames: ['Base Game'],
            setAsideCards: [{ id: 99, card: 'Stale Veteran', type: 'Veteran', game: 'Other Game' }],
            dataStore: {
                heldBackCardTypes: ['Novice', 'Veteran']
            }
        });

        const result = generateDeckState(state, {
            cardCounts: { Dungeon: 1, Novice: 1, Veteran: 1 },
            shuffle: deck => deck
        });

        assert.strictEqual(result.ok, true);
        assert.deepStrictEqual(state.currentDeck.map(card => card.id), [1, 2],
            'generation should select configured held-back cards and drop stale set-aside cards from unselected games');
        assert.strictEqual(state.cards.selected.has(1), true);
        assert.strictEqual(state.cards.selected.has(2), true);
    }

    {
        const state = createState([], [], {
            currentDeck: [{ id: 1, card: 'A' }],
            currentIndex: 0,
            discardPile: [{ id: 2, card: 'B' }],
            initialDeckSize: 1
        });

        const result = advanceDeckState(state, { shuffle: deck => deck });

        assert.strictEqual(result.message, 'Deck reshuffled from discard pile.');
        assert.deepStrictEqual(state.currentDeck.map(card => card.id), [2, 1]);
        assert.strictEqual(state.currentIndex, -1);
        assert.deepStrictEqual(state.discardPile, []);

        rewindActiveCardState(state);
        assert.strictEqual(state.currentIndex, -1,
            'rewinding while the card back is showing should keep the deck ready');
    }

    {
        const state = createState([], [], {
            currentDeck: [
                { id: 1, card: 'A', type: 'Dungeon' },
                { id: 2, card: 'B', type: 'Dungeon' },
                { id: 3, card: 'C', type: 'Dungeon' },
                { id: 4, card: 'D', type: 'Dungeon' }
            ],
            currentIndex: 1,
            cards: { selected: new Map([[1, true], [2, true], [3, true], [4, true]]) }
        });

        const result = runDeckAction(state, {
            actionName: 'shuffleTopN',
            activeCard: state.currentDeck[1],
            param: 2,
            random: () => 0
        });

        assert.strictEqual(result.message, 'Card "B" shuffled into the next 2 cards.');
        assert.deepStrictEqual(state.currentDeck.map(card => card.id), [1, 3, 2, 4]);
        assert.strictEqual(result.view, 'current-card');
    }

    {
        const state = createState([], [], {
            currentDeck: [{ id: 1, card: 'A' }],
            currentIndex: 0,
            cardMap: new Map([[2, { id: 2, card: 'B' }]]),
            cards: { selected: new Map([[1, true]]) }
        });

        const result = insertSpecificCardState(state, {
            cardId: '2',
            position: 'bottom'
        });

        assert.strictEqual(result.message, 'Inserted "B" into the deck (bottom).');
        assert.deepStrictEqual(state.currentDeck.map(card => card.id), [1, 2]);
        assert.strictEqual(state.cards.selected.has(2), true);
    }

    console.log('All deck lifecycle tests passed!');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
