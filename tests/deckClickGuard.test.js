/**
 * Test suite for live deck click guard behavior
 * Run with: node tests/deckClickGuard.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function loadShouldAdvanceDeckFromClick() {
    const file = path.join(__dirname, '..', 'events.js');
    const code = fs.readFileSync(file, 'utf8');
    const match = code.match(/function shouldAdvanceDeckFromClick\(target\) \{[\s\S]*?\n\}/);
    if (!match) {
        throw new Error('shouldAdvanceDeckFromClick function not found');
    }

    return new Function(`${match[0]}; return shouldAdvanceDeckFromClick;`)();
}

function createTarget(matches = {}) {
    return {
        closest(selector) {
            return matches[selector] || null;
        }
    };
}

function createClickableElement() {
    const listeners = {};
    return {
        addEventListener(type, handler) {
            listeners[type] = handler;
        },
        click() {
            listeners.click?.({
                stopPropagation() { },
                preventDefault() { },
                target: this
            });
        }
    };
}

function loadSetupEventListeners(state, document, calls = {}) {
    const file = path.join(__dirname, '..', 'events.js');
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/import[\s\S]*?;\r?\n/g, '');
    code = code.replace(/export function /g, 'function ');

    const factory = new Function(
        'generateDeck',
        'advanceToNextCard',
        'showCurrentCard',
        'triggerCardAction',
        'markCardAsInPlay',
        'updateInPlayCardsDisplay',
        'shuffleCardIntoTopN',
        'insertSpecificCardById',
        'state',
        'trackEvent',
        'debounce',
        'saveConfiguration',
        'setupManualUpdateCheck',
        'updateCardSearchResults',
        'showCardPreview',
        'setDeckMode',
        'toggleUtilityDrawer',
        'openBuildTools',
        'openSearchTools',
        'renderDeckSummary',
        'buildPreviewActionRequest',
        'document',
        `${code}; return { setupEventListeners };`
    );

    const noop = () => { };
    return factory(
        noop,
        noop,
        () => { calls.showCurrentCard = (calls.showCurrentCard || 0) + 1; },
        noop,
        noop,
        noop,
        noop,
        noop,
        state,
        noop,
        fn => fn,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        document
    );
}

console.log('Testing live deck click guard...');

const shouldAdvanceDeckFromClick = loadShouldAdvanceDeckFromClick();

assert.strictEqual(
    shouldAdvanceDeckFromClick(createTarget({
        '[data-deck-surface="true"]': {}
    })),
    true,
    'Clicks on the deck surface should advance the deck'
);

assert.strictEqual(
    shouldAdvanceDeckFromClick(createTarget({
        '[data-deck-surface="true"]': {},
        '#clearActiveCard': {}
    })),
    false,
    'Clicks on the clear button should not advance the deck'
);

assert.strictEqual(
    shouldAdvanceDeckFromClick(createTarget({})),
    false,
    'Clicks outside the deck surface should not advance the deck'
);

assert.strictEqual(
    shouldAdvanceDeckFromClick(null),
    false,
    'Missing click targets should fail closed'
);

{
    const clearActiveCard = createClickableElement();
    const state = {
        currentIndex: 2,
        currentDeck: [
            { id: 1, card: 'A' },
            { id: 2, card: 'B' },
            { id: 3, card: 'C' }
        ],
        discardPile: [
            { id: 1, card: 'A' },
            { id: 2, card: 'B' }
        ]
    };
    const calls = {};
    const document = {
        getElementById(id) {
            return id === 'clearActiveCard' ? clearActiveCard : null;
        },
        querySelectorAll() {
            return [];
        },
        querySelector() {
            return null;
        }
    };
    const { setupEventListeners } = loadSetupEventListeners(state, document, calls);

    setupEventListeners();
    clearActiveCard.click();

    assert.strictEqual(state.currentIndex, 1,
        'Clearing a mid-deck active card should rewind one position so the same card can be drawn again');
    assert.deepStrictEqual(state.discardPile.map(card => card.id), [1],
        'Clearing a mid-deck active card should also rewind the discard pile to avoid duplicate discards');
    assert.strictEqual(calls.showCurrentCard, 1,
        'Clearing the active card should refresh the deck display');
}

console.log('All live deck click guard tests passed!');
