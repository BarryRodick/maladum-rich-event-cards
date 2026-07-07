const DEFAULT_SELECTORS = {
    notesContent: '#notesContent',
    notesTextarea: '#notesTextarea',
    collapseIcon: '.collapse-icon',
    notesToggle: '[data-toggle-notes]',
    imageInput: '#imageInput',
    imageGallery: '#imageGallery',
    imageModal: '#imageModal',
    modalImage: '#modalImage'
};

function toArray(list) {
    return Array.from(list || []);
}

function queryAll(doc, selector) {
    return selector ? toArray(doc.querySelectorAll(selector)) : [];
}

function isMarkerChecked(element, mode) {
    if (mode === 'dataset') {
        return element.dataset.checked === 'true';
    }

    return element.style.backgroundColor === 'black';
}

function setMarkerChecked(element, checked, marker) {
    if (marker.mode === 'dataset') {
        element.dataset.checked = checked ? 'true' : '';
        element.style.backgroundColor = checked ? (marker.checkedColor || '#333') : '';
        return;
    }

    if (marker.mode === 'numbered') {
        element.style.backgroundColor = checked ? 'black' : '';
        element.style.color = checked ? 'white' : 'black';
        return;
    }

    element.style.backgroundColor = checked ? 'black' : '';
}

function toggleMarker(element, marker) {
    setMarkerChecked(element, !isMarkerChecked(element, marker.mode), marker);
}

function setupCycleMarker(element, cycle) {
    element.addEventListener('click', function () {
        const classes = cycle.classes || ['empty', 'blue-border', 'red-border'];
        const currentIndex = classes.findIndex(className => this.classList.contains(className));
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % classes.length;
        classes.forEach(className => this.classList.remove(className));
        this.classList.add(classes[nextIndex]);
        cycle.onChange?.();
    });
}

