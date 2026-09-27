/** A dependency-free inline image, GIF, video, or audio. Import once to register <artifact-pill>. */
import { AudioWaveform, smoothPlaybackTime } from './audio-waveform.js';
import { connectPillHover } from './pill-hover.js';

export type MediaFit = 'crop' | 'fit' | 'fill';
export type MediaKind = 'image' | 'gif' | 'video' | 'audio';

const styles = `
  :host {
    display: inline-block; position: relative; box-sizing: border-box;
    width: var(--artifact-width, 2.8em); height: var(--artifact-height, .85em);
    max-width: 100%; vertical-align: var(--artifact-align, -.08em);
    border-radius: var(--artifact-radius, 999px); overflow: hidden;
    background: var(--artifact-background, #253429); isolation: isolate;
    transition-property: width, height, border-radius;
    transition-duration: var(--artifact-duration, 500ms);
    transition-timing-function: var(--artifact-easing, cubic-bezier(.22, 1, .36, 1));
  }
  :host([expanded]), :host([hover-expand][data-hover-active]), :host([hover-expand]:focus-visible) {
    width: var(--artifact-expanded-width, 4.2em); height: var(--artifact-expanded-height, 1.25em);
  }
  :host(:focus-visible) { outline: 2px solid var(--artifact-focus, #000); outline-offset: 4px; }
  img, video, canvas { display:block; width:100%; height:100%; object-fit:cover; object-position:50% 50%; pointer-events:none; }
  :host([kind="audio"]) { background:var(--artifact-audio-background, #000); color:var(--artifact-audio-color, #fff); }
  @media (prefers-color-scheme: dark) { :host([kind="audio"]) { background:var(--artifact-audio-background, #fff); color:var(--artifact-audio-color, #000); } }
  audio { display:none; }
  .waveform { position:absolute; inset:18% 10%; width:80%; height:64%; pointer-events:none; }
  .waveform-bars { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:var(--waveform-gap, 2px); transition:gap 180ms ease-in-out; }
  /* CSS radii stay circular as width and height change independently. */
  .waveform-bars > span { display:block; flex:0 0 var(--waveform-bar-width, 2px); border-radius:999px; background:linear-gradient(to right, var(--artifact-audio-progress, #888) var(--waveform-played, 0%), currentColor var(--waveform-played, 0%)); transition:flex-basis 180ms ease-in-out; }
  .waveform[data-resizing] .waveform-bars, .waveform[data-resizing] .waveform-bars > span { transition:none; }
  .waveform[data-state="loading"] { border-bottom:1px solid currentColor; height:32%; opacity:.25; }
  .waveform[data-state="unavailable"] { border-bottom:1px dashed currentColor; height:32%; opacity:.4; }
  :host([kind="audio"]) .error { color:inherit; background:inherit; z-index:1; }
  .error { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font:11px/1.2 system-ui,sans-serif; color:#fff; padding:4px; text-align:center; }
  [hidden] { display:none !important; }
  @media (prefers-reduced-motion: reduce) { :host, .waveform-bars, .waveform-bars > span { transition:none; } }
`;

// Importing in an SSR environment is safe. Registration happens in the browser bundle.
const BaseElement = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

