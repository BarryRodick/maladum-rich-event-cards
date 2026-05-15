/**
 * Regression tests for deck-manager generation edge cases.
 * Run with: node tests/deckManagerGeneration.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function cardTypeId(type) {
    return `type-${slugify(type)}`;
}

function parseCardTypes(typeString) {
    const andGroups = typeString.split('+').map(group => group.trim());
    const parsedGroups = andGroups.map(group => group.split('/').map(option => option.trim()));
    return {
        andGroups: parsedGroups,
        allTypes: [...new Set(parsedGroups.flat())]
    };
}

function createNode(tagName = 'div') {
    return {
        tagName,
        children: [],
        style: {},
        dataset: {},
        attributes: {},
        className: '',
        textContent: '',
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        replaceChildren(...children) {
            this.children = children;
        },
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        classList: {
            add() { },
            remove() { },
            toggle() { }
        }
    };
}

function createDocument(counts = {}) {
    const elements = new Map();
    Object.entries(counts).forEach(([type, value]) => {
        elements.set(cardTypeId(type), { value: String(value), style: {}, setAttribute() { } });
    });

    [
        'activeDeckSection',
        'navigationButtons',
        'deckProgress',
        'cardActionSection',
        'cardActionContent',
        'deckOutput',
        'clearActiveCard',
        'progressBar',
        'progressText'
    ].forEach(id => {
        if (!elements.has(id)) {
            elements.set(id, createNode());
        }
    });

    const cardActionToggle = createNode('button');

    return {
        createElement: createNode,
        getElementById(id) {
            return elements.get(id) || null;
        },
        querySelector(selector) {
            return selector === '[data-bs-target="#cardActionContent"]' ? cardActionToggle : null;
        }
    };
}

function buildDeckDataByType(cards) {
    const byType = {};
    cards.forEach(card => {
        parseCardTypes(card.type).allTypes.forEach(type => {
            byType[type] = byType[type] || [];
            byType[type].push({ ...card });
        });
    });
    return byType;
}

function loadDeckManager(state, document, toasts = []) {
    const file = path.join(__dirname, '..', 'deck-manager.js');
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/import .*?\r?\n/g, '');
    code = code.replace(/export function /g, 'function ');

    const factory = new Function(
        'state',
        'CONFIG',
        'cardTypeId',
        'shuffleDeck',
        'parseCardTypes',
        'showToast',
        'trackEvent',
        'debounce',
        'saveConfiguration',
        'renderDeckSummary',
        'setDeckMode',
        'renderCardNode',
        'document',
        `${code}; return { generateDeck };`
    );

    return factory(
        state,
        { deck: { corrupter: { defaultCount: 5 } } },
        cardTypeId,
        deck => deck,
        parseCardTypes,
        message => toasts.push(message),
        () => { },
        fn => fn,
        () => { },
        () => { },
        () => { },
        () => createNode(),
        document
    );
}

function createBaseState(cards, allCardTypes, overrides = {}) {
    const { dataStore: dataStoreOverrides = {}, ...stateOverrides } = overrides;
    return {
        selectedGames: ['Base Game'],
        allCardTypes,
        availableCards: [...cards],
        deckDataByType: buildDeckDataByType(cards),
        dataStore: {
            sentryTypes: [],
            corrupterTypes: [],
            heldBackCardTypes: [],
            ...dataStoreOverrides
        },
        cards: {
            selected: new Map()
        },
        deck: {
            main: [],
            special: [],
            combined: []
        },
        currentDeck: [],
        currentIndex: -1,
        discardPile: [],
        sentryDeck: [],
        inPlayCards: [],
        setAsideCards: [],
        initialDeckSize: 0,
        enableSentryRules: false,
        enableCorrupterRules: false,
        iconRegistry: {},
        ...stateOverrides
    };
}

console.log('Testing deck-manager generation regressions...');

{
    const cards = [
        { id: 1, card: 'Dungeon A', type: 'Dungeon' },
        { id: 2, card: 'Novice A', type: 'Novice' },
        { id: 3, card: 'Veteran A', type: 'Veteran' }
    ];
    const state = createBaseState(cards, ['Dungeon', 'Novice', 'Veteran'], {
        dataStore: {
            heldBackCardTypes: ['Novice', 'Veteran']
        }
    });
    const document = createDocument({ Dungeon: 1, Novice: 1, Veteran: 1 });
    const { generateDeck } = loadDeckManager(state, document);

    generateDeck();

    assert.deepStrictEqual(
        state.currentDeck.map(card => card.id).sort((left, right) => left - right),
        [1, 2, 3],
        'held-back Novice and Veteran cards should still be selected when configured by difficulty'
    );
}

{
    const cards = [
        { id: 1, card: 'Dungeon A', type: 'Dungeon', game: 'Base Game' },
        { id: 2, card: 'Novice A', type: 'Novice', game: 'Base Game' }
    ];
    const staleSetAside = [
        { id: 99, card: 'Other Veteran', type: 'Veteran', game: 'Other Game' }
    ];
    const state = createBaseState(cards, ['Dungeon', 'Novice', 'Veteran'], {
        setAsideCards: staleSetAside,
        dataStore: {
            heldBackCardTypes: ['Novice', 'Veteran']
        }
    });
    const document = createDocument({ Dungeon: 1, Novice: 1, Veteran: 1 });
    const { generateDeck } = loadDeckManager(state, document);

    generateDeck();

    assert.deepStrictEqual(
        state.currentDeck.map(card => card.id).sort((left, right) => left - right),
        [1, 2],
        'held-back cards from unselected games should not leak from a previous set-aside pool'
    );
}

{
    const regularCards = Array.from({ length: 5 }, (_, index) => ({
        id: index + 1,
        card: `Dungeon ${index + 1}`,
        type: 'Dungeon'
    }));
    const corrupterCards = Array.from({ length: 5 }, (_, index) => ({
        id: index + 101,
        card: `Corrupter ${index + 1}`,
        type: 'Corrupter'
    }));
    const cards = [...regularCards, ...corrupterCards];
    const state = createBaseState(cards, ['Dungeon', 'Corrupter'], {
        enableCorrupterRules: true,
        dataStore: {
            corrupterTypes: ['Corrupter']
        }
    });
    const document = createDocument({ Dungeon: 5, Corrupter: 0 });
    const { generateDeck } = loadDeckManager(state, document);

    generateDeck();

    assert.deepStrictEqual(
        state.currentDeck.map(card => card.id).sort((left, right) => left - right),
        [101, 102, 103, 104, 105],
        'enabling Corrupter rules should replace five regular cards even when the Corrupter count input is zero'
    );
}

{
    const regularCards = Array.from({ length: 5 }, (_, index) => ({
        id: index + 1,
        card: `Dungeon ${index + 1}`,
        type: 'Dungeon'
    }));
    const corrupterCards = Array.from({ length: 5 }, (_, index) => ({
        id: index + 101,
        card: `Corrupter ${index + 1}`,
        type: 'Corrupter'
    }));
    const cards = [...regularCards, ...corrupterCards];
    const state = createBaseState(cards, ['Dungeon', 'Corrupter'], {
        enableCorrupterRules: true,
        dataStore: {
            corrupterTypes: ['Corrupter']
        }
    });
    const document = createDocument({ Dungeon: 5, Corrupter: 5 });
    const { generateDeck } = loadDeckManager(state, document);

    generateDeck();

    assert.strictEqual(state.currentDeck.length, 5,
        'corrupter replacement should not append a second special deck');
    assert.deepStrictEqual(
        state.currentDeck.map(card => card.id).sort((left, right) => left - right),
        [101, 102, 103, 104, 105],
        'corrupter replacement should replace regular cards with one unique set of corrupters'
    );
}

console.log('All deck-manager generation regression tests passed!');