export function createCampaignTracker(options = {}) {
    const doc = options.document || globalThis.document;
    const storage = options.storage;
    const storageKey = options.storageKey;
    const selectors = { ...DEFAULT_SELECTORS, ...(options.selectors || {}) };
    const markers = options.markers || [];
    const groupedMarkers = options.groupedMarkers || [];
    const cycleMarkers = options.cycleMarkers || [];
    const inputs = options.inputs || { key: 'inputs', selector: '.input-field' };
    const fileReaderClass = options.FileReader || globalThis.FileReader;
    const win = options.window || globalThis.window;
    let images = [];

    function get(selectorKey) {
        return doc.querySelector(selectors[selectorKey]);
    }

    function saveState() {
        if (!storage || !storageKey) {
            return false;
        }
        return storage.saveState(storageKey, captureState());
    }

    function captureState() {
        const state = {};

        groupedMarkers.forEach(group => {
            state[group.key] = queryAll(doc, group.groupSelector).map(groupNode => (
                toArray(groupNode.querySelectorAll(group.itemSelector)).map(marker => isMarkerChecked(marker, group.mode || 'black'))
            ));
        });

        markers.forEach(marker => {
            state[marker.key] = queryAll(doc, marker.selector).map(element => isMarkerChecked(element, marker.mode || 'black'));
        });

        if (inputs?.selector) {
            state[inputs.key || 'inputs'] = queryAll(doc, inputs.selector).map(input => input.value);
        }

        const notesTextarea = get('notesTextarea');
        const notesContent = get('notesContent');
        state.notes = notesTextarea?.value || '';
        state.notesVisible = !!notesContent?.classList.contains('visible');
        state.images = [...images];
        return state;
    }

    function applyState(state = {}) {
        groupedMarkers.forEach(group => {
            queryAll(doc, group.groupSelector).forEach((groupNode, groupIndex) => {
                toArray(groupNode.querySelectorAll(group.itemSelector)).forEach((element, itemIndex) => {
                    setMarkerChecked(element, !!state[group.key]?.[groupIndex]?.[itemIndex], group);
                });
            });
        });

        markers.forEach(marker => {
            queryAll(doc, marker.selector).forEach((element, index) => {
                setMarkerChecked(element, !!state[marker.key]?.[index], marker);
            });
        });

        if (inputs?.selector) {
            queryAll(doc, inputs.selector).forEach((input, index) => {
                input.value = state[inputs.key || 'inputs']?.[index] || '';
            });
        }

        const notesTextarea = get('notesTextarea');
        if (notesTextarea) {
            notesTextarea.value = state.notes || '';
        }

        const notesContent = get('notesContent');
        const collapseIcon = get('collapseIcon');
        if (state.notesVisible) {
            notesContent?.classList.add('visible');
            collapseIcon?.classList.add('rotated');
        } else {
            notesContent?.classList.remove('visible');
            collapseIcon?.classList.remove('rotated');
        }

        images = state.images || [];
        renderGallery();
    }

    function renderGallery() {
        const imageGallery = get('imageGallery');
        if (!imageGallery) return;

        imageGallery.innerHTML = '';
        images.forEach((src, index) => {
            const wrapper = doc.createElement('div');
            wrapper.className = 'image-item';

            const img = doc.createElement('img');
            img.src = src;
            img.addEventListener('click', () => openModal(src));

            const button = doc.createElement('button');
            button.textContent = 'Remove';
            button.addEventListener('click', () => {
                images.splice(index, 1);
                renderGallery();
                saveState();
            });

            wrapper.appendChild(img);
            wrapper.appendChild(button);
            imageGallery.appendChild(wrapper);
        });
    }

    function openModal(src) {
        const modalImage = get('modalImage');
        const imageModal = get('imageModal');
        if (modalImage) {
            modalImage.src = src;
        }
        imageModal?.classList.add('show');
    }

    function handleImageUpload(event) {
        if (!fileReaderClass) return;

        toArray(event.target.files).forEach(file => {
            const reader = new fileReaderClass();
            reader.onload = loadEvent => {
                images.push(loadEvent.target.result);
                renderGallery();
                saveState();
            };
            reader.readAsDataURL(file);
        });
        event.target.value = '';
    }

    function toggleNotes() {
        get('notesContent')?.classList.toggle('visible');
        get('collapseIcon')?.classList.toggle('rotated');
        saveState();
    }

    function setupResetButton() {
        if (!options.resetButton) return;

        const button = doc.createElement('button');
        button.textContent = options.resetButton.text || 'Reset Campaign';
        button.className = options.resetButton.className || 'reset-button';
        button.addEventListener('click', () => {
            const message = options.resetButton.confirmMessage || 'Are you sure you want to reset the campaign? This will clear all progress.';
            const confirmed = (options.confirm || win?.confirm || (() => true))(message);
            if (!confirmed) return;

            if (typeof options.removeState === 'function') {
                options.removeState(storageKey);
            } else {
                win?.localStorage?.removeItem(storageKey);
            }
            (options.reload || win?.location?.reload)?.();
        });
        doc.body?.appendChild(button);
    }

    function init() {
        markers.forEach(marker => {
            queryAll(doc, marker.selector).forEach(element => {
                element.addEventListener('click', () => {
                    toggleMarker(element, marker);
                    saveState();
                });
            });
        });

        groupedMarkers.forEach(group => {
            queryAll(doc, group.groupSelector).forEach(groupNode => {
                toArray(groupNode.querySelectorAll(group.itemSelector)).forEach(element => {
                    element.addEventListener('click', () => {
                        toggleMarker(element, group);
                        saveState();
                    });
                });
            });
        });

        cycleMarkers.forEach(cycle => {
            queryAll(doc, cycle.selector).forEach(element => {
                setupCycleMarker(element, { ...cycle, onChange: saveState });
            });
        });

        if (inputs?.selector) {
            queryAll(doc, inputs.selector).forEach(input => {
                input.addEventListener('input', saveState);
            });
        }

        get('imageModal')?.addEventListener('click', () => get('imageModal')?.classList.remove('show'));
        get('imageInput')?.addEventListener('change', handleImageUpload);
        get('notesToggle')?.addEventListener('click', toggleNotes);
        get('notesTextarea')?.addEventListener('input', saveState);
        setupResetButton();

        if (!storage?.isStorageAvailable || storage.isStorageAvailable()) {
            const savedState = storage?.loadState?.(storageKey);
            if (savedState) {
                applyState(savedState);
            }
        }
    }

    return {
        init,
        captureState,
        applyState,
        saveState,
        renderGallery
    };
}

export function setupCampaignTracker(options = {}) {
    const tracker = createCampaignTracker(options);
    tracker.init();
    return tracker;
}
