/** A dependency-free inline image, GIF, video, or audio. Import once to register <artifact-pill>. */
import { AudioWaveform } from './audio-waveform.js';
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
  img, video { display:block; width:100%; height:100%; object-fit:cover; object-position:50% 50%; pointer-events:none; }
  :host([kind="audio"]) { background:var(--artifact-audio-background, #000); color:var(--artifact-audio-color, #fff); }
  @media (prefers-color-scheme: dark) { :host([kind="audio"]) { background:var(--artifact-audio-background, #fff); color:var(--artifact-audio-color, #000); } }
  audio { display:none; }
  .waveform { position:absolute; inset:18% 10%; width:80%; height:64%; pointer-events:none; }
  .waveform-bars { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:var(--waveform-gap, 2px); transition:gap 180ms ease-in-out; }
  /* CSS radii stay circular as width and height change independently. */
  .waveform-bars > span { display:block; flex:0 0 var(--waveform-bar-width, 2px); border-radius:999px; background:currentColor; transition:flex-basis 180ms ease-in-out; }
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
  static observedAttributes = ['src', 'kind', 'alt', 'fit', 'position', 'poster', 'paused', 'width', 'height', 'radius', 'duration', 'easing', 'expanded-width', 'expanded-height', 'hover-expand'];
  private media?: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  private waveform?: AudioWaveform;
  private fallback?: HTMLSpanElement;
  private motionQuery?: MediaQueryList;
  private hover?: ReturnType<typeof connectPillHover>;
  private managedProperties = new Set<string>();
  private onMotionChange = () => this.syncPlayback();

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
  }

  disconnectedCallback() {
    this.hover?.disconnect();
    this.hover = undefined;
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    if (this.media instanceof HTMLMediaElement) this.media.pause();
    this.waveform?.disconnect();
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (name === 'paused' && this.media instanceof HTMLAudioElement) {
      if (next !== null) this.media.pause();
      else if (previous !== null && this.isConnected) void this.play().catch(() => {});
    }
    if (name === 'hover-expand') this.hover?.update();
    else if (this.isConnected) this.update();
  }

  private update() {
    const kind = this.getAttribute('kind') || 'image';
    const tag = kind === 'audio' ? 'AUDIO' : kind === 'video' ? 'VIDEO' : 'IMG';
    if (!this.media || this.media.tagName !== tag) {
      if (this.media instanceof HTMLMediaElement) this.media.pause();
      this.waveform?.disconnect();
      this.waveform?.element.remove();
      this.waveform = undefined;
      this.media?.remove();
      this.fallback?.remove();
      this.media = document.createElement(tag.toLowerCase()) as HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
      this.media.setAttribute('part', 'media');
      const currentMedia = this.media;
      this.media.addEventListener('error', () => {
        if (this.media !== currentMedia) return;
        this.fallback!.hidden = false;
        this.dispatchEvent(new CustomEvent('artifact-error', { bubbles: true, composed: true, detail: { src: this.getAttribute('src') } }));
      });
      const loaded = () => { if (this.media === currentMedia) this.fallback!.hidden = true; };
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
      }
    }
    const src = this.getAttribute('src') || '';
    if (this.media.getAttribute('src') !== src) {
      this.fallback!.hidden = true;
      if (this.media instanceof HTMLAudioElement) this.media.pause();
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
      this.syncPlayback();
    }
    const fit = this.getAttribute('fit') as MediaFit;
    this.media.style.objectFit = ({ crop: 'cover', fit: 'contain', fill: 'fill' } as const)[fit] || 'cover';
    this.media.style.objectPosition = this.getAttribute('position') || '50% 50%';
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

  /** Audio starts only through an explicit play request or removal of paused. */
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
    if (!(this.media instanceof HTMLVideoElement)) return;
    const shouldPlay = !this.hasAttribute('paused') && !this.motionQuery?.matches;
    this.media.autoplay = shouldPlay;
    if (shouldPlay) void this.media.play().catch(() => { /* Browser autoplay policies may block playback. */ });
    else this.media.pause();
  }
}

export function registerArtifactPill() {
  if (typeof customElements !== 'undefined' && !customElements.get('artifact-pill')) customElements.define('artifact-pill', ArtifactPillElement);
}
registerArtifactPill();
