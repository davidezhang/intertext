import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement, useState } from 'react';

const { window } = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLImageElement', 'HTMLVideoElement', 'customElements', 'CustomEvent']) {
  globalThis[key] = key === 'window' ? window : window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let reduced = false;
globalThis.matchMedia = window.matchMedia = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} });
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};
let time = 0, nextFrame = 0;
const frames = new Map();
globalThis.performance = { now: () => time };
globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
const captures = new Map();
window.HTMLElement.prototype.setPointerCapture = function(id) { captures.set(id, this); };
window.HTMLElement.prototype.hasPointerCapture = function(id) { return captures.get(id) === this; };
window.HTMLElement.prototype.releasePointerCapture = function(id) { captures.delete(id); };

const { createRoot } = await import('react-dom/client');
const { InlineArtifactText, InlineArtifactsText } = await import('../dist/lib/react.js');
let reactRoot, surface;

// Deterministic inline layout: three words per line, with a larger pill slot.
// JSDOM supplies DOM/React lifecycles; this fixture supplies browser geometry.
window.HTMLElement.prototype.getBoundingClientRect = function() {
  if (this === surface) return new window.DOMRect(20, 20, 400, 260);
  let x = 20, y = 20;
  for (const node of surface?.querySelectorAll('[data-artifact-word], artifact-pill') || []) {
    const width = node.localName === 'artifact-pill' ? 150 : 100;
    if (x + width > 420) { x = 20; y += 70; }
    if (node === this) {
      const offset = node.style.transform.match(/translate3d\(([-\d.e]+)px, ([-\d.e]+)px/);
      return new window.DOMRect(x + Number(offset?.[1] || 0), y + Number(offset?.[2] || 0), width, 40);
    }
    x += width + 10;
  }
  return new window.DOMRect();
};
document.elementFromPoint = () => surface;

function mount(kind = 'image') {
  const changes = [];
  const container = document.createElement('div');
  document.body.append(container);
  function Harness() {
    const [position, setPosition] = useState(1);
    return createElement(InlineArtifactText, {
      text: 'One two three four five six', position,
      onPositionChange: next => { changes.push(next); setPosition(next); },
      artifact: { src: '/sample', alt: 'Sample', kind, width: '150px', height: '40px' },
    });
  }
  reactRoot = createRoot(container);
  act(() => reactRoot.render(createElement(Harness)));
  surface = container.querySelector('[data-artifact-position]');
  const pill = surface.querySelector('artifact-pill');
  return { pill, changes, media: pill.shadowRoot.querySelector('img, video') };
}

function mountMany() {
  const changes = [], selections = [], starts = [];
  const container = document.createElement('div');
  document.body.append(container);
  let update;
  function Harness() {
    const [artifacts, setArtifacts] = useState([
      { id: 'first', position: 1, artifact: { src: '/first.jpg', alt: 'First', width: '150px' } },
      { id: 'second', position: 4, artifact: { src: '/second.mp4', kind: 'video', alt: 'Second', width: '150px' } },
    ]);
    update = setArtifacts;
    return createElement(InlineArtifactsText, {
      text: 'One two three four five six', artifacts,
      onPositionChange: (id, position) => {
        changes.push([id, position]);
        setArtifacts(items => items.map(item => item.id === id ? { ...item, position } : item));
      },
      onSelectArtifact: id => selections.push(id), onArtifactDragStart: id => starts.push(id),
    });
  }
  reactRoot = createRoot(container);
  act(() => reactRoot.render(createElement(Harness)));
  surface = container.querySelector('[data-artifact-text]');
  return { first: surface.querySelector('[data-artifact-id="first"]'), second: surface.querySelector('[data-artifact-id="second"]'),
    changes, selections, starts, update: callback => act(() => update(callback)) };
}

function pointer(node, type, x, y) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  act(() => node.dispatchEvent(event));
}
function frame(count = 1) {
  for (let n = 0; n < count; n++) act(() => {
    time += 1000 / 60;
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(time));
  });
}
function begin(pill) {
  pointer(pill, 'pointerdown', 160, 35); // Grab 30px / 15px into the pill.
  frame();
  pointer(surface, 'pointermove', 245, 110); // Before "five", on the second line.
  frame();
}
function position() { return Number(surface.dataset.artifactPosition); }
function order() { return [...surface.querySelectorAll('[data-artifact-word], artifact-pill')].map(node => node.localName === 'artifact-pill' ? 'PILL' : node.textContent); }

