const DEFAULT_CONFIG = {
    deck: {
        corrupter: {
            defaultCount: 5
        }
    }
};

function parseCardTypes(typeString = '') {
    const andGroups = String(typeString)
        .split('+')
        .map(group => group.trim())
        .filter(Boolean);
    const parsedGroups = andGroups.map(group => (
        group
            .split('/')
            .map(option => option.trim())
            .filter(Boolean)
    ));

    return {
        andGroups: parsedGroups,
        allTypes: [...new Set(parsedGroups.flat())]
    };
}

function shuffleDeck(deck) {
    let currentIndex = deck.length;
    while (currentIndex) {
        const randomIndex = Math.floor(Math.random() * currentIndex--);
        [deck[currentIndex], deck[randomIndex]] = [deck[randomIndex], deck[currentIndex]];
    }
    return deck;
}

function getShuffle(options = {}) {
    return options.shuffle || shuffleDeck;
}

function getRandom(options = {}) {
    return options.random || Math.random;
}

function ensureSelectedMap(appState) {
    if (!appState.cards) {
        appState.cards = {};
    }
    if (!(appState.cards.selected instanceof Map)) {
        appState.cards.selected = new Map();
    }
    return appState.cards.selected;
}

function dedupeCardsById(cards) {
    const byId = new Map();
    cards.forEach(card => {
        if (card && card.id !== undefined && !byId.has(card.id)) {
            byId.set(card.id, card);
        }
    });
    return [...byId.values()];
}

function selectCardsByType(appState, cardType, count, selectedCardsMap, cardCounts, options = {}) {
    const shuffle = getShuffle(options);
    const candidateCards = appState.dataStore.heldBackCardTypes.includes(cardType)
        ? appState.setAsideCards
        : appState.availableCards;
    const cardsOfType = candidateCards.filter(card => {
        const typeInfo = parseCardTypes(card.type);
        return typeInfo.allTypes.includes(cardType);
    });

    const selectedCards = [];
    const shuffledCards = shuffle([...cardsOfType]);

    for (const card of shuffledCards) {
        if (selectedCards.length >= count) break;
        if (selectedCardsMap.has(card.id)) continue;

        const typeInfo = parseCardTypes(card.type);
        let canSelect = true;

        typeInfo.andGroups.forEach(orOptions => {
            const hasValidOption = orOptions.some(type => {
                if (type === cardType) return true;
                return cardCounts[type] && cardCounts[type] > 0;
            });
            if (!hasValidOption) canSelect = false;
        });

        if (!canSelect) continue;

        selectedCards.push(card);
        selectedCardsMap.set(card.id, true);

        typeInfo.andGroups.forEach(orOptions => {
            for (const type of orOptions) {
                if (cardCounts[type] && cardCounts[type] > 0) {
                    cardCounts[type]--;
                    break;
                }
            }
        });
    }

    return selectedCards;
}

function getSpecialCards(appState, count, specialTypes, options = {}) {
    const shuffle = getShuffle(options);
    let specialCards = [];
    specialTypes.forEach(type => {
        if (appState.deckDataByType[type]) {
            specialCards = specialCards.concat(appState.deckDataByType[type]);
        }
    });
    if (specialCards.length === 0) return [];
    return shuffle([...specialCards]).slice(0, count);
}

