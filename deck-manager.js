/**
 * deck-manager.js - Handles deck generation, navigation, and display
 */
import { state, CONFIG, cardTypeId } from './state.js';
import { shuffleDeck } from './card-utils.js';
import { showToast, trackEvent, debounce } from './app-utils.js';
import { saveConfiguration } from './config-manager.js';
import { renderDeckSummary, setDeckMode } from './ui-manager.js';
import { renderCardNode } from './card-renderer.mjs';
import { advanceDeckState, generateDeckState } from './deck-lifecycle.mjs';

const debouncedSaveConfiguration = debounce(saveConfiguration, 400);
const preloadCache = [];

function getRenderOptions() {
    return {
        document,
        iconRegistry: state.iconRegistry || {}
    };
}

function createReadyToDrawState() {
    const wrapper = document.createElement('div');
    wrapper.className = 'deck-card-state';

    const image = document.createElement('img');
    image.src = 'cardimages/back.jpg';
    image.alt = 'Ready to draw';
    image.className = 'img-fluid card-image-fallback';
    wrapper.appendChild(image);

    const caption = document.createElement('p');
    caption.className = 'deck-card-caption';
    caption.textContent = 'Ready to draw';
    wrapper.appendChild(caption);

    return wrapper;
}

function createDeckDisplayRoot(surface, { deckState, renderMode, cardId } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'deck-display-root';
    wrapper.dataset.deckSurface = 'true';
    wrapper.dataset.deckState = deckState || 'ready';
    wrapper.dataset.renderMode = renderMode || 'image';

    if (cardId !== undefined && cardId !== null) {
        wrapper.dataset.cardId = String(cardId);
    }

    wrapper.appendChild(surface);
    return wrapper;
}

function renderDeckDisplayRoot() {
    const currentCard = state.currentIndex >= 0
        ? state.currentDeck[state.currentIndex]
        : null;

    if (!currentCard) {
        return createDeckDisplayRoot(createReadyToDrawState(), {
            deckState: 'ready',
            renderMode: 'image'
        });
    }

    return createDeckDisplayRoot(renderCardNode(currentCard, getRenderOptions()), {
        deckState: 'active',
        renderMode: currentCard.renderMode || 'image',
        cardId: currentCard.id
    });
}

/**
 * Generates a new deck based on user configuration
 */
export function generateDeck() {
    if (state.selectedGames.length === 0) {
        showToast('Please select at least one game.');
        return;
    }

    const cardCounts = {};
    const sentryCardCounts = {};

    state.allCardTypes.forEach(type => {
        const input = document.getElementById(cardTypeId(type));
        if (!input) return;
        const count = parseInt(input.value) || 0;

        if (state.dataStore.sentryTypes.includes(type) && state.enableSentryRules) {
            sentryCardCounts[type] = count;
            return;
        }

        if (state.dataStore.corrupterTypes.includes(type) && state.enableCorrupterRules) {
            return;
        }

        cardCounts[type] = count;
    });

    const result = generateDeckState(state, {
        cardCounts,
        sentryCardCounts,
        config: CONFIG,
        shuffle: shuffleDeck
    });
    if (!result.ok) {
        showToast(result.message);
        return;
    }

    // UI Updates
    const activeDeckSection = document.getElementById('activeDeckSection');
    if (activeDeckSection) activeDeckSection.style.display = 'block';

    document.getElementById('navigationButtons').style.display = 'flex';
    document.getElementById('deckProgress').style.display = 'block';
    const cardActionSection = document.getElementById('cardActionSection');
    if (cardActionSection) cardActionSection.style.display = 'block';
    const cardActionContent = document.getElementById('cardActionContent');
    if (cardActionContent) {
        cardActionContent.classList.remove('show');
    }
    const cardActionToggle = document.querySelector('[data-bs-target="#cardActionContent"]');
    if (cardActionToggle) {
        cardActionToggle.classList.add('collapsed');
        cardActionToggle.setAttribute('aria-expanded', 'false');
    }

    setDeckMode('play', { openUtilities: false, scrollToPlay: true });
    showCurrentCard();
    saveConfiguration();

    trackEvent('Deck', 'Generate', `Games: ${state.selectedGames.join(', ')}`, state.currentDeck.length);
}

/**
 * Display functions
 */
export function showCurrentCard(direction = null) {
    const output = document.getElementById('deckOutput');
    if (!output) return;
    const clearBtn = document.getElementById('clearActiveCard');

    const renderedCard = renderDeckDisplayRoot();

    const nextChildren = [renderedCard];
    if (clearBtn) {
        nextChildren.push(clearBtn);
    }
    output.replaceChildren(...nextChildren);

    if (clearBtn) clearBtn.style.display = state.currentIndex >= 0 ? 'block' : 'none';

    updateProgressBar();
    preloadUpcomingCards();
    debouncedSaveConfiguration();
}

export function updateProgressBar() {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    if (!progressBar || !progressText) return;

    const totalCards = state.currentDeck.length;
    let percentage = 0;

    if (state.currentIndex === -1) {
        progressText.textContent = 'Ready to draw';
        percentage = 0;
    } else {
        const currentCardNumber = state.currentIndex + 1;
        progressText.textContent = `Card ${currentCardNumber} of ${totalCards}`;
        percentage = totalCards > 0 ? (currentCardNumber / totalCards) * 100 : 0;
    }

    progressBar.style.width = `${percentage}%`;
    progressBar.setAttribute('aria-valuenow', percentage.toFixed(0));
    renderDeckSummary();
}

export function advanceToNextCard() {
    const result = advanceDeckState(state, { shuffle: shuffleDeck });
    if (result.message) {
        showToast(result.message);
    }

    if (result.view === 'current-card') {
        showCurrentCard(result.direction || 'forward');
    }
}

function preloadUpcomingCards(count = 2) {
    preloadCache.length = 0;
    for (let i = 1; i <= count; i++) {
        const index = state.currentIndex + i;
        if (index >= 0 && index < state.currentDeck.length) {
            const card = state.currentDeck[index];
            if (card && card.renderMode === 'image' && card.sourceImage) {
                const img = new Image();
                img.src = `cardimages/${card.sourceImage}`;
                preloadCache.push(img);
            }
        }
    }
}
