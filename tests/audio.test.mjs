import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
const source = readFileSync(new URL('../src/lib/audio-waveform.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { waveformPeaks, waveformBarCount, waveformSpacing, smoothPlaybackTime } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
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
test('hard playback edge interpolates without overshoot and consistently across frame rates', () => {
 const first = smoothPlaybackTime(10, 10.2, 16);
 const second = smoothPlaybackTime(first, 10.2, 16);
 assert.ok(first > 10 && first < second && second < 10.2);
 assert.ok(Math.abs(second - smoothPlaybackTime(10, 10.2, 32)) < 1e-10);
 assert.equal(smoothPlaybackTime(10, 10.2, 0), 10);
 assert.ok(Math.abs(smoothPlaybackTime(10, 10.2, 700) - 10.2) < .00001);
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
globalThis.matchMedia = () => ({ get matches() { return reducedMotion; }, addEventListener() {}, removeEventListener() {} });
let plays = 0, pauses = 0;
dom.window.HTMLMediaElement.prototype.play = async function () { plays++; };
dom.window.HTMLMediaElement.prototype.pause = function () { pauses++; if (Object.hasOwn(this, 'paused')) this.paused = true; this.dispatchEvent(new dom.window.Event('pause')); };
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

test('playback fill tracks time, pauses, seeking, loops, and density changes without leaking frames', async () => {
 const frames = new Map(); let nextFrame = 0;
 globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
 globalThis.cancelAnimationFrame = id => frames.delete(id);
 const pill = document.createElement('artifact-pill');
 pill.setAttribute('kind', 'audio'); pill.setAttribute('src', '/clip.wav');
 document.body.append(pill);
 await new Promise(resolve => setTimeout(resolve, 0));
 const audio = pill.shadowRoot.querySelector('audio');
 Object.defineProperty(audio, 'duration', { configurable: true, value: 48 });
 Object.defineProperty(audio, 'paused', { configurable: true, writable: true, value: false });
 const emit = name => audio.dispatchEvent(new dom.window.Event(name));
 const fills = () => [...pill.shadowRoot.querySelector('.waveform-bars').children].map(bar => bar.style.getPropertyValue('--waveform-played'));
 audio.currentTime = 12; emit('playing');
 assert.equal(frames.size, 1);
 assert.equal(fills()[0], '100%');
 assert.equal(fills()[9], '0%');
 audio.currentTime = 24; [...frames.values()][0]();
 assert.equal(fills()[15], '100%'); assert.equal(fills()[16], '0%');
 audio.paused = true; emit('pause');
 assert.equal(frames.size, 0); assert.equal(fills()[15], '100%');
 audio.currentTime = 6; emit('seeked');
 observers.at(-1).resize(80);
 assert.equal(fills().length, 8);
 assert.ok(parseFloat(fills()[0]) > 0);
 assert.equal(fills()[2], '0%');
 audio.currentTime = 0; emit('timeupdate');
 assert.ok(fills().every(fill => fill === '0%'));
 reducedMotion = true; audio.paused = false; emit('playing');
 assert.equal(frames.size, 0);
 audio.currentTime = 24; emit('timeupdate'); assert.equal(fills()[3], '100%');
 reducedMotion = false; emit('playing'); assert.equal(frames.size, 1);
 pill.setAttribute('src', '/other.wav');
 await new Promise(resolve => setTimeout(resolve, 0));
 assert.ok(fills().every(fill => fill === '0%'));
 pill.remove(); assert.equal(frames.size, 0);
});

test('hover playback overrides paused for audio and video and stops when hover ends', () => {
 for (const kind of ['audio', 'video']) {
  const pill = document.createElement('artifact-pill');
  pill.setAttribute('kind', kind); pill.setAttribute('src', '/clip');
  pill.setAttribute('paused', ''); pill.setAttribute('play-on-hover', '');
  const before = plays;
  document.body.append(pill);
  pill.removeAttribute('paused');
  assert.equal(plays, before, 'hover mode stays idle even when paused is removed');
  pill.setAttribute('data-hover-active', '');
  assert.equal(plays, before + 1);
  const previousPauses = pauses;
  pill.removeAttribute('data-hover-active');
  assert.ok(pauses > previousPauses);
  reducedMotion = true;
  pill.setAttribute('data-hover-active', '');
  assert.equal(plays, before + 1, 'reduced motion suppresses automatic hover playback');
  reducedMotion = false;
  pill.remove();
 }
});

test('GIF hover playback swaps an accessible still preview for the animated image', () => {
 const original = dom.window.HTMLCanvasElement.prototype.getContext;
 let draws = 0;
 dom.window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() { draws++; } });
 const pill = document.createElement('artifact-pill');
 try {
  pill.setAttribute('kind', 'gif'); pill.setAttribute('src', '/clip.gif');
  pill.setAttribute('alt', 'Animated flowers'); pill.setAttribute('play-on-hover', '');
  document.body.append(pill);
  const image = pill.shadowRoot.querySelector('img');
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 400 }, naturalHeight: { value: 300 } });
  image.dispatchEvent(new dom.window.Event('load'));
  const still = pill.shadowRoot.querySelector('canvas');
  assert.equal(still.hidden, false); assert.equal(image.hidden, true);
  assert.equal(still.getAttribute('aria-label'), 'Animated flowers');
  assert.ok(draws > 0);
  pill.setAttribute('data-hover-active', '');
  assert.equal(still.hidden, true); assert.equal(image.hidden, false);
  pill.removeAttribute('data-hover-active');
  assert.equal(still.hidden, false); assert.equal(image.hidden, true);
  image.dispatchEvent(new dom.window.Event('error'));
  assert.equal(still.hidden, true);
  assert.equal(pill.shadowRoot.querySelector('.error').hidden, false);
 } finally { pill.remove(); dom.window.HTMLCanvasElement.prototype.getContext = original; }
});
