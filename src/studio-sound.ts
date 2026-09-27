export type UiSound = 'tick' | 'thump';
const preferenceKey = 'intertext.ui-sounds';

function readPreference() {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem(preferenceKey) !== 'off'; }
  catch { return true; }
}

/** The film's noise tick and noise + 65 Hz thump, synthesized only when needed. */
export class UiSounds {
  enabled = readPreference();
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private buffers = new Map<UiSound, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private last = new Map<UiSound, number>();
  private generation = 0;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
    try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); }
    catch { /* Sound still works when browser storage is unavailable. */ }
  }

  async unlock(): Promise<AudioContext | null> {
    if (!this.enabled || typeof window === 'undefined' || document.hidden) return null;
    try {
      if (!this.context) {
        const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) return null;
        const context = new Audio({ latencyHint: 'interactive' });
        const output = context.createGain();
        output.gain.value = .65;
        output.connect(context.destination);
        this.context = context;
        this.output = output;
      }
      const context = this.context;
      if (context.state !== 'running') await context.resume();
      return context.state === 'running' ? context : null;
    } catch { return null; }
  }

  play(kind: UiSound) {
    if (!this.enabled || typeof document === 'undefined' || document.hidden) return;
    const requested = performance.now();
    if (requested - (this.last.get(kind) ?? -Infinity) < (kind === 'tick' ? 65 : 100)) return;
    this.last.set(kind, requested);
    const generation = this.generation;
    void this.unlock().then(context => {
      // Never replay queued feedback after muting, backgrounding, or a slow unlock.
      if (!context || context !== this.context || !this.enabled || document.hidden
        || generation !== this.generation || performance.now() - requested > 180) return;
      try {
        let buffer = this.buffers.get(kind);
        if (!buffer) { buffer = this.synthesize(context, kind); this.buffers.set(kind, buffer); }
        if (this.voices.size >= 4) this.release(this.voices.values().next().value!);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.output!);
        source.onended = () => { source.disconnect(); this.voices.delete(source); };
        this.voices.add(source);
        source.start();
      } catch { /* Unsupported or interrupted audio must not affect the editor. */ }
    });
  }

  stop() {
    this.generation++;
    this.last.clear();
    for (const voice of this.voices) this.release(voice);
  }

  dispose() {
    this.stop();
    const context = this.context;
    this.context = null;
    this.output?.disconnect();
    this.output = null;
    this.buffers.clear();
    if (context) void context.close().catch(() => {});
  }

  private release(voice: AudioBufferSourceNode) {
    voice.onended = null;
    try { voice.stop(); } catch { /* Already ended. */ }
    voice.disconnect();
    this.voices.delete(voice);
  }

  private synthesize(context: AudioContext, kind: UiSound) {
    const rate = context.sampleRate;
    const duration = kind === 'thump' ? .28 : .03;
    const buffer = context.createBuffer(2, Math.round(rate * duration), rate);
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    const pan = kind === 'tick' ? .15 : 0;
    const leftGain = Math.sqrt((1 - pan) / 2), rightGain = Math.sqrt((1 + pan) / 2);
    // Repeatable Gaussian noise; match the film's 28-sample smoothing at 48 kHz.
    let seed = 31;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + 1) / 4294967297; };
    const history = new Float64Array(kind === 'thump' ? Math.max(1, Math.round(28 * rate / 48000)) : 1);
    let sum = 0;
    for (let i = 0; i < left.length; i++) {
      const t = i / rate;
      const noise = Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
      const slot = i % history.length;
      sum += noise - history[slot]; history[slot] = noise;
      const sample = kind === 'thump'
        ? sum / history.length * Math.exp(-t * 24) * .085 + Math.sin(2 * Math.PI * 65 * t) * Math.exp(-t * 18) * .055
        : noise * Math.exp(-t * 210) * .028;
      const edge = Math.min(1, t / .001, (duration - t) / .006);
      left[i] = Math.tanh(sample * leftGain * 2.7) * edge;
      right[i] = Math.tanh(sample * rightGain * 2.7) * edge;
    }
    return buffer;
  }
}

export const studioSounds = new UiSounds();
