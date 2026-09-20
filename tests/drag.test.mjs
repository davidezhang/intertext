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
const { InlineArtifactText } = await import('../dist/lib/react.js');
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
