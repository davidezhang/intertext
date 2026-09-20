import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { act, createElement, StrictMode, useState } from 'react';

const { window } = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'SVGElement', 'MutationObserver']) {
  globalThis[key] = key === 'window' ? window : window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const { createRoot } = await import('react-dom/client');
const { DialStore } = await import('dialkit');
const source = readFileSync(new URL('../src/DialTransition.tsx', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
} }).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, name) => `from '${import.meta.resolve(name)}'`);
const { DialTransition } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('DialKit editor follows the selected pill and releases its store on close', () => {
  const originalCount = DialStore.getPanels().length;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const values = {
    first: { type: 'easing', duration: .65, ease: [.22, 1, .36, 1] },
    second: { type: 'spring', stiffness: 160, damping: 12, mass: 1 },
  };
  let select, replace;
  function Harness() {
    const [id, setId] = useState('first');
    const [pills, setPills] = useState(values);
    select = setId;
    replace = (value) => setPills(current => ({ ...current, [id]: value }));
    return id ? createElement(DialTransition, { key: id, value: pills[id], onChange: replace }) : null;
  }
  const radio = label => [...container.querySelectorAll('[role="radio"]')].find(node => node.textContent === label);
  try {
    act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
    assert.equal(DialStore.getPanels().length, originalCount + 1);
    assert.equal(radio('Easing').getAttribute('aria-checked'), 'true');
    act(() => radio('Time').click());
    assert.equal(radio('Time').getAttribute('aria-checked'), 'true');
    act(() => select('second'));
    assert.equal(DialStore.getPanels().length, originalCount + 1);
    assert.equal(radio('Physics').getAttribute('aria-checked'), 'true');
    act(() => select('first'));
    assert.equal(radio('Time').getAttribute('aria-checked'), 'true');
    // External presets/reset must also change the editor mode without a remount.
    act(() => replace(values.first));
    assert.equal(radio('Easing').getAttribute('aria-checked'), 'true');
    act(() => select(null));
    assert.equal(DialStore.getPanels().length, originalCount);
    act(() => select('second'));
    assert.equal(radio('Physics').getAttribute('aria-checked'), 'true');
  } finally {
    act(() => root.unmount());
    container.remove();
  }
  assert.equal(DialStore.getPanels().length, originalCount);
});