afterEach(() => {
  act(() => reactRoot?.unmount());
  document.body.replaceChildren();
  frames.clear(); captures.clear(); surface = null; reduced = false;
});

test('text reorders before release, keeps media and grab offset, and commits once', () => {
  const { pill, media, changes } = mount('video');
  begin(pill);
  assert.equal(position(), 4);
  assert.deepEqual(order(), ['One', 'two', 'three', 'four', 'PILL', 'five', 'six']);
  assert.deepEqual(changes, [], 'preview must not commit controlled state');
  assert.equal(captures.get(1), surface, 'capture survives moving the pill in the DOM');
  assert.equal(surface.querySelector('artifact-pill'), pill);
  assert.equal(pill.shadowRoot.querySelector('video'), media);
  assert.equal(pill.getBoundingClientRect().left, 245 - 30);
  assert.equal(pill.getBoundingClientRect().top, 110 - 15);
  assert.ok(surface.querySelector('[data-artifact-word="2"]').style.transform, 'reflowing words should animate');

  pointer(surface, 'pointerup', 245, 110);
  assert.deepEqual(changes, [4]);
  assert.equal(surface.hasAttribute('data-artifact-dragging'), false);
  assert.equal(captures.size, 0);
  frame(180);
  assert.ok([...surface.querySelectorAll('[data-artifact-word], artifact-pill')].every(node => !node.style.transform), 'motion settles without residual offsets');
});

test('a drag can reverse direction while words are still settling', () => {
  const { pill, changes } = mount();
  begin(pill);
  pointer(surface, 'pointermove', 35, 40);
  frame();
  assert.equal(position(), 0);
  assert.equal(order()[0], 'PILL');
  assert.equal(pill.getBoundingClientRect().left, 5);
  pointer(surface, 'pointerup', 35, 40);
  assert.deepEqual(changes, [0]);
});

test('Escape, pointer cancellation, and a drop outside restore the original order', () => {
  const { pill, changes } = mount();
  for (const cancel of ['escape', 'pointercancel', 'outside']) {
    begin(pill);
    assert.equal(position(), 4);
    if (cancel === 'escape') act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })));
    else if (cancel === 'pointercancel') pointer(surface, 'pointercancel', 245, 110);
    else {
      pointer(surface, 'pointermove', 900, 900);
      frame();
      pointer(surface, 'pointerup', 900, 900);
    }
    assert.equal(position(), 1, cancel);
    assert.deepEqual(changes, [], cancel);
    assert.equal(captures.size, 0);
    frame(180);
  }
});

test('reduced motion retains direct tracking but skips settling animations', () => {
  reduced = true;
  const { pill, changes } = mount();
  begin(pill);
  assert.equal(position(), 4);
  assert.equal(pill.getBoundingClientRect().left, 215);
  assert.ok([...surface.querySelectorAll('[data-artifact-word]')].every(node => !node.style.transform));
  pointer(surface, 'pointerup', 245, 110);
  assert.deepEqual(changes, [4]);
  assert.equal(pill.style.transform, '');
});

test('a click does not reorder; keyboard movement remains available', () => {
  const { pill, changes } = mount();
  pointer(pill, 'pointerdown', 160, 35);
  pointer(surface, 'pointermove', 162, 36);
  pointer(surface, 'pointerup', 162, 36);
  assert.deepEqual(changes, []);
  act(() => pill.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'End' })));
  assert.equal(position(), 6);
  assert.deepEqual(changes, [6]);
});

