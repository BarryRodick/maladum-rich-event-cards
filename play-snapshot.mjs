function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function cloneCounts(counts = {}) {
    return { ...(counts || {}) };
}

function defaultResolveCardById(appState, cardId) {
    if (appState.cardCatalogIndex && typeof appState.cardCatalogIndex.resolveCardById === 'function') {
        return appState.cardCatalogIndex.resolveCardById(cardId);
    }

    if (appState.cardMap instanceof Map) {
        const numericId = Number(cardId);
        if (Number.isFinite(numericId) && appState.cardMap.has(numericId)) {
            return appState.cardMap.get(numericId);
        }

        if (appState.cardMap.has(cardId)) {
            return appState.cardMap.get(cardId);
        }
    }

    return null;
}

export function buildPlaySnapshot(appState, {
    cardCounts = {},
    specialCardCounts = {}
} = {}) {
    return {
        selectedGames: [...toArray(appState.selectedGames)],
        cardCounts: cloneCounts(cardCounts),
        specialCardCounts: cloneCounts(specialCardCounts),
        enableSentryRules: !!appState.enableSentryRules,
        enableCorrupterRules: !!appState.enableCorrupterRules,
        selectedDifficultyIndex: appState.selectedDifficultyIndex || 0,
        deckState: {
            currentDeck: toArray(appState.currentDeck),
            currentIndex: appState.currentIndex,
            discardPile: toArray(appState.discardPile),
            sentryDeck: toArray(appState.sentryDeck),
            initialDeckSize: appState.initialDeckSize,
            inPlayCards: toArray(appState.inPlayCards),
            mainDeck: toArray(appState.deck?.main),
            specialDeck: toArray(appState.deck?.special),
            combinedDeck: toArray(appState.deck?.combined)
        }
    };
}

export function restoreBasicConfigFromSnapshot(appState, savedConfig) {
    if (!savedConfig) return appState;

    if (savedConfig.selectedGames) {
        appState.selectedGames = savedConfig.selectedGames;
    }

    appState.enableSentryRules = savedConfig.enableSentryRules || false;
    appState.enableCorrupterRules = savedConfig.enableCorrupterRules || false;
    appState.selectedDifficultyIndex = savedConfig.selectedDifficultyIndex || 0;
    appState.cardCounts = savedConfig.cardCounts || {};
    appState.specialCardCounts = savedConfig.specialCardCounts || {};
    return appState;
}

export function restoreDeckStateFromSnapshot(appState, deckState, options = {}) {
    const resolveCardById = options.resolveCardById || (cardId => defaultResolveCardById(appState, cardId));
    const warn = options.warn || console.warn;

    function resolveSavedCard(savedCard, collectionName) {
        if (!savedCard || savedCard.id === undefined) {
            return savedCard;
        }

        const canonicalCard = resolveCardById(savedCard.id);
        if (canonicalCard) {
            return canonicalCard;
        }

        warn(`Saved ${collectionName} card ${savedCard.id} is missing from the current catalog; using saved fallback.`);
        return savedCard;
    }

    function resolveSavedCards(cards, collectionName) {
        return toArray(cards).map(card => resolveSavedCard(card, collectionName));
    }

    appState.currentDeck = resolveSavedCards(deckState.currentDeck, 'currentDeck');
    appState.currentIndex = deckState.currentIndex ?? -1;
    appState.discardPile = resolveSavedCards(deckState.discardPile, 'discardPile');
    appState.sentryDeck = resolveSavedCards(deckState.sentryDeck, 'sentryDeck');
    appState.initialDeckSize = deckState.initialDeckSize || 0;
    appState.inPlayCards = resolveSavedCards(deckState.inPlayCards, 'inPlayCards');

    if (!appState.deck) {
        appState.deck = { main: [], special: [], combined: [] };
    }
    appState.deck.main = resolveSavedCards(deckState.mainDeck, 'mainDeck');
    appState.deck.special = resolveSavedCards(deckState.specialDeck, 'specialDeck');
    appState.deck.combined = resolveSavedCards(deckState.combinedDeck, 'combinedDeck');
    if (appState.deck.combined.length === 0) {
        appState.deck.combined = appState.currentDeck;
    }

    if (!appState.cards || !(appState.cards.selected instanceof Map)) {
        appState.cards = { selected: new Map() };
    } else {
        appState.cards.selected.clear();
    }

    [
        ...appState.currentDeck,
        ...appState.discardPile,
        ...appState.sentryDeck,
        ...appState.inPlayCards
    ].forEach(card => {
        if (card && card.id !== undefined) {
            appState.cards.selected.set(card.id, true);
        }
    });

    return appState;
}
