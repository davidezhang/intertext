import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Code2, Copy, Image as ImageIcon, Link2, Monitor, Play, Plus, RotateCcw, SlidersHorizontal, Smartphone, Sparkles, Type, RectangleHorizontal } from 'lucide-react';
import { InlineArtifactText, type ArtifactPillProps } from './lib/react';
import type { MediaFit, MediaKind } from './lib/artifact-pill';

type Media = { id: string; name: string; kind: MediaKind; src: string; poster?: string; alt: string };
const samples: Media[] = [
  { id: 'alpine', name: 'Alpine still', kind: 'image', src: '/media/alpine-lake.jpg', alt: 'An alpine lake surrounded by forest and mountains' },
  { id: 'petals', name: 'In bloom', kind: 'gif', src: '/media/flowers.gif', poster: '/media/flowers.jpg', alt: 'Pink flowers gently moving in the breeze' },
  { id: 'motion', name: 'A moving moment', kind: 'video', src: '/media/flowers.mp4', poster: '/media/flowers.jpg', alt: 'A close-up video of flowers in a garden' },
];
const defaultText = 'Designing coherent systems for new computing interfaces.';
const easingOptions = { Smooth: 'cubic-bezier(.22, 1, .36, 1)', Gentle: 'ease-in-out', Snappy: 'cubic-bezier(.16, 1, .3, 1)', Linear: 'linear' };

function RangeControl({ label, value, onChange, min, max, step = .05, unit = 'em' }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; unit?: string }) {
  return <label className="range-control"><span className="control-label">{label}<span className="number-value">{Number(value.toFixed(2))}<small>{unit}</small></span></span>
    <input type="range" aria-label={label} aria-valuetext={`${Number(value.toFixed(2))} ${unit}`} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ '--progress': `${(value - min) / (max - min) * 100}%` } as CSSProperties} />
  </label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button className="toggle-row" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span>{label}</span><span className="switch-track"><span /></span></button>;
}

function CodePanel({ artifact, text, position, isUpload }: { artifact: ArtifactPillProps; text: string; position: number; isUpload: boolean }) {
  const [tab, setTab] = useState<'react' | 'html'>('react');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const source = isUpload ? '/media/your-file' + (artifact.kind === 'video' ? '.mp4' : artifact.kind === 'gif' ? '.gif' : '.jpg') : artifact.src;
  const strings = { src: source, alt: artifact.alt, kind: artifact.kind, width: artifact.width, height: artifact.height, fit: artifact.fit, position: artifact.position, radius: artifact.radius, duration: artifact.duration, easing: artifact.easing, expandedWidth: artifact.expandedWidth, expandedHeight: artifact.expandedHeight, ...(artifact.poster ? { poster: artifact.poster } : {}) };
  const reactCode = `'use client';\nimport { useState } from 'react';\nimport { InlineArtifactText } from '@design-components/artifact-pill/react';\n\nexport default function Headline() {\n  const [position, setPosition] = useState(${position});\n  return (\n    <InlineArtifactText\n      text={${JSON.stringify(text)}}\n      position={position}\n      onPositionChange={setPosition}\n      style={{ fontSize: 'clamp(2rem, 6vw, 5rem)', lineHeight: 1.25 }}\n      artifact={{\n${Object.entries(strings).map(([k, v]) => `        ${k}: ${JSON.stringify(v)},`).join('\n')}\n        hoverExpand: ${Boolean(artifact.hoverExpand)},\n        paused: ${Boolean(artifact.paused)},\n      }}\n    />\n  );\n}`;
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const words = text.trim().split(/\s+/).filter(Boolean);
  const htmlAttrs = Object.entries(strings).map(([key, value]) => `    ${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${escape(String(value))}"`).join('\n');
  const htmlCode = `<script type="module" src="./artifact-pill.js"></script>\n\n<p style="font-size: clamp(2rem, 6vw, 5rem); line-height: 1.25">\n  ${escape(words.slice(0, position).join(' '))}\n  <artifact-pill\n${htmlAttrs}${artifact.hoverExpand ? '\n    hover-expand' : ''}${artifact.paused ? '\n    paused' : ''}\n  ></artifact-pill>\n  ${escape(words.slice(position).join(' '))}\n</p>`;
  const code = tab === 'react' ? reactCode : htmlCode;
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setCopyError(true); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = tab === 'react' ? 'Headline.tsx' : 'index.html'; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="code-panel">
    <div className="code-tabs"><div className="segmented"><button aria-pressed={tab === 'react'} onClick={() => setTab('react')}>React</button><button aria-pressed={tab === 'html'} onClick={() => setTab('html')}>HTML / any framework</button></div><button className="text-button" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy code'}</button></div>
    <pre tabIndex={0} aria-label="Component code"><code>{code}</code></pre>
    <p className="code-note">{tab === 'react' ? 'Install the local package using the README, then import the React wrapper. Drag placement is included.' : 'Copy dist/lib/artifact-pill.js beside this file. The native element works with HTML, Vue, Svelte, and more. Drag placement is provided by the React text wrapper.'}</p>
    {isUpload && <p className="code-note">Add your uploaded media to your project and replace the sample file path.</p>}
    {copyError && <p role="status" className="error-text">Clipboard unavailable. Select the code above or download the snippet.</p>}
    <div className="code-actions"><button className="primary-button" onClick={download}><ArrowDownToLine size={15} /> Download snippet</button></div>
  </div>;
}