test('a second pill reflows independently, preserving both media nodes', () => {
  const { first, second, changes, selections, starts } = mountMany();
  const firstMedia = first.shadowRoot.querySelector('img');
  const secondMedia = second.shadowRoot.querySelector('video');
  pointer(second, 'pointerdown', 270, 105);
  frame();
  pointer(surface, 'pointermove', 35, 40);
  frame();
  assert.equal(second.dataset.artifactPosition, '0');
  assert.equal(first.dataset.artifactPosition, '1');
  assert.equal(second.getBoundingClientRect().left, 5);
  assert.deepEqual(starts, ['second']);
  assert.deepEqual(changes, []);
  pointer(surface, 'pointerup', 35, 40);
  assert.deepEqual(changes, [['second', 0]]);
  assert.deepEqual(selections, [], 'drag release must not open settings');
  assert.equal(first.shadowRoot.querySelector('img'), firstMedia);
  assert.equal(second.shadowRoot.querySelector('video'), secondMedia);
  frame(180);
  assert.ok([first, second].every(node => !node.style.transform));
});

test('pointer and keyboard selection identify the correct pill without moving it', () => {
  const { first, second, selections, changes } = mountMany();
  pointer(second, 'pointerdown', 270, 105);
  pointer(surface, 'pointerup', 270, 105);
  act(() => first.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
  assert.deepEqual(selections, ['second', 'first']);
  assert.deepEqual(changes, []);
});

test('editing or removing one pill leaves another pill intact', () => {
  const { first, second, update } = mountMany();
  const media = second.shadowRoot.querySelector('video');
  update(items => items.map(item => item.id === 'first' ? { ...item, artifact: { ...item.artifact, width: '90px', fit: 'fill' } } : item));
  assert.equal(first.getAttribute('width'), '90px');
  assert.equal(second.getAttribute('width'), '150px');
  assert.equal(second.shadowRoot.querySelector('video'), media);
  update(items => items.filter(item => item.id !== 'first'));
  assert.equal(surface.querySelectorAll('artifact-pill').length, 1);
  assert.equal(surface.querySelector('artifact-pill'), second);
  assert.equal(second.shadowRoot.querySelector('video'), media);
});

test('cancelling a second-pill drag restores only its position', () => {
  const { first, second, changes } = mountMany();
  pointer(second, 'pointerdown', 270, 105);
  frame();
  pointer(surface, 'pointermove', 35, 40);
  frame();
  act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })));
  assert.equal(first.dataset.artifactPosition, '1');
  assert.equal(second.dataset.artifactPosition, '4');
  assert.deepEqual(changes, []);
  frame(180);
  assert.ok([first, second].every(node => !node.style.transform));
});

function mountEditor() {
  const container = document.createElement('div'); document.body.append(container);
  let state;
  function Editor() {
    const [text, setText] = useState('One two three four');
    const [artifacts, setArtifacts] = useState([
      { id: 'first', position: 1, artifact: { src: '/first.jpg', alt: 'First' } },
      { id: 'second', position: 3, artifact: { src: '/second.mp4', kind: 'video', alt: 'Second' } },
    ]);
    state = { text, artifacts };
    return createElement(InlineArtifactsText, { text, artifacts,
      onTextChange: (value, positions) => { setText(value); setArtifacts(items => items.map(item => ({ ...item, position: positions[item.id] }))); },
      onPositionChange: (id, position) => setArtifacts(items => items.map(item => item.id === id ? { ...item, position } : item)),
    });
  }
  reactRoot = createRoot(container); act(() => reactRoot.render(createElement(Editor)));
  surface = container.querySelector('[data-artifact-text]'); surface.focus();
  return { state: () => state, pills: [...surface.querySelectorAll('artifact-pill')] };
}
function selectDOM(start, startOffset, end = start, endOffset = startOffset) {
  const range = document.createRange(); range.setStart(start, startOffset); range.setEnd(end, endOffset);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
}
function nativeEdit(value, inputType = 'insertText') {
  act(() => surface.dispatchEvent(new window.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data: value })));
  const range = window.getSelection().getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(value); range.insertNode(node);
  selectDOM(node, value.length);
  act(() => surface.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType, data: value })));
}
function key(key, extra = {}) {
  act(() => surface.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...extra })));
}

