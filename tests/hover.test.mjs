import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><body></body>');
for (const key of ['window', 'document', 'HTMLElement', 'HTMLImageElement', 'HTMLVideoElement', 'HTMLAudioElement', 'HTMLMediaElement', 'customElements', 'CustomEvent']) {
  globalThis[key] = key === 'window' ? window : window[key];
}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.getComputedStyle = element => window.getComputedStyle(element);
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
const toggled = element => [element.hasAttribute('expanded'), element.getAttribute('aria-expanded')];
function key(target, key, options = {}) {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}
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

test('playback hover works independently of expansion and releases when disabled', () => {
 const first = pill();
 first.element.removeAttribute('hover-expand');
 first.element.setAttribute('play-on-hover', '');
 pointer(first.element, 'pointermove', 200, 300);
 assert.ok(active(first.element));
 first.element.setAttribute('hover-expand', '');
 first.element.removeAttribute('hover-expand');
 assert.ok(active(first.element), 'playback retains hover when expansion is disabled');
 first.element.removeAttribute('play-on-hover');
 assert.equal(active(first.element), false);
});

test('a tap, click, Enter or Space toggles a hover-expanding pill and reports it with aria-expanded', () => {
  const { element } = pill();
  element.setAttribute('alt', 'Concrete');
  element.tabIndex = 0;
  assert.equal(element.getAttribute('role'), 'button');
  assert.equal(element.getAttribute('aria-label'), 'Concrete', 'audio has no other text alternative, so every toggle is named');
  assert.deepEqual(toggled(element), [false, 'false']);
  // A tap: touch pointers never acquire hover, then the browser dispatches click.
  pointer(element, 'pointerdown', 200, 300, { pointerType: 'touch' });
  pointer(element, 'pointerup', 200, 300, { pointerType: 'touch' });
  pointer(element, 'click', 200, 300, { pointerType: 'touch' });
  assert.equal(active(element), false);
  assert.deepEqual(toggled(element), [true, 'true']);
  pointer(element, 'click', 200, 300, { pointerType: 'touch' });
  assert.deepEqual(toggled(element), [false, 'false']);
  element.focus();
  assert.ok(key(element, 'Enter').defaultPrevented);
  assert.deepEqual(toggled(element), [true, 'true']);
  assert.ok(key(element, ' ').defaultPrevented, 'Space must not scroll the page');
  assert.deepEqual(toggled(element), [false, 'false']);
  key(element, 'Enter', { repeat: true });
  key(element, 'Enter', { metaKey: true });
  key(element, 'a');
  assert.deepEqual(toggled(element), [false, 'false']);
  element.setAttribute('expanded', '');
  assert.equal(element.getAttribute('aria-expanded'), 'true', 'programmatic expansion stays in sync');
  element.setAttribute('alt', 'Concrete beams');
  assert.equal(element.getAttribute('aria-label'), 'Concrete beams');
  element.removeAttribute('hover-expand');
  for (const name of ['role', 'aria-label', 'aria-expanded']) assert.equal(element.hasAttribute(name), false, name);
  pointer(element, 'click', 200, 300);
  assert.ok(element.hasAttribute('expanded'), 'a static pill ignores activation');
});

test('an explicit collapse overrides the hover or focus preview until that preview ends', () => {
  const { element } = pill();
  element.tabIndex = 0;
  pointer(element, 'pointermove', 200, 300);
  pointer(element, 'click', 200, 300);
  assert.equal(element.hasAttribute('data-hover-dismissed'), false, 'pinning keeps the preview size');
  pointer(element, 'click', 200, 300);
  assert.ok(element.hasAttribute('data-hover-dismissed'), 'collapsing while hovered shrinks the pill at once');
  pointer(element, 'pointermove', 201, 300);
  assert.ok(active(element) && element.hasAttribute('data-hover-dismissed'));
  pointer(document.body, 'pointermove', 600, 500);
  assert.equal(element.hasAttribute('data-hover-dismissed'), false);
  pointer(element, 'pointermove', 200, 300);
  assert.ok(active(element), 'the next visit previews again');
  pointer(document.body, 'pointermove', 600, 500);
  element.focus();
  key(element, 'Enter');
  key(element, 'Enter');
  assert.ok(element.hasAttribute('data-hover-dismissed'), 'collapsing a focused pill overrides its focus preview');
  element.blur();
  assert.equal(element.hasAttribute('data-hover-dismissed'), false);
});