export class ArtifactPillElement extends BaseElement {
  static observedAttributes = ['src', 'kind', 'alt', 'fit', 'position', 'poster', 'paused', 'width', 'height', 'radius', 'duration', 'easing', 'expanded-width', 'expanded-height', 'hover-expand', 'play-on-hover', 'data-hover-active'];
  private media?: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  private waveform?: AudioWaveform;
  private fallback?: HTMLSpanElement;
  private gifStill?: HTMLCanvasElement;
  private motionQuery?: MediaQueryList;
  private hover?: ReturnType<typeof connectPillHover>;
  private managedProperties = new Set<string>();
  private audioFrame = 0;
  private displayedAudioTime?: number;
  private observedAudioTime?: number;
  private audioFrameTime?: number;
  private onMotionChange = () => { this.syncPlayback(); this.syncAudioProgress(true); };
  private syncAudioProgress = (reset = false) => {
    if (this.audioFrame) cancelAnimationFrame(this.audioFrame);
    this.audioFrame = 0;
    if (!(this.media instanceof HTMLAudioElement) || !this.waveform) return;
    const time = this.media.currentTime;
    const now = performance.now();
    const animating = this.isConnected && !this.media.paused && !this.media.ended && !this.motionQuery?.matches;
    const discontinuity = this.observedAudioTime !== undefined
      && (time < this.observedAudioTime || Math.abs(time - this.observedAudioTime) > .5);
    // Seeking, looping, pausing, and reduced motion stay exact. During playback,
    // interpolate the edge's position rather than blending either waveform color.
    this.displayedAudioTime = reset || !animating || discontinuity || this.displayedAudioTime === undefined
      ? time : smoothPlaybackTime(this.displayedAudioTime, time, now - (this.audioFrameTime ?? now));
    this.observedAudioTime = time;
    this.audioFrameTime = now;
    this.waveform.setProgress(this.displayedAudioTime, this.media.duration);
    if (animating) this.audioFrame = requestAnimationFrame(() => this.syncAudioProgress());
  };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = styles;
    root.append(style);
  }

  connectedCallback() {
    this.hover = connectPillHover(this);
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionQuery.addEventListener('change', this.onMotionChange);
    const reconnectingWaveform = this.waveform;
    this.update();
    if (reconnectingWaveform && this.waveform) void this.waveform.load(this.getAttribute('src') || '');
    this.syncAudioProgress();
  }

  disconnectedCallback() {
    this.hover?.disconnect();
    this.hover = undefined;
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    if (this.media instanceof HTMLMediaElement) this.media.pause();
    this.waveform?.disconnect();
    if (this.audioFrame) cancelAnimationFrame(this.audioFrame);
    this.audioFrame = 0;
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (name === 'data-hover-active') {
      if (this.isConnected && this.hasAttribute('play-on-hover')) this.syncPlayback();
      return;
    }
    if (name === 'hover-expand' || name === 'play-on-hover') this.hover?.update();
    if (!this.isConnected) return;
    this.update();
    if (name === 'paused' && previous !== null && next === null && !this.hasAttribute('play-on-hover') && this.media instanceof HTMLAudioElement) {
      void this.play().catch(() => {});
    }
  }

  private update() {
    const kind = this.getAttribute('kind') || 'image';
    const tag = kind === 'audio' ? 'AUDIO' : kind === 'video' ? 'VIDEO' : 'IMG';
    if (!this.media || this.media.tagName !== tag) {
      if (this.media instanceof HTMLMediaElement) this.media.pause();
      if (this.audioFrame) cancelAnimationFrame(this.audioFrame);
      this.audioFrame = 0;
      this.waveform?.disconnect();
      this.waveform?.element.remove();
      this.waveform = undefined;
      this.gifStill?.remove();
      this.gifStill = undefined;
      this.media?.remove();
      this.fallback?.remove();
      this.media = document.createElement(tag.toLowerCase()) as HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
      this.media.setAttribute('part', 'media');
      const currentMedia = this.media;
      this.media.addEventListener('error', () => {
        if (this.media !== currentMedia) return;
        this.fallback!.hidden = false;
        if (this.gifStill) this.gifStill.hidden = true;
        this.dispatchEvent(new CustomEvent('artifact-error', { bubbles: true, composed: true, detail: { src: this.getAttribute('src') } }));
      });
      const loaded = () => { if (this.media === currentMedia) { this.fallback!.hidden = true; this.syncPlayback(); } };
      this.media.addEventListener('load', loaded);
      this.media.addEventListener('loadeddata', loaded);
      this.fallback = document.createElement('span');
      this.fallback.className = 'error';
      this.fallback.textContent = 'Media unavailable';
      this.fallback.hidden = true;
      this.shadowRoot!.append(this.media, this.fallback);
      if (kind === 'audio') {
        this.waveform = new AudioWaveform();
        this.shadowRoot!.append(this.waveform.element);
        for (const event of ['playing', 'pause', 'timeupdate', 'seeking', 'seeked', 'durationchange', 'ended', 'emptied']) {
          currentMedia.addEventListener(event, () => {
            if (this.media === currentMedia) this.syncAudioProgress(event !== 'timeupdate');
          });
        }
      }
    }
    const src = this.getAttribute('src') || '';
    if (this.media.getAttribute('src') !== src) {
      this.fallback!.hidden = true;
      if (this.media instanceof HTMLAudioElement) this.media.pause();
      this.displayedAudioTime = this.observedAudioTime = this.audioFrameTime = undefined;
      this.media.setAttribute('src', src);
      if (this.waveform) void this.waveform.load(src);
    }
    const label = this.getAttribute('alt') || '';
    if (this.media instanceof HTMLImageElement) {
      this.media.alt = label;
      this.media.decoding = 'async';
      this.media.draggable = false;
    } else if (this.media instanceof HTMLAudioElement) {
      this.media.setAttribute('aria-label', label || 'Inline audio');
      this.media.preload = 'metadata';
      this.media.loop = true;
    } else {
      this.media.setAttribute('aria-label', label || 'Inline video');
      this.media.muted = true;
      this.media.loop = true;
      this.media.playsInline = true;
      this.media.preload = 'metadata';
      this.media.poster = this.getAttribute('poster') || '';
    }
    const fit = this.getAttribute('fit') as MediaFit;
    this.media.style.objectFit = ({ crop: 'cover', fit: 'contain', fill: 'fill' } as const)[fit] || 'cover';
    this.media.style.objectPosition = this.getAttribute('position') || '50% 50%';
    this.syncPlayback();
    for (const attribute of ['width', 'height', 'radius', 'duration', 'easing', 'expanded-width', 'expanded-height']) {
      const value = this.getAttribute(attribute);
      if (value) {
        this.style.setProperty(`--artifact-${attribute}`, value);
        this.managedProperties.add(attribute);
      } else if (this.managedProperties.has(attribute)) {
        this.style.removeProperty(`--artifact-${attribute}`);
        this.managedProperties.delete(attribute);
      }
    }
  }

  /** Start media explicitly; browsers may require a user gesture for audio. */
  async play() {
    if (!(this.media instanceof HTMLMediaElement)) return;
    try { await this.media.play(); }
    catch (error) {
      this.dispatchEvent(new CustomEvent('artifact-playback-error', { bubbles: true, composed: true }));
      throw error;
    }
  }
  pause() { if (this.media instanceof HTMLMediaElement) this.media.pause(); }

  private syncPlayback() {
    const hoverPlayback = this.hasAttribute('play-on-hover');
    const shouldPlay = hoverPlayback ? this.hasAttribute('data-hover-active') : !this.hasAttribute('paused');
    if (this.media instanceof HTMLAudioElement) {
      if (hoverPlayback && shouldPlay && !this.motionQuery?.matches) {
        if (this.media.paused) void this.play().catch(() => {});
      } else if (hoverPlayback || this.hasAttribute('paused')) this.media.pause();
      return;
    }
    if (this.media instanceof HTMLVideoElement) {
      const playing = shouldPlay && !this.motionQuery?.matches;
      this.media.autoplay = playing && !hoverPlayback;
      if (playing) void this.media.play().catch(() => { /* Browser autoplay policies may block playback. */ });
      else this.media.pause();
      return;
    }
    if (this.media instanceof HTMLImageElement) {
      const frozen = this.getAttribute('kind') === 'gif' && (!shouldPlay || this.motionQuery?.matches);
      this.media.hidden = false;
      if (this.gifStill) this.gifStill.hidden = true;
      if (!frozen || !this.media.complete || !this.media.naturalWidth) return;
      // Draw a still frame without serializing the canvas, so remote GIFs also work.
      if (!this.gifStill) {
        this.gifStill = document.createElement('canvas');
        this.gifStill.setAttribute('role', 'img');
        this.shadowRoot!.append(this.gifStill);
      }
      this.gifStill.setAttribute('aria-label', this.media.alt || 'Inline GIF');
      const scale = Math.min(1, 1024 / this.media.naturalWidth);
      this.gifStill.width = Math.round(this.media.naturalWidth * scale);
      this.gifStill.height = Math.max(1, Math.round(this.media.naturalHeight * scale));
      this.gifStill.style.cssText = this.media.style.cssText;
      const context = this.gifStill.getContext('2d');
      if (context) {
        context.drawImage(this.media, 0, 0, this.gifStill.width, this.gifStill.height);
        this.gifStill.hidden = false;
        this.media.hidden = true;
      }
    }
  }

}

export function registerArtifactPill() {
  if (typeof customElements !== 'undefined' && !customElements.get('artifact-pill')) customElements.define('artifact-pill', ArtifactPillElement);
}
registerArtifactPill();

// Custom-element definitions cannot be replaced by React Fast Refresh. Reload
// when this module changes so the page uses the new class and observed attributes.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