export function generateDeckState(appState, {
    cardCounts = {},
    sentryCardCounts = {},
    config = DEFAULT_CONFIG,
    shuffle
} = {}) {
    if (!appState.selectedGames || appState.selectedGames.length === 0) {
        return { ok: false, message: 'Please select at least one game.' };
    }

    const options = { shuffle };
    const selectedCardsMap = ensureSelectedMap(appState);
    appState.currentIndex = -1;
    appState.deck.main = [];
    appState.deck.special = [];
    appState.sentryDeck = [];
    appState.discardPile = [];
    selectedCardsMap.clear();

    const selectedGameSet = new Set(appState.selectedGames);
    const reusableSetAsideCards = appState.setAsideCards.filter(card => card && (!card.game || selectedGameSet.has(card.game)));
    const generationCards = dedupeCardsById([
        ...appState.availableCards,
        ...reusableSetAsideCards
    ]).filter(card => card && (!card.game || selectedGameSet.has(card.game)));

    appState.setAsideCards = [];
    appState.availableCards = generationCards.filter(card => {
        const typeInfo = parseCardTypes(card.type);
        const isHeldBack = typeInfo.allTypes.some(type => appState.dataStore.heldBackCardTypes.includes(type));
        if (isHeldBack) {
            appState.setAsideCards.push(card);
            return false;
        }
        return true;
    });

    let hasRegularCardSelection = false;
    appState.allCardTypes.forEach(type => {
        if (appState.dataStore.sentryTypes.includes(type) && appState.enableSentryRules) return;
        if (appState.dataStore.corrupterTypes.includes(type) && appState.enableCorrupterRules) return;

        const count = cardCounts[type];
        if (count > 0) {
            hasRegularCardSelection = true;
            const selected = selectCardsByType(appState, type, count, selectedCardsMap, cardCounts, options);
            appState.deck.main = appState.deck.main.concat(selected);
        }
    });

    if (appState.enableSentryRules) {
        appState.allCardTypes.forEach(type => {
            if (!appState.dataStore.sentryTypes.includes(type)) return;

            const count = sentryCardCounts[type];
            if (count > 0) {
                const selected = selectCardsByType(appState, type, count, selectedCardsMap, sentryCardCounts, options);
                appState.sentryDeck = appState.sentryDeck.concat(selected);
            }
        });
    }

    if (!hasRegularCardSelection && appState.sentryDeck.length === 0) {
        return { ok: false, message: 'Please select at least one card type with a count greater than zero.' };
    }

    const corrupterReplacementCount = appState.enableCorrupterRules
        ? config.deck?.corrupter?.defaultCount ?? DEFAULT_CONFIG.deck.corrupter.defaultCount
        : 0;

    if (appState.enableCorrupterRules && corrupterReplacementCount > 0 && appState.deck.main.length >= corrupterReplacementCount) {
        const corrupterCards = getSpecialCards(appState, corrupterReplacementCount, appState.dataStore.corrupterTypes, options);
        appState.deck.main.splice(0, corrupterCards.length);
        appState.deck.main = appState.deck.main.concat(corrupterCards);
    }

    appState.deck.main = getShuffle(options)(appState.deck.main);
    appState.currentDeck = appState.deck.main.concat(appState.deck.special);
    appState.deck.combined = appState.currentDeck;
    appState.initialDeckSize = appState.currentDeck.length;

    return { ok: true };
}

export function advanceDeckState(appState, options = {}) {
    const shuffle = getShuffle(options);

    if (appState.currentIndex >= 0 && appState.currentIndex < appState.currentDeck.length) {
        appState.discardPile.push(appState.currentDeck[appState.currentIndex]);
    }

    appState.currentIndex++;

    if (appState.currentIndex >= appState.currentDeck.length) {
        if (appState.discardPile.length > 0) {
            appState.currentDeck = shuffle(appState.discardPile);
            appState.initialDeckSize = appState.currentDeck.length;
            appState.discardPile = [];
            appState.currentIndex = -1;
            return { ok: true, message: 'Deck reshuffled from discard pile.', view: 'current-card', direction: 'forward' };
        }

        appState.currentIndex--;
        return { ok: false, message: 'No more cards in the deck.', view: 'none' };
    }

    return { ok: true, view: 'current-card', direction: 'forward' };
}

export function rewindActiveCardState(appState) {
    if (appState.currentIndex > 0) {
        appState.currentIndex--;
        if (appState.discardPile.length > 0) {
            appState.discardPile.pop();
        }
        return { ok: true, view: 'current-card', direction: 'backward' };
    }

    appState.currentIndex = -1;
    return { ok: true, view: 'current-card' };
}

export function markCardInPlayState(appState, card) {
    if (!card) {
        return { ok: false, message: 'No card selected.' };
    }

    if (appState.inPlayCards.some(candidate => candidate.id === card.id)) {
        return { ok: false, message: `Card "${card.card}" is already in play.` };
    }

    appState.inPlayCards.push(card);
    return { ok: true, message: `Card "${card.card}" marked as in play.` };
}

export function removeCardFromPlayState(appState, cardId) {
    appState.inPlayCards = appState.inPlayCards.filter(card => card.id !== cardId);
    return { ok: true };
}

export function clearInPlayCardsState(appState) {
    appState.inPlayCards = [];
    return { ok: true };
}

function insertCardIntoDeck(appState, cardToInsert, position = 'random', options = {}) {
    const random = getRandom(options);
    let insertIndex;

    if (position === 'next') {
        insertIndex = Math.max(0, appState.currentIndex + 1);
    } else if (position === 'bottom') {
        insertIndex = appState.currentDeck.length;
    } else {
        const remaining = appState.currentDeck.length - (appState.currentIndex + 1);
        insertIndex = appState.currentIndex + 1 + Math.floor(random() * (remaining + 1));
    }

    appState.currentDeck.splice(insertIndex, 0, cardToInsert);
    ensureSelectedMap(appState).set(cardToInsert.id, true);
    return insertIndex;
}