test('a page role, an enclosing link or a cancelled click keeps the page in control', () => {
  const editor = document.createElement('artifact-pill');
  editor.setAttribute('role', 'button');
  editor.setAttribute('aria-label', 'Edit pill');
  editor.setAttribute('hover-expand', '');
  document.body.append(editor);
  pointer(editor, 'click', 0, 0);
  assert.equal(editor.hasAttribute('expanded'), false, 'the studio editor selects pills on click');
  assert.equal(editor.hasAttribute('aria-expanded'), false);
  editor.removeAttribute('hover-expand');
  assert.equal(editor.getAttribute('role'), 'button');
  assert.equal(editor.getAttribute('aria-label'), 'Edit pill');

  const link = document.createElement('a');
  link.href = '#work';
  const linked = document.createElement('artifact-pill');
  linked.setAttribute('hover-expand', '');
  link.append(linked);
  document.body.append(link);
  assert.equal(linked.hasAttribute('role'), false);
  pointer(linked, 'click', 0, 0);
  assert.equal(linked.hasAttribute('expanded'), false, 'activating a link must not also toggle');

  const { element } = pill();
  element.setAttribute('role', 'img');
  assert.equal(element.hasAttribute('aria-expanded'), false);
  pointer(element, 'click', 0, 0);
  assert.equal(element.hasAttribute('expanded'), false);
  element.removeAttribute('role');
  assert.equal(element.getAttribute('role'), 'button');
  const cancel = event => event.preventDefault();
  document.addEventListener('click', cancel, true);
  pointer(element, 'click', 0, 0, { cancelable: true });
  document.removeEventListener('click', cancel, true);
  assert.equal(element.hasAttribute('expanded'), false);
});

test('loop alternates sizes, rests for reduced motion, and pauses when the attribute is removed', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const listeners = new Set();
  let reduced = false;
  const original = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ get matches() { return reduced; }, addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) });
  t.after(() => { globalThis.matchMedia = original; });
  const element = document.createElement('artifact-pill');
  element.setAttribute('src', '/photo.jpg');
  element.style.transitionDuration = '.5s'; // jsdom does not apply the shadow :host transition.
  element.setAttribute('loop', '');
  document.body.append(element);
  const expanded = () => element.hasAttribute('data-loop-expanded');
  t.mock.timers.tick(1249);
  assert.equal(expanded(), false);
  t.mock.timers.tick(1);
  assert.ok(expanded(), 'each size holds for 750ms after its transition, like the studio preview');
  element.style.transitionDuration = '1s';
  t.mock.timers.tick(1250);
  assert.equal(expanded(), false);
  t.mock.timers.tick(1749);
  assert.equal(expanded(), false, 'the next cycle follows the new duration');
  t.mock.timers.tick(1);
  assert.ok(expanded());
  reduced = true;
  listeners.forEach(listener => listener());
  assert.equal(expanded(), false, 'reduced motion returns to the resting size');
  t.mock.timers.tick(10000);
  assert.equal(expanded(), false);
  reduced = false;
  listeners.forEach(listener => listener());
  t.mock.timers.tick(1750);
  assert.ok(expanded());
  element.removeAttribute('loop');
  assert.equal(expanded(), false, 'removing loop pauses it at the resting size');
  t.mock.timers.tick(10000);
  assert.equal(expanded(), false);
  element.setAttribute('loop', '');
  element.remove();
  t.mock.timers.tick(10000);
  assert.equal(expanded(), false, 'a disconnected pill stops its timer');
});
