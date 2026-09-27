import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/studio-sound.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { UiSounds } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
let now, contexts, stored;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

class AudioContextStub {
  state = 'running';
  sampleRate = 48000;
  destination = {};
  sources = [];
  constructor() { contexts.push(this); }
  createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / sampleRate, getChannelData: channel => data[channel] };
  }
  createBufferSource() {
    const voice = { started: false, stopped: false, disconnected: false,
      connect() {}, disconnect() { this.disconnected = true; },
      start() { this.started = true; }, stop() { this.stopped = true; } };
    this.sources.push(voice); return voice;
  }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

test.beforeEach(() => {
  now = 0; contexts = []; stored = new Map();
  globalThis.window = { AudioContext: AudioContextStub };
  globalThis.document = { hidden: false };
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value),
  } });
});

test('audio stays lazy, generates quiet finite stereo cues, and releases completed voices', async () => {
  const sound = new UiSounds();
  assert.equal(contexts.length, 0);
  sound.play('thump'); await flush();
  sound.play('tick'); await flush();
  assert.equal(contexts.length, 1);
  const voices = contexts[0].sources;
  assert.deepEqual(voices.map(voice => voice.buffer.duration), [.28, .03]);
  for (const voice of voices) {
    assert.equal(voice.started, true);
    for (const channel of [0, 1]) {
      const samples = voice.buffer.getChannelData(channel);
      assert.ok(samples.every(Number.isFinite));
      assert.ok(samples.some(value => Math.abs(value) > .001));
      assert.ok(samples.every(value => Math.abs(value) < .2));
      assert.equal(samples[0], 0);
      assert.ok(Math.abs(samples.at(-1)) < .001);
    }
    voice.onended();
    assert.equal(voice.disconnected, true);
  }
  sound.dispose();
  assert.equal(contexts[0].state, 'closed');
});

test('muting stops active voices, persists across sessions, and allows re-enabling', async () => {
  const sound = new UiSounds();
  sound.play('thump'); await flush();
  sound.setEnabled(false);
  assert.equal(contexts[0].sources[0].stopped, true);
  assert.equal(contexts[0].sources[0].disconnected, true);
  sound.play('tick'); await flush();
  const nextSession = new UiSounds();
  assert.equal(nextSession.enabled, false);
  await nextSession.unlock();
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].sources.length, 1);
  nextSession.setEnabled(true); nextSession.play('tick'); await flush();
  assert.equal(contexts.length, 2);
  assert.equal(contexts[1].sources.length, 1);
  sound.dispose(); nextSession.dispose();
});

test('rapid input is rate-limited and overlapping voices are bounded', async () => {
  const sound = new UiSounds();
  for (let i = 0; i < 20; i++) sound.play('tick');
  await flush();
  assert.equal(contexts[0].sources.length, 1);
  for (let i = 0; i < 8; i++) { now += 70; sound.play('tick'); await flush(); }
  assert.equal(contexts[0].sources.filter(voice => !voice.stopped).length, 4);
  sound.dispose();
  assert.ok(contexts[0].sources.every(voice => voice.stopped));
});

test('a pending unlock cannot replay old feedback after mute, hiding, delay, or disposal', async () => {
  for (const interrupt of ['mute', 'hide', 'delay', 'dispose']) {
    document.hidden = false; stored.clear(); now += 1000;
    let resume;
    window.AudioContext = class extends AudioContextStub {
      state = 'suspended';
      resume() { return new Promise(resolve => { resume = () => { this.state = 'running'; resolve(); }; }); }
    };
    const sound = new UiSounds();
    sound.play('thump');
    const context = contexts.at(-1);
    if (interrupt === 'mute') { sound.setEnabled(false); sound.setEnabled(true); }
    if (interrupt === 'hide') { document.hidden = true; sound.stop(); document.hidden = false; }
    if (interrupt === 'delay') now += 200;
    if (interrupt === 'dispose') sound.dispose();
    resume(); await flush();
    assert.equal(context.sources.length, 0, interrupt);
    sound.dispose();
  }
});

test('hidden tabs, unavailable audio, rejected unlocks, and blocked storage fail quietly', async () => {
  document.hidden = true;
  const hidden = new UiSounds(); hidden.play('tick'); await flush();
  assert.equal(contexts.length, 0);
  document.hidden = false;
  window.AudioContext = undefined;
  const unsupported = new UiSounds(); unsupported.play('tick'); await flush();
  assert.equal(contexts.length, 0);
  window.AudioContext = class extends AudioContextStub {
    state = 'suspended';
    async resume() { throw Error('Playback blocked'); }
  };
  localStorage.getItem = localStorage.setItem = () => { throw Error('Storage blocked'); };
  const blocked = new UiSounds(); blocked.setEnabled(true); blocked.play('tick'); await flush();
  assert.equal(contexts[0].sources.length, 0);
  blocked.dispose();
});
