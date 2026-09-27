import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
const source = readFileSync(new URL('../src/lib/audio-waveform.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { waveformPeaks, waveformBarCount, waveformSpacing } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
test('waveform represents both channels, silence, and short clips without invalid values', () => {
  assert.deepEqual(waveformPeaks([new Float32Array([0, .25, 0, -.5]), new Float32Array([1, 0, 0, 0])], 4), [1, .25, 0, .5]);
  assert.deepEqual(waveformPeaks([new Float32Array(20)], 4), [0, 0, 0, 0]);
  assert.ok(waveformPeaks([new Float32Array([.5])]).every(Number.isFinite));
});
test('waveform density reduces at narrow widths and stays stable near a resize boundary', () => {
 assert.equal(waveformBarCount(264), 32);
 assert.equal(waveformBarCount(160), 20);
 assert.equal(waveformBarCount(80), 8);
 assert.equal(waveformBarCount(20), 4);
 assert.equal(waveformBarCount(159, 20), 16);
 assert.equal(waveformBarCount(161, 16), 16);
 assert.equal(waveformBarCount(168, 16), 20);
});
test('bars and gaps share a whole device-pixel pitch at fractional container widths', () => {
 for (const ratio of [1, 1.25, 2, 3]) {
  for (const width of [79.5, 159.7, 264.2, 500.5]) {
   const count = waveformBarCount(width);
   const { barWidth, gap } = waveformSpacing(width, count, ratio);
   assert.ok(Number.isInteger(barWidth * ratio));
   assert.ok(Number.isInteger(gap * ratio));
   assert.ok(count * barWidth + (count - 1) * gap <= width);
  }
 }
});
const observers = [];
globalThis.ResizeObserver = class {
 constructor(callback) { this.callback = callback; observers.push(this); }
 observe() { this.active = true; }
 disconnect() { this.active = false; }
 resize(width) { if (this.active) this.callback([{ contentRect: { width } }]); }
};
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLImageElement', 'HTMLVideoElement', 'HTMLAudioElement', 'HTMLMediaElement', 'customElements', 'CustomEvent']) globalThis[key] = dom.window[key];
let reducedMotion = false;
globalThis.matchMedia = () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} });
let plays = 0, pauses = 0;
dom.window.HTMLMediaElement.prototype.play = async function () { plays++; };
dom.window.HTMLMediaElement.prototype.pause = function () { pauses++; };
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
globalThis.AudioContext = class {
 async decodeAudioData() { return { numberOfChannels: 1, getChannelData: () => new Float32Array([0, .5, 1, .25]) }; }
 async close() {}
};
await import('../dist/lib/artifact-pill.js');
test('audio decodes its waveform, stays silent until requested, and cleans up on replacement', async () => {
 const pill = document.createElement('artifact-pill');
 pill.setAttribute('kind', 'audio'); pill.setAttribute('src', '/clip.wav'); pill.setAttribute('paused', '');
 document.body.append(pill);
 await new Promise(resolve => setTimeout(resolve, 0));
 assert.equal(plays, 0);
 assert.equal(pill.shadowRoot.querySelectorAll('.waveform-bars > span').length, 32);
 assert.equal(pill.shadowRoot.querySelector('.waveform').dataset.state, 'ready');
 const observer = observers.at(-1);
 observer.resize(80);
 assert.equal(pill.shadowRoot.querySelectorAll('.waveform-bars > span').length, 8);
 observer.resize(264);
 assert.equal(pill.shadowRoot.querySelectorAll('.waveform-bars > span').length, 8);
 await new Promise(resolve => setTimeout(resolve, 150));
 assert.equal(pill.shadowRoot.querySelectorAll('.waveform-bars > span').length, 32);
 pill.removeAttribute('paused'); assert.equal(plays, 1);
 pill.setAttribute('width', '5em'); assert.equal(plays, 1);
 const before = pauses;
 pill.setAttribute('paused', ''); assert.ok(pauses > before);
 pill.setAttribute('kind', 'image');
 assert.equal(pill.shadowRoot.querySelector('audio'), null);
 assert.equal(pill.shadowRoot.querySelector('.waveform'), null);
 assert.equal(observer.active, false);
 pill.remove();
});

test('resize reversals retain bars, reduced motion updates immediately, and disconnect cancels settling', async () => {
 const pill = document.createElement('artifact-pill');
 pill.setAttribute('kind', 'audio'); pill.setAttribute('src', '/clip.wav');
 document.body.append(pill);
 await new Promise(resolve => setTimeout(resolve, 0));
 const observer = observers.at(-1);
 observer.resize(80);
 const original = pill.shadowRoot.querySelector('.waveform-bars');
 observer.resize(200);
 observer.resize(80);
 await new Promise(resolve => setTimeout(resolve, 150));
 assert.equal(pill.shadowRoot.querySelector('.waveform-bars'), original);
 reducedMotion = true;
 observer.resize(264);
 assert.equal(pill.shadowRoot.querySelector('.waveform-bars').children.length, 32);
 reducedMotion = false;
 observer.resize(80);
 pill.remove();
 await new Promise(resolve => setTimeout(resolve, 150));
 assert.equal(pill.shadowRoot.querySelector('.waveform-bars').children.length, 32);
 assert.equal(observer.active, false);
});
