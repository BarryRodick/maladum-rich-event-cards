/**
 * Test suite for the campaign tracker seam
 * Run with: node tests/campaignTracker.test.js
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadModule(relativePath) {
    return import(pathToFileURL(path.join(__dirname, '..', relativePath)).href);
}

function createNode(tagName = 'div') {
    const listeners = {};
    const node = {
        tagName: tagName.toUpperCase(),
        children: [],
        dataset: {},
        style: {},
        className: '',
        textContent: '',
        value: '',
        src: '',
        classList: {
            values: new Set(),
            add(value) { this.values.add(value); },
            remove(value) { this.values.delete(value); },
            toggle(value) {
                if (this.values.has(value)) {
                    this.values.delete(value);
                    return false;
                }
                this.values.add(value);
                return true;
            },
            contains(value) { return this.values.has(value); }
        },
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        addEventListener(type, handler) {
            listeners[type] = handler;
        },
        dispatch(type, event = {}) {
            listeners[type]?.({ target: this, ...event });
        }
    };

    Object.defineProperty(node, 'innerHTML', {
        get() {
            return '';
        },
        set(value) {
            if (value === '') {
                this.children = [];
            }
        }
    });

    return node;
}

function createDocument(map) {
    return {
        body: createNode('body'),
        createElement: createNode,
        querySelector(selector) {
            const value = map[selector];
            return Array.isArray(value) ? value[0] || null : value || null;
        },
        querySelectorAll(selector) {
            const value = map[selector];
            if (!value) return [];
            return Array.isArray(value) ? value : [value];
        },
        getElementById(id) {
            return map[`#${id}`] || null;
        }
    };
}

(async () => {
    const { createCampaignTracker } = await loadModule('campaign-tracker.mjs');

    console.log('Testing campaign tracker...');

    const checkbox = createNode('div');
    const input = Object.assign(createNode('input'), { value: '' });
    const notesContent = createNode('div');
    const notesTextarea = Object.assign(createNode('textarea'), { value: '' });
    const collapseIcon = createNode('span');
    const gallery = createNode('div');
    const modal = createNode('div');
    const modalImage = createNode('img');

    const document = createDocument({
        '.checkbox': [checkbox],
        '.input-field': [input],
        '#notesContent': notesContent,
        '#notesTextarea': notesTextarea,
        '.collapse-icon': collapseIcon,
        '#imageGallery': gallery,
        '#imageModal': modal,
        '#modalImage': modalImage
    });

    const saved = [];
    const tracker = createCampaignTracker({
        document,
        storage: {
            saveState(key, state) {
                saved.push({ key, state });
                return true;
            },
            loadState() {
                return null;
            },
            isStorageAvailable() {
                return true;
            }
        },
        storageKey: 'forbiddenCreedState',
        markers: [
            { key: 'checkboxes', selector: '.checkbox', mode: 'dataset', checkedColor: '#333' }
        ],
        inputs: { key: 'inputs', selector: '.input-field' }
    });

    tracker.applyState({
        checkboxes: [true],
        inputs: ['Corazon'],
        notes: 'Bring rope.',
        notesVisible: true,
        images: ['data:image/png;base64,abc']
    });

    assert.strictEqual(checkbox.dataset.checked, 'true');
    assert.strictEqual(checkbox.style.backgroundColor, '#333');
    assert.strictEqual(input.value, 'Corazon');
    assert.strictEqual(notesTextarea.value, 'Bring rope.');
    assert.strictEqual(notesContent.classList.contains('visible'), true);
    assert.strictEqual(gallery.children.length, 1);

    checkbox.dataset.checked = '';
    checkbox.style.backgroundColor = '';
    input.value = 'Updated';
    notesTextarea.value = 'New note';
    notesContent.classList.remove('visible');

    const state = tracker.captureState();
    assert.deepStrictEqual(state.checkboxes, [false]);
    assert.deepStrictEqual(state.inputs, ['Updated']);
    assert.strictEqual(state.notes, 'New note');
    assert.strictEqual(state.notesVisible, false);
    assert.deepStrictEqual(state.images, ['data:image/png;base64,abc']);

    tracker.saveState();
    assert.strictEqual(saved[0].key, 'forbiddenCreedState');
    assert.deepStrictEqual(saved[0].state.inputs, ['Updated']);

    console.log('All campaign tracker tests passed!');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
