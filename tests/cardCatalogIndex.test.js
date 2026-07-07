/**
 * Test suite for the card catalog index seam
 * Run with: node tests/cardCatalogIndex.test.js
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadModule(relativePath) {
    return import(pathToFileURL(path.join(__dirname, '..', relativePath)).href);
}

(async () => {
    const { buildCardCatalogIndex } = await loadModule('card-catalog-index.mjs');

    console.log('Testing card catalog index...');

    const dataStore = {
        games: {
            'Base Game': [
                { id: 1, card: 'Dungeon A', type: 'Dungeon', game: 'Base Game' },
                { id: 2, card: 'Split Type', type: 'Revenant / Cabal + Veteran', game: 'Base Game' }
            ],
            Expansion: [
                { id: 3, card: 'Expansion A', type: 'Mountain', game: 'Expansion' }
            ]
        },
        sentryTypes: ['Revenant', 'Cabal'],
        corrupterTypes: ['Corrupter'],
        heldBackCardTypes: ['Veteran']
    };

    const index = buildCardCatalogIndex(dataStore, ['Base Game']);

    assert.deepStrictEqual(index.allGames, ['Base Game', 'Expansion']);
    assert.deepStrictEqual(index.selectedGames, ['Base Game']);
    assert.deepStrictEqual(index.availableCards.map(card => card.id), [1, 2],
        'available cards should be filtered to selected games');
    assert.deepStrictEqual(index.allCardTypes, ['Cabal', 'Dungeon', 'Revenant', 'Veteran'],
        'type index should expand AND/OR card type expressions');
    assert.deepStrictEqual(index.getCardsByType('Revenant').map(card => card.id), [2],
        'cards should be indexed by each playable type');
    assert.strictEqual(index.resolveCardById('3').card, 'Expansion A',
        'canonical id lookup should cover every game for restore');
    assert.strictEqual(index.resolveCardById('missing'), null,
        'missing card ids should resolve to null');

    console.log('All card catalog index tests passed!');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
