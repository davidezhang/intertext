/** A dependency-free inline image, GIF, or video. Import once to register <artifact-pill>. */
export type MediaFit = 'crop' | 'fit' | 'fill';
export type MediaKind = 'image' | 'gif' | 'video';

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
  :host([expanded]), :host([hover-expand]:hover), :host([hover-expand]:focus-visible) {
    width: var(--artifact-expanded-width, 4.2em); height: var(--artifact-expanded-height, 1.25em);
  }
  :host(:focus-visible) { outline: 2px solid var(--artifact-focus, #000); outline-offset: 4px; }
  img, video { display:block; width:100%; height:100%; object-fit:cover; object-position:50% 50%; pointer-events:none; }
  .error { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font:11px/1.2 system-ui,sans-serif; color:#fff; padding:4px; text-align:center; }
  [hidden] { display:none !important; }
  @media (prefers-reduced-motion: reduce) { :host { transition:none; } }
`;

// Importing in an SSR environment is safe. Registration happens in the browser bundle.
const BaseElement = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

export class ArtifactPillElement extends BaseElement {
  static observedAttributes = ['src', 'kind', 'alt', 'fit', 'position', 'poster', 'paused', 'width', 'height', 'radius', 'duration', 'easing', 'expanded-width', 'expanded-height'];
  private media?: HTMLImageElement | HTMLVideoElement;
  private fallback?: HTMLSpanElement;
  private motionQuery?: MediaQueryList;
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
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionQuery.addEventListener('change', this.onMotionChange);
    this.update();
  }

  disconnectedCallback() {
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    if (this.media instanceof HTMLVideoElement) this.media.pause();
  }

  attributeChangedCallback() { if (this.isConnected) this.update(); }

  private update() {
    const kind = this.getAttribute('kind') || 'image';
    const tag = kind === 'video' ? 'VIDEO' : 'IMG';
    if (!this.media || this.media.tagName !== tag) {
      this.media?.remove();
      this.fallback?.remove();
      this.media = document.createElement(tag.toLowerCase()) as HTMLImageElement | HTMLVideoElement;
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
    }
    const src = this.getAttribute('src') || '';
    if (this.media.getAttribute('src') !== src) {
      this.fallback!.hidden = true;
      this.media.setAttribute('src', src);
    }
    const label = this.getAttribute('alt') || '';
    if (this.media instanceof HTMLImageElement) {
      this.media.alt = label;
      this.media.decoding = 'async';
      this.media.draggable = false;
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