type Panel = 'media' | 'text' | 'shape' | 'motion' | 'canvas' | 'export' | null;

function ControlSection({ name, title, icon, open, onToggle, children }: { name: Exclude<Panel, null>; title: string; icon: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className={`control-section ${open ? 'is-open' : ''}`}>
    <button className="section-toggle" id={`${name}-toggle`} aria-expanded={open} aria-controls={`${name}-controls`} onClick={onToggle}>
      {icon}<span>{title}</span><ChevronDown size={14} className="section-chevron" />
    </button>
    <div className="section-reveal" data-open={open} aria-hidden={!open} inert={!open}>
      <div className="section-clip"><div className="section-body" id={`${name}-controls`} role="region" aria-labelledby={`${name}-toggle`}>{children}</div></div>
    </div>
  </section>;
}

export default function App() {
  const [media, setMedia] = useState(samples[0]);
  const [width, setWidth] = useState(3.3);
  const [height, setHeight] = useState(.85);
  const [radius, setRadius] = useState(200);
  const [fit, setFit] = useState<MediaFit>('crop');
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [fontSize, setFontSize] = useState(100);
  const [duration, setDuration] = useState(650);
  const [easing, setEasing] = useState<keyof typeof easingOptions>('Smooth');
  const [hover, setHover] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loop, setLoop] = useState(false);
  const [paused, setPaused] = useState(false);
  const [text, setText] = useState(defaultText);
  const [position, setPosition] = useState(1);
  const [dark, setDark] = useState(true);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [panel, setPanel] = useState<Panel>('shape');
  const [focusMode, setFocusMode] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [urlKind, setUrlKind] = useState<MediaKind>('image');
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState<Media | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wordCount = (text.match(/\S+/gu) || []).length;

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches); sync();
    query.addEventListener('change', sync); return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (!loop || reducedMotion) return;
    const interval = setInterval(() => setExpanded(value => !value), duration + 750);
    return () => clearInterval(interval);
  }, [loop, duration, reducedMotion]);
  useEffect(() => () => { if (uploaded) URL.revokeObjectURL(uploaded.src); }, [uploaded]);
  useEffect(() => () => clearTimeout(previewTimer.current), []);
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPanel(null); setFocusMode(false); return; }
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]') || event.metaKey || event.ctrlKey || event.altKey) return;
      const next = ({ t: 'text', m: 'media', s: 'shape', a: 'motion', c: 'canvas', e: 'export' } as const)[event.key.toLowerCase() as 't'];
      if (next) { event.preventDefault(); setPanel(current => current === next ? null : next); setFocusMode(false); }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, []);

  const artifact: ArtifactPillProps = {
    src: media.src, kind: media.kind, alt: media.alt, poster: media.poster,
    width: `${width}em`, height: `${height}em`, radius: `${radius}px`, fit,
    position: `${focalX}% ${focalY}%`, duration: `${duration}ms`, easing: easingOptions[easing],
    hoverExpand: hover && !reducedMotion, expanded: expanded && !reducedMotion,
    expandedWidth: `${Math.min(7, width * 1.55).toFixed(2)}em`, expandedHeight: `${(height * 1.3).toFixed(2)}em`, paused,
    style: { '--artifact-focus': dark ? '#fff' : '#000' } as CSSProperties,
  };

  function animate() {
    clearTimeout(previewTimer.current); setExpanded(true);
    previewTimer.current = setTimeout(() => setExpanded(false), duration + 700);
  }
  function reset() {
    clearTimeout(previewTimer.current); setWidth(3.3); setHeight(.85); setRadius(200); setFit('crop'); setFocalX(50); setFocalY(50); setFontSize(100); setDuration(650); setEasing('Smooth'); setHover(false); setExpanded(false); setLoop(false); setPaused(false); setText(defaultText); setPosition(1); setMedia(samples[0]); setDark(true); setViewport('desktop'); setError('');
  }
  function uploadFile(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|gif|webp|avif)$|^video\/(mp4|webm|quicktime)$/.test(file.type)) { setError('Choose a JPG, PNG, GIF, WebP, AVIF, MP4, WebM, or MOV file.'); return; }
    const item: Media = { id: 'upload', name: file.name, kind: file.type === 'image/gif' ? 'gif' : file.type.startsWith('video/') ? 'video' : 'image', src: URL.createObjectURL(file), alt: file.name.replace(/\.[^.]+$/, '').replaceAll(/[-_]/g, ' ') };
    setUploaded(item); setMedia(item); setError('');
  }
  function loadUrl(event: React.FormEvent) {
    event.preventDefault();
    try {
      const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) throw Error();
      setMedia({ id: 'url', name: 'Linked media', kind: urlKind, src: parsed.href, alt: 'Custom inline media' }); setUrlOpen(false); setError('');
    } catch { setError('Enter a complete http or https media URL.'); }
  }
  function togglePanel(next: Panel) { setPanel(panel === next ? null : next); }

  return <div className={`studio ${dark ? 'theme-dark' : 'theme-light'} ${focusMode ? 'is-focused' : ''}`}>
    <main className="canvas" aria-label="Live component preview">
      <div className={`canvas-inner ${viewport}`}>
        <div className="composition" style={{ '--type-scale': fontSize / 100 } as CSSProperties}>
          <InlineArtifactText className="specimen" text={text} position={position} onPositionChange={setPosition} artifact={artifact} />
        </div>
      </div>
    </main>

    <aside className={`controls-sidebar ${focusMode ? 'is-collapsed' : ''}`} aria-label="Component controls" aria-hidden={focusMode} inert={focusMode}>
      <header className="sidebar-header"><span>Artifact pill</span><button className="icon-button" aria-label="Collapse controls" title="Collapse controls" onClick={() => setFocusMode(true)}><ChevronRight size={16} /></button></header>
      <div className="sidebar-sections">
        <ControlSection name="text" title="Text" icon={<Type size={15} />} open={panel === 'text'} onToggle={() => togglePanel('text')}>

            <label className="field-heading" htmlFor="preview-text">Text</label>
            <textarea id="preview-text" aria-label="Preview text" value={text} onChange={e => { setText(e.target.value); setPosition(Math.min(position, (e.target.value.match(/\S+/gu) || []).length)); }} />
            <RangeControl label="Type scale" value={fontSize} min={50} max={160} step={1} unit="%" onChange={setFontSize} />
            <div className="panel-rule" /><div className="position-control"><span>Pill position</span><div><button className="icon-button" aria-label="Move pill left" disabled={position === 0} onClick={() => setPosition(position - 1)}><ArrowLeft size={15} /></button><span>{position + 1} / {wordCount + 1}</span><button className="icon-button" aria-label="Move pill right" disabled={position >= wordCount} onClick={() => setPosition(position + 1)}><ArrowRight size={15} /></button></div></div>
            <p className="control-hint">Drag the pill between words. Or focus it and use ← →.</p>
        </ControlSection>
        <ControlSection name="media" title="Media" icon={<ImageIcon size={15} />} open={panel === 'media'} onToggle={() => togglePanel('media')}>

            <div className="media-grid">{samples.map(item => <button key={item.id} className={`media-card ${media.id === item.id ? 'selected' : ''}`} aria-pressed={media.id === item.id} onClick={() => { setMedia(item); setError(''); }}><div className="media-thumbnail"><img src={item.poster || item.src} alt="" /><span className="media-type">{item.kind.toUpperCase()}</span>{media.id === item.id && <span className="selected-mark"><Check size={12} /></span>}</div><span className="media-name">{item.name}</span></button>)}</div>
            <div className="media-actions"><button className="primary-button" onClick={() => upload.current?.click()}><Plus size={15} /> Upload media</button><button className="text-button" onClick={() => setUrlOpen(!urlOpen)}><Link2 size={13} /> From URL</button></div>
            {media.id === 'upload' && <p className="uploaded-file">{media.name}</p>}
            {urlOpen && <form className="url-form" onSubmit={loadUrl}><input aria-label="Media URL" type="url" required placeholder="https://site.com/media.jpg" value={url} onChange={e => setUrl(e.target.value)} /><select aria-label="URL media type" value={urlKind} onChange={e => setUrlKind(e.target.value as MediaKind)}><option value="image">Image</option><option value="gif">GIF</option><option value="video">Video</option></select><button className="primary-button" type="submit">Add <ArrowRight size={13} /></button></form>}
            <label className="alt-field">Media description<input aria-label="Media description" value={media.alt} onChange={e => setMedia({ ...media, alt: e.target.value })} /></label>
            {media.kind === 'video' && <Toggle label="Play video" checked={!paused} onChange={v => setPaused(!v)} />}
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="media-credit"><a href="https://unsplash.com/photos/Eo59O2GdipY" target="_blank" rel="noreferrer">Photo: Joaquim ↗</a></div>
        </ControlSection>
        <ControlSection name="shape" title="Shape" icon={<RectangleHorizontal size={15} />} open={panel === 'shape'} onToggle={() => togglePanel('shape')}>

            <div className="preset-row">{[{ label: 'Compact', w: 1.4, h: .8 }, { label: 'Classic', w: 3.3, h: .85 }, { label: 'Wide', w: 4.5, h: .85 }].map(p => <button key={p.label} aria-pressed={width === p.w && height === p.h} onClick={() => { setWidth(p.w); setHeight(p.h); }}>{p.label}</button>)}</div>
            <RangeControl label="Width" value={width} min={.5} max={6} onChange={setWidth} />
            <RangeControl label="Height" value={height} min={.35} max={2.5} onChange={setHeight} />
            <RangeControl label="Radius" value={radius} min={0} max={200} step={1} unit="px" onChange={setRadius} />
            <div className="panel-rule" />
            <span className="field-heading">Media fit</span><div className="segmented fit-controls" role="group" aria-label="Media fit">{(['crop', 'fit', 'fill'] as const).map(option => <button key={option} aria-pressed={fit === option} onClick={() => setFit(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}</div>
            <p className="control-hint">{fit === 'crop' ? 'Fill the shape. Crop the edges.' : fit === 'fit' ? 'Keep the entire image in view.' : 'Stretch the media to fill the shape.'}</p>
            <details className="focal-controls"><summary>Focal point <Plus size={13} /></summary><RangeControl label="Horizontal" value={focalX} min={0} max={100} step={1} unit="%" onChange={setFocalX} /><RangeControl label="Vertical" value={focalY} min={0} max={100} step={1} unit="%" onChange={setFocalY} /></details>
        </ControlSection>
        <ControlSection name="motion" title="Motion" icon={<Sparkles size={15} />} open={panel === 'motion'} onToggle={() => togglePanel('motion')}>

            <RangeControl label="Duration" value={duration} min={100} max={2000} step={50} unit="ms" onChange={setDuration} />
            <label className="select-row"><span>Easing</span><select aria-label="Animation easing" value={easing} onChange={e => setEasing(e.target.value as keyof typeof easingOptions)}>{Object.keys(easingOptions).map(key => <option key={key}>{key}</option>)}</select></label>
            <div className="panel-rule" />
            <Toggle label="Expand on hover" checked={hover} onChange={setHover} />
            <Toggle label="Loop animation" checked={loop} onChange={value => { setLoop(value); setExpanded(false); }} />
            <button className="primary-button full-width" onClick={animate} disabled={reducedMotion || loop}><Play size={13} fill="currentColor" /> Play animation <span>↗</span></button>
            <p className="control-hint">{reducedMotion ? 'Reduced motion is enabled on your device.' : 'Changes width and height with text reflow.'}</p>
        </ControlSection>
        <ControlSection name="canvas" title="Canvas" icon={<Monitor size={15} />} open={panel === 'canvas'} onToggle={() => togglePanel('canvas')}>
          <span className="field-heading">Background</span>
          <div className="segmented" role="group" aria-label="Canvas background"><button aria-pressed={dark} onClick={() => setDark(true)}>Dark</button><button aria-pressed={!dark} onClick={() => setDark(false)}>Light</button></div>
          <span className="field-heading spaced-field">Preview width</span>
          <div className="segmented" role="group" aria-label="Preview width"><button aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}><Monitor size={13} /> Fluid</button><button aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}><Smartphone size={13} /> 375 px</button></div>
        </ControlSection>
        <ControlSection name="export" title="Export" icon={<Code2 size={15} />} open={panel === 'export'} onToggle={() => togglePanel('export')}>
          <CodePanel artifact={artifact} text={text} position={position} isUpload={media.id === 'upload'} />
        </ControlSection>
      </div>
      <footer className="sidebar-footer"><button className="text-button" onClick={reset}><RotateCcw size={13} /> Reset settings</button></footer>
    </aside>
    <button className={`restore-controls ${focusMode ? 'is-visible' : ''}`} aria-label="Show controls" aria-hidden={!focusMode} inert={!focusMode} onClick={() => setFocusMode(false)}><SlidersHorizontal size={15} /><span>Controls</span></button>
    <input ref={upload} className="visually-hidden" type="file" aria-label="Upload media file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm,video/quicktime" onChange={e => { uploadFile(e.target.files?.[0]); e.target.value = ''; }} />
  </div>;
}