function resolveCardById(appState, cardId) {
    if (appState.cardCatalogIndex && typeof appState.cardCatalogIndex.resolveCardById === 'function') {
        return appState.cardCatalogIndex.resolveCardById(cardId);
    }

    if (appState.cardMap instanceof Map && appState.cardMap.has(Number(cardId))) {
        return appState.cardMap.get(Number(cardId));
    }

    if (appState.cardMap instanceof Map && appState.cardMap.has(cardId)) {
        return appState.cardMap.get(cardId);
    }

    return appState.availableCards.find(card => String(card.id) === String(cardId)) || null;
}

export function runDeckAction(appState, {
    actionName,
    activeCard = appState.currentIndex >= 0 ? appState.currentDeck[appState.currentIndex] : null,
    param = null,
    random,
    shuffle
} = {}) {
    const selectedCardsMap = ensureSelectedMap(appState);
    const options = { random, shuffle };
    const randomFn = getRandom(options);

    if (!activeCard && actionName !== 'introduceSentry') {
        return { ok: false, message: 'No active card to perform action on.' };
    }

    if (actionName === 'shuffleAnywhere') {
        appState.currentDeck.splice(appState.currentIndex, 1);
        const remaining = appState.currentDeck.length - appState.currentIndex;
        const randomOffset = Math.floor(randomFn() * (remaining + 1));
        appState.currentDeck.splice(appState.currentIndex + randomOffset, 0, activeCard);
        appState.currentIndex = appState.currentIndex > 0 ? appState.currentIndex - 1 : -1;
        return { ok: true, message: `Card "${activeCard.card}" shuffled back into the deck.`, view: 'current-card', direction: 'backward' };
    }

    if (actionName === 'shuffleTopN') {
        const remaining = appState.currentDeck.length - (appState.currentIndex + 1);
        if (remaining <= 0) {
            return { ok: false, message: 'No remaining cards to shuffle into.' };
        }

        const requestedN = Math.max(1, parseInt(param, 10) || 1);
        const actualN = Math.min(requestedN, remaining);
        appState.currentDeck.splice(appState.currentIndex, 1);
        const insertIdx = appState.currentIndex + 1 + Math.floor(randomFn() * actualN);
        appState.currentDeck.splice(insertIdx, 0, activeCard);
        return { ok: true, message: `Card "${activeCard.card}" shuffled into the next ${actualN} cards.`, view: 'current-card' };
    }

    if (actionName === 'replaceSameType') {
        const typeInfo = parseCardTypes(activeCard.type);
        const replacements = appState.availableCards.filter(card => {
            if (card.id === activeCard.id || selectedCardsMap.has(card.id)) return false;
            const replacementTypeInfo = parseCardTypes(card.type);
            const isSentry = replacementTypeInfo.allTypes.some(type => appState.dataStore.sentryTypes.includes(type));
            const isCorrupter = replacementTypeInfo.allTypes.some(type => appState.dataStore.corrupterTypes.includes(type));
            if ((isSentry && appState.enableSentryRules) || (isCorrupter && appState.enableCorrupterRules)) return false;
            return replacementTypeInfo.allTypes.some(type => typeInfo.allTypes.includes(type));
        });

        if (replacements.length === 0) {
            return { ok: false, message: 'No replacement cards of the same type available.' };
        }

        const replacement = replacements[Math.floor(randomFn() * replacements.length)];
        appState.currentDeck[appState.currentIndex] = replacement;
        selectedCardsMap.delete(activeCard.id);
        selectedCardsMap.set(replacement.id, true);
        return { ok: true, message: `Card "${activeCard.card}" replaced with "${replacement.card}".`, view: 'current-card' };
    }

    if (actionName === 'introduceSentry') {
        if (!appState.sentryDeck || appState.sentryDeck.length === 0) {
            return { ok: false, message: 'No Sentry cards available to introduce.' };
        }

        const pastCards = appState.currentDeck.slice(0, appState.currentIndex + 1);
        const futureCards = appState.currentDeck.slice(appState.currentIndex + 1);
        const newFuture = getShuffle(options)(futureCards.concat(appState.sentryDeck));
        appState.currentDeck = pastCards.concat(newFuture);

        const count = appState.sentryDeck.length;
        appState.sentryDeck = [];
        return { ok: true, message: `${count} Sentry cards shuffled into the deck.`, view: 'progress' };
    }

    if (actionName === 'insertCardType') {
        const { cardType, specificCardId, position = 'random' } = param || {};
        const potentialCards = appState.deckDataByType[cardType] || [];
        if (potentialCards.length === 0) {
            return { ok: false, message: `No cards of type "${cardType}" available.` };
        }

        let cardToInsert = null;
        if (specificCardId) {
            cardToInsert = potentialCards.find(card => String(card.id) === String(specificCardId));
            if (!cardToInsert) {
                return { ok: false, message: `Selected card not found for type "${cardType}".` };
            }
            if (selectedCardsMap.has(cardToInsert.id)) {
                return { ok: false, message: `Card "${cardToInsert.card}" is already in the deck.` };
            }
        }

        if (!cardToInsert) {
            const availableCards = potentialCards.filter(card => !selectedCardsMap.has(card.id));
            if (availableCards.length === 0) {
                return { ok: false, message: `No available cards of type "${cardType}" to insert.` };
            }
            cardToInsert = availableCards[Math.floor(randomFn() * availableCards.length)];
        }

        cardToInsert = { ...cardToInsert };
        insertCardIntoDeck(appState, cardToInsert, position, options);
        return { ok: true, message: `Inserted "${cardToInsert.card}" (${cardType}) into the deck (${position}).`, view: 'progress' };
    }

    return { ok: false, message: `Action ${actionName} not found` };
}

