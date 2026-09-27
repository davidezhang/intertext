/** Decode the actual clip into a compact amplitude envelope. */
export function waveformPeaks(channels: Float32Array[], count = 64): number[] {
  const length = channels[0]?.length || 0;
  const peaks = Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * length / count);
    const end = Math.min(length, Math.max(start + 1, Math.floor((index + 1) * length / count)));
    let peak = 0;
    for (const channel of channels) for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(channel[i]));
    return peak;
  });
  const max = Math.max(...peaks, .001);
  return peaks.map(peak => peak / max);
}

/** Keep bars around 4px wide with equal gaps; add a buffer before growing density. */
export function waveformBarCount(width: number, current?: number): number {
  const target = Math.max(4, Math.min(32, Math.floor(width / 32) * 4));
  if (current !== undefined && target > current && width < target * 8 + 8) return current;
  return target;
}

/** Use one device-pixel pitch for every bar, avoiding flex's fractional distribution. */
export function waveformSpacing(width: number, count: number, pixelRatio = 1) {
  const pitch = Math.max(2, Math.floor(width * pixelRatio / count));
  const bar = Math.max(1, Math.floor(pitch / 2));
  return { barWidth: bar / pixelRatio, gap: (pitch - bar) / pixelRatio };
}

export class AudioWaveform {
  readonly element = document.createElement('div');
  private request?: AbortController;
  private resize?: ResizeObserver;
  private envelope?: Float32Array;
  private count = 32;
  private width = 0;
  private layer?: HTMLDivElement;
  private outgoing?: HTMLDivElement;
  private fades: Animation[] = [];
  private settleTimer?: ReturnType<typeof setTimeout>;
  constructor() {
    this.element.setAttribute('aria-hidden', 'true');
    this.element.classList.add('waveform');
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(entries => {
        const width = entries[0]?.contentRect.width;
        if (!width) return; // Hidden panels retain their last useful density.
        const firstMeasurement = !this.width;
        this.width = width;
        this.cancelTransition();
        if (firstMeasurement || this.reducedMotion()) {
          this.settle(false);
          return;
        }
        // Hold the same audio samples throughout a resize. Continuous percentages
        // follow the host's animation without stepping through pixel pitches.
        this.element.dataset.resizing = '';
        if (this.layer) this.setSpacing(this.layer, true);
        this.settleTimer = setTimeout(() => this.settle(true), 120);
      });
    }
  }
  private reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  private cancelTransition() {
    clearTimeout(this.settleTimer);
    this.fades.forEach(animation => animation.cancel());
    this.fades = [];
    this.outgoing?.remove();
    this.outgoing = undefined;
  }
  private setSpacing(layer: HTMLDivElement, fluid = false) {
    const spacing = waveformSpacing(this.width || 256, this.count, window.devicePixelRatio || 1);
    layer.style.setProperty('--waveform-bar-width', fluid ? `${50 / this.count}%` : `${spacing.barWidth}px`);
    layer.style.setProperty('--waveform-gap', fluid ? `${50 / this.count}%` : `${spacing.gap}px`);
  }
  private settle(animate: boolean) {
    delete this.element.dataset.resizing;
    const count = waveformBarCount(this.width, this.count);
    if (count !== this.count) {
      this.count = count;
      this.render(animate);
    } else if (this.layer) this.setSpacing(this.layer);
  }
  async load(src: string) {
    this.request?.abort();
    this.cancelTransition();
    this.envelope = undefined;
    this.layer = undefined;
    delete this.element.dataset.resizing;
    this.resize?.observe(this.element);
    const request = this.request = new AbortController();
    this.element.replaceChildren();
    this.element.dataset.state = 'loading';
    let context: AudioContext | undefined;
    try {
      const response = await fetch(src, { signal: request.signal });
      if (!response.ok) throw new Error('Audio unavailable');
      const bytes = await response.arrayBuffer();
      if (request.signal.aborted) return;
      context = new AudioContext();
      const buffer = await context.decodeAudioData(bytes);
      if (request.signal.aborted) return;
      // Cache the envelope once; resizing never fetches or decodes the clip again.
      this.envelope = new Float32Array(waveformPeaks(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)), 512));
      this.render();
      this.element.dataset.state = 'ready';
    } catch {
      if (!request.signal.aborted) this.element.dataset.state = 'unavailable';
    } finally {
      if (context) void context.close().catch(() => {});
    }
  }
  private render(animate = false) {
    if (!this.envelope) return;
    const peaks = waveformPeaks([this.envelope], this.count);
    const layer = document.createElement('div');
    layer.className = 'waveform-bars';
    this.setSpacing(layer, this.element.hasAttribute('data-resizing'));
    peaks.forEach(peak => {
      const bar = document.createElement('span');
      bar.style.height = `${Math.max(2, Math.pow(peak, 2.6) * 72) / 80 * 100}%`;
      layer.append(bar);
    });
    const previous = this.layer;
    this.layer = layer;
    if (animate && previous && typeof layer.animate === 'function' && !this.reducedMotion()) {
      this.outgoing = previous;
      this.element.append(layer);
      const options = { duration: 180, easing: 'ease-in-out' };
      const fadeOut = previous.animate([{ opacity: 1 }, { opacity: 0 }], options);
      const fadeIn = layer.animate([{ opacity: 0 }, { opacity: 1 }], options);
      this.fades = [fadeOut, fadeIn];
      void fadeOut.finished.then(() => {
        previous.remove();
        if (this.outgoing === previous) { this.outgoing = undefined; this.fades = []; }
      }).catch(() => {});
    } else this.element.replaceChildren(layer);
  }
  disconnect() {
    this.request?.abort();
    this.resize?.disconnect();
    this.cancelTransition();
  }
}
