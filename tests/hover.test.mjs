import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><body></body>');
for (const key of ['window', 'document', 'HTMLElement', 'HTMLImageElement', 'HTMLVideoElement', 'HTMLAudioElement', 'HTMLMediaElement', 'customElements', 'CustomEvent']) {
  globalThis[key] = key === 'window' ? window : window[key];
}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
await import('../dist/lib/artifact-pill.js');

function pill(x = 40, y = 260, width = 330, height = 85) {
  const element = document.createElement('artifact-pill');
  element.setAttribute('src', '/photo.jpg');
  element.setAttribute('hover-expand', '');
  let box = new window.DOMRect(x, y, width, height);
  element.getBoundingClientRect = () => box;
  document.body.append(element);
  return { element, layout: (x, y, width, height) => { box = new window.DOMRect(x, y, width, height); } };
}
function pointer(target, type, x, y, options = {}) {
  const event = new window.MouseEvent(type, { bubbles: true, composed: true, clientX: x, clientY: y, ...options });
  Object.defineProperties(event, {
    pointerType: { value: options.pointerType ?? 'mouse' },
    pointerId: { value: 1 }, isPrimary: { value: true },
  });
  target.dispatchEvent(event);
}
const active = element => element.hasAttribute('data-hover-active');
afterEach(() => document.body.replaceChildren());

test('a centered multi-row reflow cannot cancel hover or activate a displaced sibling', () => {
  const first = pill(), displaced = pill(760, 260);
  pointer(first.element, 'pointermove', 200, 340);
  assert.ok(active(first.element));
  // Expanding the first pill adds a row and moves it above the pointer. The third
  // pill now occupies that point, producing boundary events without pointer motion.
  first.layout(40, 203, 510, 85);
  displaced.layout(40, 317, 330, 85);
  for (let n = 0; n < 10; n++) {
    pointer(first.element, 'pointerout', 200, 340, { relatedTarget: displaced.element });
    pointer(first.element, 'pointerleave', 200, 340, { relatedTarget: displaced.element });
    pointer(displaced.element, 'pointerover', 200, 340, { relatedTarget: first.element });
    pointer(displaced.element, 'pointerenter', 200, 340, { relatedTarget: first.element });
    pointer(displaced.element, 'pointermove', 200, 340);
  }
  assert.ok(active(first.element));
  assert.equal(active(displaced.element), false);
  pointer(displaced.element, 'pointermove', 202, 339);
  assert.ok(active(first.element), 'small real movements within the original hit area retain ownership');
  pointer(first.element, 'pointermove', 500, 220);
  assert.ok(active(first.element), 'the expanded part remains interactive outside the original bounds');
  pointer(document.body, 'pointermove', 600, 500);
  assert.equal(active(first.element), false);
  // Collapsing may move the pill under the unchanged pointer again; that cannot reacquire hover.
  pointer(first.element, 'pointerenter', 600, 500);
  pointer(first.element, 'pointermove', 600, 500);
  assert.equal(active(first.element), false);
});

test('moving outside the stable area transfers hover to one sibling at a time', () => {
  const first = pill(), second = pill(600, 260);
  pointer(first.element, 'pointermove', 200, 300);
  pointer(second.element.shadowRoot.querySelector('img'), 'pointermove', 700, 300);
  assert.equal(active(first.element), false);
  assert.ok(active(second.element));
  pointer(first.element, 'pointermove', 200, 300);
  assert.ok(active(first.element));
  assert.equal(active(second.element), false);
});

test('the stable area bridges a gap when reflow moves a pill by more than its height', () => {
  const first = pill();
  pointer(first.element, 'pointermove', 200, 330);
  first.layout(40, 100, 510, 85);
  pointer(document.body, 'pointermove', 200, 230);
  assert.ok(active(first.element));
  pointer(first.element, 'pointermove', 200, 150);
  assert.ok(active(first.element));
  pointer(document.body, 'pointermove', 200, 80);
  assert.equal(active(first.element), false);
});

test('touch and drag movement do not acquire hover; disabling hover clears it immediately', () => {
  const first = pill(), second = pill(600, 260);
  pointer(first.element, 'pointermove', 200, 300, { pointerType: 'touch' });
  assert.equal(active(first.element), false);
  pointer(first.element, 'pointermove', 200, 300);
  first.element.removeAttribute('hover-expand'); // The React drag path disables hover.
  assert.equal(active(first.element), false);
  pointer(second.element, 'pointermove', 700, 300, { buttons: 1 });
  assert.equal(active(second.element), false);
  pointer(second.element, 'pointermove', 701, 300);
  assert.ok(active(second.element));
  pointer(document.body, 'pointerdown', 701, 300, { pointerType: 'touch' });
  assert.equal(active(second.element), false);
});

test('document exit, scrolling, cancellation, visibility, resize, and blur release hover', () => {
  const first = pill();
  const exits = [
    () => pointer(first.element, 'pointerout', 200, 300, { relatedTarget: null }),
    () => document.body.dispatchEvent(new window.Event('scroll')),
    () => document.dispatchEvent(new window.Event('pointercancel')),
    () => document.dispatchEvent(new window.Event('visibilitychange')),
    () => window.dispatchEvent(new window.Event('resize')),
    () => window.dispatchEvent(new window.Event('blur')),
  ];
  for (const [index, exit] of exits.entries()) {
    pointer(first.element, 'pointermove', 200 + index, 300);
    assert.ok(active(first.element));
    exit();
    assert.equal(active(first.element), false);
  }
});

test('scroll and resize cannot reacquire hover through a stationary pointer event', () => {
  const first = pill();
  pointer(first.element, 'pointermove', 200, 300);
  document.body.dispatchEvent(new window.Event('scroll'));
  pointer(first.element, 'pointermove', 200, 300);
  assert.equal(active(first.element), false);
  pointer(first.element, 'pointermove', 201, 300);
  assert.ok(active(first.element));
  window.dispatchEvent(new window.Event('resize'));
  pointer(first.element, 'pointermove', 201, 300);
  assert.equal(active(first.element), false);
});

test('disconnecting releases ownership and supports reconnect without stale document listeners', () => {
  const first = pill();
  pointer(first.element, 'pointermove', 200, 300);
  first.element.remove();
  assert.equal(active(first.element), false);
  document.body.append(first.element);
  pointer(first.element, 'pointermove', 200, 300);
  assert.ok(active(first.element));
  pointer(document.body, 'pointerdown', 600, 300);
  assert.equal(active(first.element), false);
  assert.equal(first.element.hasAttribute('expanded'), false);
});
