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

function normalizeSelectedGames(allGames, selectedGames = []) {
    if (!Array.isArray(selectedGames) || selectedGames.length === 0) {
        return [...allGames];
    }

    const available = new Set(allGames);
    return selectedGames.filter(game => available.has(game));
}

function addCardToTypeIndex(deckDataByType, uniqueTypes, card) {
    parseCardTypes(card.type).allTypes.forEach(type => {
        uniqueTypes.add(type);
        deckDataByType[type] = deckDataByType[type] || [];
        deckDataByType[type].push({ ...card });
    });
}

export function buildCardCatalogIndex(dataStore = {}, selectedGames = []) {
    const games = dataStore.games || {};
    const allGames = Object.keys(games);
    const nextSelectedGames = normalizeSelectedGames(allGames, selectedGames);
    const selectedGameSet = new Set(nextSelectedGames);
    const cardMap = new Map();
    const deckDataByType = {};
    const uniqueTypes = new Set();
    const availableCards = [];

    Object.entries(games).forEach(([gameName, cards = []]) => {
        cards.forEach(card => {
            if (card && card.id !== undefined) {
                cardMap.set(card.id, card);
            }

            if (selectedGameSet.has(gameName)) {
                availableCards.push(card);
                addCardToTypeIndex(deckDataByType, uniqueTypes, card);
            }
        });
    });

    const index = {
        allGames,
        selectedGames: nextSelectedGames,
        availableCards,
        allCardTypes: Array.from(uniqueTypes).sort(),
        deckDataByType,
        cardMap,
        getCardsByType(type) {
            return deckDataByType[type] || [];
        },
        resolveCardById(cardId) {
            const numericId = Number(cardId);
            if (Number.isFinite(numericId) && cardMap.has(numericId)) {
                return cardMap.get(numericId);
            }

            return cardMap.get(cardId) || null;
        }
    };

    return index;
}

export function applyCardCatalogIndex(appState, index) {
    appState.allGames = [...index.allGames];
    appState.selectedGames = [...index.selectedGames];
    appState.availableCards = [...index.availableCards];
    appState.allCardTypes = [...index.allCardTypes];
    appState.deckDataByType = { ...index.deckDataByType };
    appState.cardMap = index.cardMap;
    appState.cardCatalogIndex = index;
    return appState;
}