test('in-place edits keep the caret and shift pills with their surrounding words', () => {
  const { state, pills } = mountEditor();
  const media = pills.map(pill => pill.shadowRoot.querySelector('img,video'));
  const word = surface.querySelector('[data-artifact-word="0"]').firstChild;
  selectDOM(word, 0, word, 3);
  nativeEdit('New bright');
  assert.equal(state().text, 'New bright two three four');
  assert.deepEqual(state().artifacts.map(item => item.position), [2, 4]);
  nativeEdit(' ideas');
  assert.equal(state().text, 'New bright ideas two three four');
  assert.deepEqual(state().artifacts.map(item => item.position), [3, 5]);
  assert.deepEqual([...surface.querySelectorAll('artifact-pill')], pills);
  assert.deepEqual(pills.map(pill => pill.shadowRoot.querySelector('img,video')), media);
});

test('replacing all text protects pills and supports undo/redo', () => {
  const { state, pills } = mountEditor();
  selectDOM(surface, 0, surface, surface.childNodes.length);
  nativeEdit('Hello 世界\nNew ideas 👋', 'insertFromPaste');
  assert.equal(state().text, 'Hello 世界\nNew ideas 👋');
  assert.deepEqual([...surface.querySelectorAll('artifact-pill')], pills);
  key('z', { ctrlKey: true });
  assert.equal(state().text, 'One two three four');
  assert.deepEqual(state().artifacts.map(item => item.position), [1, 3]);
  key('z', { ctrlKey: true, shiftKey: true });
  assert.equal(state().text, 'Hello 世界\nNew ideas 👋');
  assert.equal(surface.querySelectorAll('artifact-pill').length, 2);
});

test('empty text remains editable and paste ignores rich formatting', () => {
  const { state, pills } = mountEditor();
  selectDOM(surface, 0, surface, surface.childNodes.length);
  nativeEdit('', 'deleteContentBackward');
  assert.equal(state().text, '');
  assert.equal(surface.hasAttribute('data-artifact-empty'), true);
  assert.deepEqual([...surface.querySelectorAll('artifact-pill')], pills);
  selectDOM(surface, surface.childNodes.length);
  const paste = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: { getData: type => type === 'text/plain' ? '<b>Plain</b>\ntext' : '<b>Styled</b>' } });
  act(() => surface.dispatchEvent(paste));
  assert.equal(state().text, '<b>Plain</b>\ntext');
  assert.equal(surface.querySelector('b'), null);
});

test('IME composition is committed only after composition ends', () => {
  const { state } = mountEditor();
  const word = surface.querySelector('[data-artifact-word="0"]').firstChild;
  selectDOM(word, 0, word, 3);
  act(() => surface.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true })));
  word.nodeValue = '日本語'; selectDOM(word, 3);
  act(() => surface.dispatchEvent(new window.InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: '日本語' })));
  assert.equal(state().text, 'One two three four');
  act(() => surface.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true, data: '日本語' })));
  assert.equal(state().text, '日本語 two three four');
});

test('Enter leaves a usable caret on the final empty line', () => {
  const { state } = mountEditor();
  selectDOM(surface, surface.childNodes.length);
  act(() => surface.dispatchEvent(new window.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph' })));
  assert.equal(state().text, 'One two three four\n');
  assert.ok(surface.querySelector('[data-editor-tail]'));
  assert.equal(window.getSelection().focusNode, surface);
  nativeEdit('Next line');
  assert.equal(state().text, 'One two three four\nNext line');
});
