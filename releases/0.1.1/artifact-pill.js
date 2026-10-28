/*! Intertext 0.1.1
MIT License

Copyright (c) 2026 Davide Zhang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
function u(r, t = 64) {
  const e = r[0]?.length || 0, i = Array.from({ length: t }, (o, s) => {
    const n = Math.floor(s * e / t), h = Math.min(e, Math.max(n + 1, Math.floor((s + 1) * e / t)));
    let d = 0;
    for (const m of r) for (let l = n; l < h; l++) d = Math.max(d, Math.abs(m[l]));
    return d;
  }), a = Math.max(...i, 1e-3);
  return i.map((o) => o / a);
}
function f(r, t) {
  const e = Math.max(4, Math.min(32, Math.floor(r / 32) * 4));
  return t !== void 0 && e > t && r < e * 8 + 8 ? t : e;
}
function p(r, t, e = 1) {
  const i = Math.max(2, Math.floor(r * e / t)), a = Math.max(1, Math.floor(i / 2));
  return { barWidth: a / e, gap: (i - a) / e };
}
function g(r, t, e) {
  const i = 1 - Math.exp(-Math.max(0, e) / 70);
  return r + (t - r) * i;
}
class v {
  element = document.createElement("div");
  request;
  resize;
  envelope;
  count = 32;
  width = 0;
  progress = 0;
  layer;
  outgoing;
  fades = [];
  settleTimer;
  constructor() {
    this.element.setAttribute("aria-hidden", "true"), this.element.classList.add("waveform"), typeof ResizeObserver < "u" && (this.resize = new ResizeObserver((t) => {
      const e = t[0]?.contentRect.width;
      if (!e) return;
      const i = !this.width;
      if (this.width = e, this.cancelTransition(), i || this.reducedMotion()) {
        this.settle(!1);
        return;
      }
      this.element.dataset.resizing = "", this.layer && this.setSpacing(this.layer, !0), this.settleTimer = setTimeout(() => this.settle(!0), 120);
    }));
  }
  reducedMotion() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  cancelTransition() {
    clearTimeout(this.settleTimer), this.fades.forEach((t) => t.cancel()), this.fades = [], this.outgoing?.remove(), this.outgoing = void 0;
  }
  setSpacing(t, e = !1) {
    const i = p(this.width || 256, this.count, window.devicePixelRatio || 1);
    t.style.setProperty("--waveform-bar-width", e ? `${50 / this.count}%` : `${i.barWidth}px`), t.style.setProperty("--waveform-gap", e ? `${50 / this.count}%` : `${i.gap}px`);
  }
  settle(t) {
    delete this.element.dataset.resizing;
    const e = f(this.width, this.count);
    e !== this.count ? (this.count = e, this.render(t)) : this.layer && this.setSpacing(this.layer);
  }
  async load(t) {
    this.request?.abort(), this.cancelTransition(), this.envelope = void 0, this.progress = 0, this.layer = void 0, delete this.element.dataset.resizing, this.resize?.observe(this.element);
    const e = this.request = new AbortController();
    this.element.replaceChildren(), this.element.dataset.state = "loading";
    let i;
    try {
      const a = await fetch(t, { signal: e.signal });
      if (!a.ok) throw new Error("Audio unavailable");
      const o = await a.arrayBuffer();
      if (e.signal.aborted) return;
      i = new AudioContext();
      const s = await i.decodeAudioData(o);
      if (e.signal.aborted) return;
      this.envelope = new Float32Array(u(Array.from({ length: s.numberOfChannels }, (n, h) => s.getChannelData(h)), 512)), this.render(), this.element.dataset.state = "ready";
    } catch {
      e.signal.aborted || (this.element.dataset.state = "unavailable");
    } finally {
      i && i.close().catch(() => {
      });
    }
  }
  setProgress(t, e) {
    this.progress = Number.isFinite(t) && Number.isFinite(e) && e > 0 ? Math.max(0, Math.min(1, t / e)) : 0, this.layer && this.paintProgress(this.layer), this.outgoing && this.paintProgress(this.outgoing);
  }
  paintProgress(t) {
    const e = t.children.length;
    Array.from(t.children).forEach((i, a) => {
      const o = `${Math.max(0, Math.min(1, this.progress * e - a)) * 100}%`, s = i.style;
      s.getPropertyValue("--waveform-played") !== o && s.setProperty("--waveform-played", o);
    });
  }
  render(t = !1) {
    if (!this.envelope) return;
    const e = u([this.envelope], this.count), i = document.createElement("div");
    i.className = "waveform-bars", this.setSpacing(i, this.element.hasAttribute("data-resizing")), e.forEach((o) => {
      const s = document.createElement("span");
      s.style.height = `${Math.max(2, Math.pow(o, 2.6) * 72) / 80 * 100}%`, i.append(s);
    }), this.paintProgress(i);
    const a = this.layer;
    if (this.layer = i, t && a && typeof i.animate == "function" && !this.reducedMotion()) {
      this.outgoing = a, this.element.append(i);
      const o = { duration: 180, easing: "ease-in-out" }, s = a.animate([{ opacity: 1 }, { opacity: 0 }], o), n = i.animate([{ opacity: 0 }, { opacity: 1 }], o);
      this.fades = [s, n], s.finished.then(() => {
        a.remove(), this.outgoing === a && (this.outgoing = void 0, this.fades = []);
      }).catch(() => {
      });
    } else this.element.replaceChildren(i);
  }
  disconnect() {
    this.request?.abort(), this.resize?.disconnect(), this.cancelTransition();
  }
}
const c = /* @__PURE__ */ new WeakMap();
class b {
  constructor(t) {
    this.document = t, t.addEventListener("pointermove", this.move, !0), t.addEventListener("pointerdown", this.down, !0), t.addEventListener("pointerout", this.out, !0), t.addEventListener("pointercancel", this.reset, !0), t.addEventListener("scroll", this.layoutChanged, !0), t.addEventListener("visibilitychange", this.reset), t.defaultView?.addEventListener("blur", this.reset), t.defaultView?.addEventListener("resize", this.layoutChanged);
  }
  document;
  elements = /* @__PURE__ */ new Set();
  active;
  lastPoint;
  release(t) {
    t && this.active?.element !== t || (this.active?.element.removeAttribute("data-hover-active"), this.active = void 0);
  }
  reset = () => {
    this.release(), this.lastPoint = void 0;
  };
  // Scroll/resize can themselves synthesize pointer events at unchanged coordinates.
  layoutChanged = () => this.release();
  move = (t) => {
    if (t.pointerType === "touch" || t.isPrimary === !1 || t.buttons) return;
    const { clientX: e, clientY: i, pointerId: a } = t;
    if (this.lastPoint?.x === e && this.lastPoint.y === i && this.lastPoint.id === a) return;
    if (this.lastPoint = { x: e, y: i, id: a }, this.active) {
      const { element: n, origin: h } = this.active, d = n.getBoundingClientRect();
      if (e >= Math.min(h.left, d.left) && e <= Math.max(h.right, d.right) && i >= Math.min(h.top, d.top) && i <= Math.max(h.bottom, d.bottom)) return;
    }
    const o = t.composedPath().find((n) => this.elements.has(n) && (n.hasAttribute("hover-expand") || n.hasAttribute("play-on-hover"))), s = o?.getBoundingClientRect();
    this.release(), o && s && (this.active = { element: o, origin: s }, o.setAttribute("data-hover-active", ""));
  };
  down = (t) => {
    (t.pointerType === "touch" || this.active && !t.composedPath().includes(this.active.element)) && this.release();
  };
  out = (t) => {
    t.relatedTarget || this.reset();
  };
  dispose() {
    this.reset();
    const t = this.document;
    t.removeEventListener("pointermove", this.move, !0), t.removeEventListener("pointerdown", this.down, !0), t.removeEventListener("pointerout", this.out, !0), t.removeEventListener("pointercancel", this.reset, !0), t.removeEventListener("scroll", this.layoutChanged, !0), t.removeEventListener("visibilitychange", this.reset), t.defaultView?.removeEventListener("blur", this.reset), t.defaultView?.removeEventListener("resize", this.layoutChanged), c.delete(t);
  }
}
function y(r) {
  const t = r.ownerDocument;
  let e = c.get(t);
  e || (e = new b(t), c.set(t, e)), e.elements.add(r);
  const i = e;
  return {
    update: () => {
      !r.hasAttribute("hover-expand") && !r.hasAttribute("play-on-hover") && i.release(r);
    },
    disconnect: () => {
      i.release(r), i.elements.delete(r), i.elements.size || i.dispose();
    }
  };
}
const w = `
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
  /* An explicit collapse (data-hover-dismissed) wins over the hover or focus preview until that preview ends. */
  :host([expanded]), :host([loop][data-loop-expanded]),
  :host([hover-expand][data-hover-active]:not([data-hover-dismissed])), :host([hover-expand]:not([data-hover-dismissed]):focus-visible) {
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
`, A = typeof HTMLElement > "u" ? class {
} : HTMLElement;
class x extends A {
  static observedAttributes = ["src", "kind", "alt", "fit", "position", "poster", "paused", "width", "height", "radius", "duration", "easing", "expanded", "expanded-width", "expanded-height", "hover-expand", "play-on-hover", "loop", "role", "data-hover-active"];
  media;
  waveform;
  fallback;
  gifStill;
  motionQuery;
  hover;
  managedProperties = /* @__PURE__ */ new Set();
  ariaDefaults = /* @__PURE__ */ new Map();
  toggles = !1;
  loopTimer;
  audioFrame = 0;
  displayedAudioTime;
  observedAudioTime;
  audioFrameTime;
  onMotionChange = () => {
    this.syncPlayback(), this.syncAudioProgress(!0), this.syncLoop();
  };
  // Touch has no hover, so activation pins `expanded` like a disclosure button.
  toggleExpanded = (t) => {
    if (t.defaultPrevented) return;
    const e = !this.hasAttribute("expanded");
    this.toggleAttribute("data-hover-dismissed", !e && (this.hasAttribute("data-hover-active") || this.matches(":focus"))), this.toggleAttribute("expanded", e);
  };
  toggleFromKeyboard = (t) => {
    !this.toggles || t.defaultPrevented || t.target !== this || t.repeat || t.altKey || t.ctrlKey || t.metaKey || t.key !== "Enter" && t.key !== " " || (t.preventDefault(), this.click());
  };
  endDismissal = () => this.removeAttribute("data-hover-dismissed");
  syncAudioProgress = (t = !1) => {
    if (this.audioFrame && cancelAnimationFrame(this.audioFrame), this.audioFrame = 0, !(this.media instanceof HTMLAudioElement) || !this.waveform) return;
    const e = this.media.currentTime, i = performance.now(), a = this.isConnected && !this.media.paused && !this.media.ended && !this.motionQuery?.matches, o = this.observedAudioTime !== void 0 && (e < this.observedAudioTime || Math.abs(e - this.observedAudioTime) > 0.5);
    this.displayedAudioTime = t || !a || o || this.displayedAudioTime === void 0 ? e : g(this.displayedAudioTime, e, i - (this.audioFrameTime ?? i)), this.observedAudioTime = e, this.audioFrameTime = i, this.waveform.setProgress(this.displayedAudioTime, this.media.duration), a && (this.audioFrame = requestAnimationFrame(() => this.syncAudioProgress()));
  };
  constructor() {
    super();
    const t = this.attachShadow({ mode: "open" }), e = document.createElement("style");
    e.textContent = w, t.append(e), this.addEventListener("keydown", this.toggleFromKeyboard), this.addEventListener("focusout", this.endDismissal);
  }
  connectedCallback() {
    this.hover = y(this), this.motionQuery = matchMedia("(prefers-reduced-motion: reduce)"), this.motionQuery.addEventListener("change", this.onMotionChange);
    const t = this.waveform;
    this.update(), this.syncToggle(), this.syncLoop(), t && this.waveform && this.waveform.load(this.getAttribute("src") || ""), this.syncAudioProgress();
  }
  disconnectedCallback() {
    this.hover?.disconnect(), this.hover = void 0, this.motionQuery?.removeEventListener("change", this.onMotionChange), this.syncLoop(), this.media instanceof HTMLMediaElement && this.media.pause(), this.waveform?.disconnect(), this.audioFrame && cancelAnimationFrame(this.audioFrame), this.audioFrame = 0;
  }
  attributeChangedCallback(t, e, i) {
    if (t === "data-hover-active") {
      i === null && this.endDismissal(), this.isConnected && this.hasAttribute("play-on-hover") && this.syncPlayback();
      return;
    }
    (t === "hover-expand" || t === "play-on-hover") && this.hover?.update(), this.isConnected && (this.syncToggle(), t === "loop" && this.syncLoop(), !(t === "expanded" || t === "role" || t === "loop") && (this.update(), t === "paused" && e !== null && i === null && !this.hasAttribute("play-on-hover") && this.media instanceof HTMLAudioElement && this.play().catch(() => {
    })));
  }
  update() {
    const t = this.getAttribute("kind") || "image", e = t === "audio" ? "AUDIO" : t === "video" ? "VIDEO" : "IMG";
    if (!this.media || this.media.tagName !== e) {
      this.media instanceof HTMLMediaElement && this.media.pause(), this.audioFrame && cancelAnimationFrame(this.audioFrame), this.audioFrame = 0, this.waveform?.disconnect(), this.waveform?.element.remove(), this.waveform = void 0, this.gifStill?.remove(), this.gifStill = void 0, this.media?.remove(), this.fallback?.remove(), this.media = document.createElement(e.toLowerCase()), this.media.setAttribute("part", "media");
      const s = this.media;
      this.media.addEventListener("error", () => {
        this.media === s && (this.fallback.hidden = !1, this.gifStill && (this.gifStill.hidden = !0), this.dispatchEvent(new CustomEvent("artifact-error", { bubbles: !0, composed: !0, detail: { src: this.getAttribute("src") } })));
      });
      const n = () => {
        this.media === s && (this.fallback.hidden = !0, this.syncPlayback());
      };
      if (this.media.addEventListener("load", n), this.media.addEventListener("loadeddata", n), this.fallback = document.createElement("span"), this.fallback.className = "error", this.fallback.textContent = "Media unavailable", this.fallback.hidden = !0, this.shadowRoot.append(this.media, this.fallback), t === "audio") {
        this.waveform = new v(), this.shadowRoot.append(this.waveform.element);
        for (const h of ["playing", "pause", "timeupdate", "seeking", "seeked", "durationchange", "ended", "emptied"])
          s.addEventListener(h, () => {
            this.media === s && this.syncAudioProgress(h !== "timeupdate");
          });
      }
    }
    const i = this.getAttribute("src") || "";
    this.media.getAttribute("src") !== i && (this.fallback.hidden = !0, this.media instanceof HTMLAudioElement && this.media.pause(), this.displayedAudioTime = this.observedAudioTime = this.audioFrameTime = void 0, this.media.setAttribute("src", i), this.waveform && this.waveform.load(i));
    const a = this.getAttribute("alt") || "";
    this.media instanceof HTMLImageElement ? (this.media.alt = a, this.media.decoding = "async", this.media.draggable = !1) : this.media instanceof HTMLAudioElement ? (this.media.setAttribute("aria-label", a || "Inline audio"), this.media.preload = "metadata", this.media.loop = !0) : (this.media.setAttribute("aria-label", a || "Inline video"), this.media.muted = !0, this.media.loop = !0, this.media.playsInline = !0, this.media.preload = "metadata", this.media.poster = this.getAttribute("poster") || "");
    const o = this.getAttribute("fit");
    this.media.style.objectFit = { crop: "cover", fit: "contain", fill: "fill" }[o] || "cover", this.media.style.objectPosition = this.getAttribute("position") || "50% 50%", this.syncPlayback();
    for (const s of ["width", "height", "radius", "duration", "easing", "expanded-width", "expanded-height"]) {
      const n = this.getAttribute(s);
      n ? (this.style.setProperty(`--artifact-${s}`, n), this.managedProperties.add(s)) : this.managedProperties.has(s) && (this.style.removeProperty(`--artifact-${s}`), this.managedProperties.delete(s));
    }
  }
  /** Start media explicitly; browsers may require a user gesture for audio. */
  async play() {
    if (this.media instanceof HTMLMediaElement)
      try {
        await this.media.play();
      } catch (t) {
        throw this.dispatchEvent(new CustomEvent("artifact-playback-error", { bubbles: !0, composed: !0 })), t;
      }
  }
  pause() {
    this.media instanceof HTMLMediaElement && this.media.pause();
  }
  /** Hover expansion doubles as a button unless the page gives the pill its own role or encloses it in a control. */
  syncToggle() {
    const t = this.getAttribute("role");
    this.toggles = this.hasAttribute("hover-expand") && (t === null || t === this.ariaDefaults.get("role")) && !this.parentElement?.closest("a[href], button, label, summary"), this.setAriaDefault("role", this.toggles ? "button" : null), this.setAriaDefault("aria-label", this.toggles && this.getAttribute("alt") || null), this.setAriaDefault("aria-expanded", this.toggles ? String(this.hasAttribute("expanded")) : null), this.toggles ? this.addEventListener("click", this.toggleExpanded) : (this.removeEventListener("click", this.toggleExpanded), this.endDismissal());
  }
  /** Never replace or remove a value the page supplied. */
  setAriaDefault(t, e) {
    const i = this.getAttribute(t);
    if (i !== null && i !== this.ariaDefaults.get(t)) {
      this.ariaDefaults.delete(t);
      return;
    }
    e === null ? (this.ariaDefaults.delete(t), i !== null && this.removeAttribute(t)) : i !== e && (this.ariaDefaults.set(t, e), this.setAttribute(t, e));
  }
  /** Alternate sizes like the studio's loop preview. Reduced motion keeps the resting size. */
  syncLoop() {
    if (!!(this.isConnected && this.motionQuery && !this.motionQuery.matches && this.hasAttribute("loop"))) {
      this.loopTimer === void 0 && this.scheduleLoop();
      return;
    }
    clearTimeout(this.loopTimer), this.loopTimer = void 0, this.removeAttribute("data-loop-expanded");
  }
  scheduleLoop() {
    const t = parseFloat(getComputedStyle(this).transitionDuration) || 0;
    this.loopTimer = setTimeout(() => {
      this.toggleAttribute("data-loop-expanded"), this.scheduleLoop();
    }, t * 1e3 + 750);
  }
  syncPlayback() {
    const t = this.hasAttribute("play-on-hover"), e = t ? this.hasAttribute("data-hover-active") : !this.hasAttribute("paused");
    if (this.media instanceof HTMLAudioElement) {
      t && e && !this.motionQuery?.matches ? this.media.paused && this.play().catch(() => {
      }) : (t || this.hasAttribute("paused")) && this.media.pause();
      return;
    }
    if (this.media instanceof HTMLVideoElement) {
      const i = e && !this.motionQuery?.matches;
      this.media.autoplay = i && !t, i ? this.media.play().catch(() => {
      }) : this.media.pause();
      return;
    }
    if (this.media instanceof HTMLImageElement) {
      const i = this.getAttribute("kind") === "gif" && (!e || this.motionQuery?.matches);
      if (this.media.hidden = !1, this.gifStill && (this.gifStill.hidden = !0), !i || !this.media.complete || !this.media.naturalWidth) return;
      this.gifStill || (this.gifStill = document.createElement("canvas"), this.gifStill.setAttribute("role", "img"), this.shadowRoot.append(this.gifStill)), this.gifStill.setAttribute("aria-label", this.media.alt || "Inline GIF");
      const a = Math.min(1, 1024 / this.media.naturalWidth);
      this.gifStill.width = Math.round(this.media.naturalWidth * a), this.gifStill.height = Math.max(1, Math.round(this.media.naturalHeight * a)), this.gifStill.style.cssText = this.media.style.cssText;
      const o = this.gifStill.getContext("2d");
      o && (o.drawImage(this.media, 0, 0, this.gifStill.width, this.gifStill.height), this.gifStill.hidden = !1, this.media.hidden = !0);
    }
  }
}
function E() {
  typeof customElements < "u" && !customElements.get("artifact-pill") && customElements.define("artifact-pill", x);
}
E();
export {
  x as ArtifactPillElement,
  E as registerArtifactPill
};
