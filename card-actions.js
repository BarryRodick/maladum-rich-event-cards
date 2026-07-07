/**
 * card-actions.js - Handles specific card actions and in-play state
 */
import { state } from './state.js';
import { showToast, trackEvent } from './app-utils.js';
import { saveConfiguration } from './config-manager.js';
import { showCurrentCard, updateProgressBar } from './deck-manager.js';
import { renderCompactCardNode } from './card-renderer.mjs';
import {
    insertSpecificCardState,
    markCardInPlayState,
    removeCardFromPlayState,
    runDeckAction,
    shuffleCardIntoTopNState
} from './deck-lifecycle.mjs';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * Marks a card as being in play
 */
export function markCardAsInPlay(card) {
    const result = markCardInPlayState(state, card);
    if (result.ok) {
        updateInPlayCardsDisplay();
        showToast(`Card "${escapeHtml(card.card)}" marked as in play.`);
        saveConfiguration();
        trackEvent('Card Status', 'Mark In Play', card.card);
    } else {
        showToast(`Card "${escapeHtml(card.card)}" is already in play.`);
    }
}

/**
 * Updates the UI display for cards currently in play
 */
export function updateInPlayCardsDisplay() {
    const inPlayContainer = document.getElementById('inPlayCards');
    const inPlaySection = document.getElementById('inPlaySection');
    if (!inPlayContainer || !inPlaySection) return;

    clearElement(inPlayContainer);
    if (state.inPlayCards.length === 0) {
        const emptyState = document.createElement('p');
        emptyState.textContent = 'No cards in play.';
        inPlayContainer.appendChild(emptyState);
        inPlaySection.style.display = 'none';
        return;
    }

    inPlaySection.style.display = 'block';
    state.inPlayCards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('card', 'mb-2', 'in-play-card');

        const cardBody = document.createElement('div');
        cardBody.classList.add('card-body');

        const title = document.createElement('h5');
        title.className = 'card-title';
        title.textContent = card.card;
        cardBody.appendChild(title);

        const preview = document.createElement('div');
        preview.className = 'in-play-card__preview';
        preview.appendChild(renderCompactCardNode(card, {
            document,
            iconRegistry: state.iconRegistry || {},
            maxSections: 1
        }));
        cardBody.appendChild(preview);

        const removeButton = document.createElement('button');
        removeButton.className = 'btn btn-danger btn-sm remove-from-play';
        removeButton.dataset.id = String(card.id);
        removeButton.textContent = 'Remove from Play';
        cardBody.appendChild(removeButton);

        cardDiv.appendChild(cardBody);
        inPlayContainer.appendChild(cardDiv);
    });

    // Add event listeners to remove buttons
    inPlayContainer.querySelectorAll('.remove-from-play').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.getAttribute('data-id'));
            removeCardFromPlay(id);
        });
    });
}

function removeCardFromPlay(cardId) {
    removeCardFromPlayState(state, cardId);
    updateInPlayCardsDisplay();
    saveConfiguration();
}

/**
 * Handles the application of selected card actions
 */
export const cardActions = {
    shuffleAnywhere: (card) => {
        return renderLifecycleAction(runDeckAction(state, {
            actionName: 'shuffleAnywhere',
            activeCard: card
        }));
    },

    shuffleTopN: (card, n) => {
        return renderLifecycleAction(runDeckAction(state, {
            actionName: 'shuffleTopN',
            activeCard: card,
            param: n
        }));
    },

    replaceSameType: (card) => {
        return renderLifecycleAction(runDeckAction(state, {
            actionName: 'replaceSameType',
            activeCard: card
        }));
    },

    introduceSentry: () => {
        return renderLifecycleAction(runDeckAction(state, {
            actionName: 'introduceSentry'
        }));
    },

    insertCardType: (activeCard, params) => {
        return renderLifecycleAction(runDeckAction(state, {
            actionName: 'insertCardType',
            activeCard,
            param: params
        }));
    }
};

function renderLifecycleAction(result) {
    if (result.view === 'current-card') {
        showCurrentCard(result.direction);
    } else if (result.view === 'progress') {
        updateProgressBar();
    }
    return result.message;
}

export function shuffleCardIntoTopN(cardId, n) {
    const result = shuffleCardIntoTopNState(state, { cardId, n });
    if (!result.ok) {
        showToast(result.message);
        return;
    }
    updateProgressBar();
    showToast(result.message);
    saveConfiguration();
    trackEvent('Card Action', 'shuffleTopNCard', result.card.card);
    showCurrentCard();
}

export function insertSpecificCardById(cardId, position = 'next') {
    const result = insertSpecificCardState(state, { cardId, position });
    if (!result.ok) {
        showToast(result.message);
        return;
    }
    updateProgressBar();
    showToast(result.message);
    saveConfiguration();
    trackEvent('Card Action', `insertSpecificCard:${position}`, result.card.card);
    showCurrentCard();
}

/**
 * Trigger an action by name
 * @param {string} actionName 
 * @param {any} param - extra parameter like N for shuffle
 */
export function triggerCardAction(actionName, param = null) {
    if (state.currentIndex === -1) {
        showToast('No active card to perform action on.');
        return;
    }

    const activeCard = state.currentDeck[state.currentIndex];

    // Check if function exists
    if (!cardActions[actionName]) {
        console.error(`Action ${actionName} not found`);
        return;
    }

    // Call action
    // Note: ensure 'introduceSentry' handles its own parameter ignoring if needed
    const result = cardActions[actionName](activeCard, param);

    if (result) {
        showToast(result);
        updateInPlayCardsDisplay();
        saveConfiguration();
        trackEvent('Card Action', actionName, activeCard.card);
    }
}