export function shuffleCardIntoTopNState(appState, { cardId, n, random } = {}) {
    if (!cardId) {
        return { ok: false, message: 'Select a card to shuffle into the deck.' };
    }

    if (!appState.currentDeck || appState.currentDeck.length === 0) {
        return { ok: false, message: 'No active deck available. Generate a deck first.' };
    }

    const targetCard = resolveCardById(appState, cardId);
    if (!targetCard) {
        return { ok: false, message: 'Selected card could not be found.' };
    }

    if (appState.currentIndex >= 0) {
        const activeCard = appState.currentDeck[appState.currentIndex];
        if (activeCard && String(activeCard.id) === String(targetCard.id)) {
            return { ok: false, message: 'Cannot shuffle the currently active card.' };
        }
    }

    const requestedN = Math.max(1, parseInt(n, 10) || 1);
    const insertStart = Math.max(0, appState.currentIndex + 1);
    const remaining = appState.currentDeck.length - insertStart;

    if (remaining <= 0) {
        return { ok: false, message: 'No remaining cards to shuffle into.' };
    }

    let existingIndex = appState.currentDeck.findIndex(card => String(card.id) === String(targetCard.id));
    let cardToInsert = targetCard;
    let nextCurrentIndex = appState.currentIndex;

    if (existingIndex !== -1) {
        const [existingCard] = appState.currentDeck.splice(existingIndex, 1);
        cardToInsert = existingCard || targetCard;
        if (existingIndex <= appState.currentIndex) {
            nextCurrentIndex = Math.max(-1, appState.currentIndex - 1);
        }
    } else {
        cardToInsert = { ...targetCard };
    }

    const actualN = Math.min(requestedN, remaining);
    const adjustedInsertStart = Math.max(0, nextCurrentIndex + 1);
    const insertIndex = adjustedInsertStart + Math.floor(getRandom({ random })() * actualN);

    appState.currentIndex = nextCurrentIndex;
    appState.currentDeck.splice(insertIndex, 0, cardToInsert);
    ensureSelectedMap(appState).set(cardToInsert.id, true);

    return { ok: true, message: `Card "${cardToInsert.card}" shuffled into the next ${actualN} cards.`, card: cardToInsert, view: 'current-card' };
}

export function insertSpecificCardState(appState, { cardId, position = 'next', random } = {}) {
    if (!cardId) {
        return { ok: false, message: 'Select a card to insert.' };
    }

    if (!appState.currentDeck || appState.currentDeck.length === 0) {
        return { ok: false, message: 'No active deck available. Generate a deck first.' };
    }

    const targetCard = resolveCardById(appState, cardId);
    if (!targetCard) {
        return { ok: false, message: 'Selected card could not be found.' };
    }

    if (ensureSelectedMap(appState).has(targetCard.id)) {
        return { ok: false, message: `Card "${targetCard.card}" is already in the deck.` };
    }

    const cardToInsert = { ...targetCard };
    insertCardIntoDeck(appState, cardToInsert, position, { random });
    return { ok: true, message: `Inserted "${cardToInsert.card}" into the deck (${position}).`, card: cardToInsert, view: 'current-card' };
}
