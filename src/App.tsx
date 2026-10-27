import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, X, Trash2, Code2, Image as ImageIcon, Link2, Monitor, Play, Plus, RotateCcw, Smartphone, Sparkles, Type, RectangleHorizontal } from 'lucide-react';
import { ArtifactPill, InlineArtifactsText } from './lib/react';
import type { MediaKind } from './lib/artifact-pill';
import { Slider, Toggle, Folder } from 'dialkit';
import { DialTransition } from './DialTransition';
import { DialFontPicker } from './DialFontPicker';
import { studioFonts } from './studio-fonts';
import { compileTransition } from './studio-motion';
import { artifactProps, createPill, defaultText, randomPosition, samples, type Media, type PillConfig } from './studio-model';
import { studioSounds } from './studio-sound';
import { IntegrationPanel } from './IntegrationPanel';

function ToolbarIcon({ name }: { name: 'add' | 'settings' }) {
  // Native 18px coordinates give both icons matching stroke width and edge alignment.
  return <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={name === 'add' ? 'M3 9h12M9 3v12' : 'M2 4h14M2 9h14M2 14h14M6 2v4M12 7v4M6 12v4'} />
  </svg>;
}

function RangeControl({ label, value, onChange, min, max, step = .05, unit = 'em' }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; unit?: string }) {
  return <Slider label={label} value={value} onChange={next => { if (next !== value) studioSounds.play('tick'); onChange(next); }} min={min} max={max} step={step} unit={unit} />;
}

type Panel = 'media' | 'text' | 'shape' | 'motion' | 'canvas' | 'export' | null;

function ControlSection({ name, title, icon, open, onToggle, children }: { name: Exclude<Panel, null>; title: string; icon: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className={`control-section ${open ? 'is-open' : ''}`}>
    <button className="section-toggle" data-ui-sound="thump" id={`${name}-toggle`} aria-expanded={open} aria-controls={`${name}-controls`} onClick={onToggle}>
      {icon}<span>{title}</span><ChevronDown size={14} className="section-chevron" />
    </button>
    <div className="section-reveal" data-open={open} aria-hidden={!open} inert={!open}>
      <div className="section-clip"><div className="section-body" id={`${name}-controls`} role="region" aria-labelledby={`${name}-toggle`}>{children}</div></div>
    </div>
  </section>;
}

function PillSettings({ pill, onChange, onUpload, onAnimate, reducedMotion, wordCount }: {
  pill: PillConfig; onChange: (patch: Partial<PillConfig>) => void; onUpload: () => void;
  onAnimate: () => void; reducedMotion: boolean; wordCount: number;
}) {
  const { media, width, height, radius, fit, focalX, focalY, hover, loop, paused } = pill;
  const [panel, setPanel] = useState<Panel>('shape');
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [urlKind, setUrlKind] = useState<MediaKind>('image');
  const [error, setError] = useState('');
  const setMedia = (media: Media) => onChange({ media, paused: media.kind === 'audio', playOnHover: false });
  const setWidth = (width: number) => onChange({ width });
  const setHeight = (height: number) => onChange({ height });
  const setRadius = (radius: number) => onChange({ radius });
  const setFit = (fit: PillConfig['fit']) => onChange({ fit });
  const setFocalX = (focalX: number) => onChange({ focalX });
  const setFocalY = (focalY: number) => onChange({ focalY });
  const setHover = (hover: boolean) => onChange({ hover });
  const setPaused = (paused: boolean) => onChange({ paused, playOnHover: false });
  const animate = onAnimate;
  function togglePanel(next: Panel) { setPanel(panel === next ? null : next); }
  function loadUrl(event: React.FormEvent) {
    event.preventDefault();
    try {
      const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) throw Error();
      setMedia({ id: 'url', name: 'Linked media', kind: urlKind, src: parsed.href, alt: 'Custom inline media' }); setUrlOpen(false); setError('');
    } catch { setError('Enter a complete http or https media URL.'); }
  }
  return <>
    <div className="pill-placement"><div className="position-control"><span>Position</span><div><button className="icon-button" aria-label="Move pill left" disabled={pill.position === 0} onClick={() => onChange({ position: pill.position - 1 })}><ArrowLeft size={15} /></button><span>{pill.position + 1} / {wordCount + 1}</span><button className="icon-button" aria-label="Move pill right" disabled={pill.position >= wordCount} onClick={() => onChange({ position: pill.position + 1 })}><ArrowRight size={15} /></button></div></div></div>
        <ControlSection name="media" title="Media" icon={<ImageIcon size={15} />} open={panel === 'media'} onToggle={() => togglePanel('media')}>

            <div className="media-grid">{samples.map(item => <button key={item.id} className={`media-card ${media.id === item.id ? 'selected' : ''}`} aria-pressed={media.id === item.id} onClick={() => { setMedia(item); setError(''); }}><div className="media-thumbnail"><>{item.kind === 'audio' ? <ArtifactPill src={item.src} kind="audio" alt="" paused width="100%" height="100%" radius="0px" /> : <img src={item.poster || item.src} alt="" />}</><span className="media-type">{item.kind.toUpperCase()}</span>{media.id === item.id && <span className="selected-mark"><Check size={12} /></span>}</div><span className="media-name">{item.name}</span></button>)}</div>
            <div className="media-actions"><button className="primary-button" onClick={onUpload}><Plus size={15} /> Upload media</button><button className="text-button" onClick={() => setUrlOpen(!urlOpen)}><Link2 size={13} /> From URL</button></div>
            {media.id === 'upload' && <p className="uploaded-file">{media.name}</p>}
            {urlOpen && <form className="url-form" onSubmit={loadUrl}><input aria-label="Media URL" type="url" required placeholder="https://site.com/media.jpg" value={url} onChange={e => setUrl(e.target.value)} /><select aria-label="URL media type" value={urlKind} onChange={e => setUrlKind(e.target.value as MediaKind)}><option value="image">Image</option><option value="gif">GIF</option><option value="video">Video</option><option value="audio">Audio</option></select><button className="primary-button" type="submit">Add <ArrowRight size={13} /></button></form>}
            <div className="media-fields">
            <label className="alt-field">Media description<input aria-label="Media description" value={media.alt} onChange={e => onChange({ media: { ...media, alt: e.target.value } })} /></label>
            {media.kind !== 'image' && <div className="dial-stack">
              <Toggle label={`Play ${media.kind === 'gif' ? 'GIF' : media.kind}`} checked={!paused} onChange={v => setPaused(!v)} />
              <Toggle label="Play on hover" checked={pill.playOnHover} onChange={playOnHover => onChange({ playOnHover, paused: true })} />
            </div>}
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
            {media.credit && <div className="media-credit"><a href={media.credit.url} target="_blank" rel="noreferrer">{media.credit.name} ↗</a></div>}
        </ControlSection>
        <ControlSection name="shape" title="Shape" icon={<RectangleHorizontal size={15} />} open={panel === 'shape'} onToggle={() => togglePanel('shape')}>

            <div className="preset-row">{[{ label: 'Compact', w: 1.4, h: .8 }, { label: 'Classic', w: 3.3, h: .85 }, { label: 'Wide', w: 4.5, h: .85 }].map(p => <button key={p.label} aria-pressed={width === p.w && height === p.h} onClick={() => { onChange({ width: p.w, height: p.h }); }}>{p.label}</button>)}</div>
            <div className="dial-stack shape-dials">
              <RangeControl label="Width" value={width} min={.5} max={6} onChange={setWidth} />
              <RangeControl label="Height" value={height} min={.35} max={2.5} onChange={setHeight} />
              <RangeControl label="Radius" value={radius} min={0} max={200} step={1} unit="px" onChange={setRadius} />
            </div>
            <div className="panel-rule" />
            {media.kind !== 'audio' && <><span className="field-heading">Media fit</span><div className="segmented fit-controls" role="group" aria-label="Media fit">{(['crop', 'fit', 'fill'] as const).map(option => <button key={option} aria-pressed={fit === option} onClick={() => setFit(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}</div>
            <p className="control-hint">{fit === 'crop' ? 'Fill the shape. Crop the edges.' : fit === 'fit' ? 'Keep the entire image in view.' : 'Stretch the media to fill the shape.'}</p>
            <div className="focal-controls"><Folder title="Focal point" defaultOpen={false}><div className="dial-stack"><RangeControl label="Horizontal" value={focalX} min={0} max={100} step={1} unit="%" onChange={setFocalX} /><RangeControl label="Vertical" value={focalY} min={0} max={100} step={1} unit="%" onChange={setFocalY} /></div></Folder></div></>}
        </ControlSection>
        <ControlSection name="motion" title="Motion" icon={<Sparkles size={15} />} open={panel === 'motion'} onToggle={() => togglePanel('motion')}>

            <span className="field-heading">Starting size</span>
            <div className="dial-stack">
              <RangeControl label="Current width" value={width} min={.5} max={6} onChange={setWidth} />
              <RangeControl label="Current height" value={height} min={.35} max={2.5} onChange={setHeight} />
            </div>
            <span className="field-heading spaced-field">Target size</span>
            <div className="dial-stack">
              <RangeControl label="Target width" value={pill.expandedWidth} min={.5} max={7} onChange={expandedWidth => onChange({ expandedWidth })} />
              <RangeControl label="Target height" value={pill.expandedHeight} min={.35} max={3.5} onChange={expandedHeight => onChange({ expandedHeight })} />
            </div>
            <p className="control-hint">Set each dimension independently.</p>
            <div className="panel-rule" />
            <DialTransition value={pill.transition} onChange={transition => { studioSounds.play('tick'); onChange({ transition, ...compileTransition(transition) }); }} />
            <div className="panel-rule" />
            <div className="dial-stack"><Toggle label="Animate on hover" checked={hover} onChange={setHover} />
            <Toggle label="Loop animation" checked={loop} onChange={value => onChange({ loop: value, expanded: false })} /></div>
            <button className="primary-button full-width" data-ui-sound="thump" onClick={animate} disabled={reducedMotion || loop}><Play size={13} fill="currentColor" /> Play animation <span>↗</span></button>
            <p className="control-hint">{reducedMotion ? 'Reduced motion is enabled on your device.' : 'Changes width and height with text reflow.'}</p>
        </ControlSection>
  </>;
}

export default function App() {
  const [pills, setPills] = useState<PillConfig[]>(() => {
    const pill = createPill('pill-1', 1, 1);
    return [{
      ...pill,
      media: { ...(samples.find(sample => sample.kind === 'video') ?? pill.media) },
      hover: true,
      expandedHeight: pill.height,
    }];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspector, setInspector] = useState<'global' | 'pill' | null>(null);
  const [globalPanel, setGlobalPanel] = useState<Panel>('text');
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [text, setText] = useState(defaultText);
  const [fontSize, setFontSize] = useState(100);
  const [font, setFont] = useState(studioFonts[0]);
  const [dark, setDark] = useState(true);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(studioSounds.enabled);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [revealId, setRevealId] = useState<string | null>(null);
  const nextPill = useRef(2);
  const upload = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);
  const composition = useRef<HTMLDivElement>(null);
  const previewTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const uploadUrls = useRef(new Set<string>());
  const wordCount = (text.match(/\S+/gu) || []).length;
  const selected = pills.find(pill => pill.id === selectedId);
  const artifacts = pills.map(pill => ({ id: pill.id, position: pill.position, artifact: artifactProps(pill, dark, reducedMotion) }));
  const exportComposition = { text, artifacts: pills.map(pill => ({ id: pill.id, position: pill.position, artifact: artifactProps(pill, dark, false) })), font, fontSize, dark };
  const loopKey = JSON.stringify(pills.filter(pill => pill.loop).map(pill => [pill.id, pill.duration]));

  function updatePill(id: string, patch: Partial<PillConfig>) {
    setPills(current => current.map(pill => pill.id === id ? { ...pill, ...patch } : pill));
  }
  function selectPill(id: string) { if (inspector !== 'pill' || selectedId !== id) studioSounds.play('thump'); setSelectedId(id); setInspector('pill'); setError(''); }
  function closeInspector() { setInspector(null); setSelectedId(null); }
  function toggleGlobal(next: Panel) { setGlobalPanel(current => current === next ? null : next); }
  function setSoundsEnabled(enabled: boolean) {
    studioSounds.setEnabled(enabled); setSoundEnabled(enabled);
    if (enabled) studioSounds.play('tick');
  }
  function controlSound(event: React.MouseEvent<HTMLDivElement>) {
    const control = (event.target as Element).closest<HTMLElement>('button, [role="button"], [role="switch"], [role="radio"], summary');
    if (!control || control.matches('artifact-pill, :disabled, [aria-disabled="true"]')
      || control.closest('[inert], [data-ui-sound="none"]')) return;
    if (control.matches('[aria-pressed="true"], [role="radio"][aria-checked="true"]')) return;
    studioSounds.play(control.dataset.uiSound === 'thump' ? 'thump' : 'tick');
  }

  useEffect(() => {
    const stopWhenHidden = () => { if (document.hidden) studioSounds.stop(); };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => { document.removeEventListener('visibilitychange', stopWhenHidden); studioSounds.dispose(); };
  }, []);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches); sync();
    query.addEventListener('change', sync); return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (reducedMotion) return;
    const looping: [string, number][] = JSON.parse(loopKey);
    const timers = looping.map(([id, duration]) => setInterval(() => {
      setPills(current => current.map(pill => pill.id === id ? { ...pill, expanded: !pill.expanded } : pill));
    }, duration + 750));
    return () => timers.forEach(clearInterval);
  }, [loopKey, reducedMotion]);
  useEffect(() => {
    const used = new Set(pills.map(pill => pill.media.src).filter(src => src.startsWith('blob:')));
    uploadUrls.current.forEach(src => { if (!used.has(src)) URL.revokeObjectURL(src); });
    uploadUrls.current = used;
  }, [pills]);
  useEffect(() => () => {
    uploadUrls.current.forEach(src => URL.revokeObjectURL(src));
    previewTimers.current.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    if (!revealId) return;
    const element = [...(composition.current?.querySelectorAll<HTMLElement>('artifact-pill') || [])].find(node => node.dataset.artifactId === revealId);
    element?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'instant' : 'smooth' });
    element?.focus({ preventScroll: true });
    setRevealId(null);
  }, [revealId, reducedMotion]);
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (integrationOpen) return;
      if (event.key === 'Escape') { if (inspector) studioSounds.play('tick'); closeInspector(); return; }
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]') || event.metaKey || event.ctrlKey || event.altKey) return;
      const next = ({ t: 'text', c: 'canvas', e: 'export' } as const)[event.key.toLowerCase() as 't'];
      if (next && !event.repeat) { event.preventDefault(); studioSounds.play('thump'); setGlobalPanel(next); setInspector('global'); setSelectedId(null); }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [inspector, integrationOpen]);

  function addPill() {
    const number = nextPill.current++;
    const position = randomPosition(wordCount, pills.map(pill => pill.position));
    const pill = createPill(`pill-${number}`, number, position);
    setPills(current => [...current, pill]);
    setSelectedId(pill.id); setInspector(null); setRevealId(pill.id); setError('');
    setAnnouncement(`${pill.name} added at position ${position + 1}. Drag it to move, or click to edit.`);
  }
  function removePill(id: string) {
    clearTimeout(previewTimers.current.get(id)); previewTimers.current.delete(id);
    setPills(current => current.filter(pill => pill.id !== id)); closeInspector();
    setAnnouncement('Pill removed.');
  }
  function animate(pill: PillConfig) {
    clearTimeout(previewTimers.current.get(pill.id)); updatePill(pill.id, { expanded: true });
    previewTimers.current.set(pill.id, setTimeout(() => { updatePill(pill.id, { expanded: false }); previewTimers.current.delete(pill.id); }, pill.duration + 700));
  }
  function updateText(value: string, positions?: Record<string, number>) {
    setText(value);
    const count = (value.match(/\S+/gu) || []).length;
    setPills(current => current.map(pill => ({ ...pill, position: Math.min(positions?.[pill.id] ?? pill.position, count) })));
  }
  function resetGlobal() { updateText(defaultText); setFontSize(100); setFont(studioFonts[0]); setDark(true); setViewport('desktop'); }
  function uploadFile(file?: File) {
    const id = uploadTarget.current;
    if (!file || !id) return;
    if (!/^image\/(jpeg|png|gif|webp|avif)$|^video\/(mp4|webm|quicktime)$|^audio\/(mpeg|mp3|mp4|x-m4a|aac|wav|wave|x-wav|ogg|webm|flac|x-flac)$/.test(file.type)) { setError('Choose a JPG, PNG, GIF, WebP, AVIF, MP4, WebM, MOV, MP3, WAV, M4A, AAC, OGG, or FLAC file.'); return; }
    if (!pills.some(pill => pill.id === id)) return;
    const media: Media = { id: 'upload', name: file.name, kind: file.type === 'image/gif' ? 'gif' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image', src: URL.createObjectURL(file), alt: file.name.replace(/\.[^.]+$/, '').replaceAll(/[-_]/g, ' ') };
    updatePill(id, { media, paused: media.kind === 'audio', playOnHover: false }); setError('');
  }

  return <div className={`studio ${dark ? 'theme-dark' : 'theme-light'}`} onClickCapture={controlSound}
    onPointerDownCapture={event => { if (event.button === 0) void studioSounds.unlock(); }} onKeyDownCapture={() => { void studioSounds.unlock(); }}>
    <main className="canvas" aria-label="Live component preview" onPointerDown={event => { if (!(event.target as HTMLElement).closest('artifact-pill')) { if (inspector) studioSounds.play('tick'); closeInspector(); } }}>
      <div className={`canvas-inner ${viewport}`}>
        <div ref={composition} className="composition" style={{ '--type-scale': fontSize / 100, '--type-family': font.family, '--type-tracking': font.letterSpacing, '--type-tracking-mobile': font.mobileLetterSpacing } as CSSProperties}>
          <InlineArtifactsText className="specimen" text={text} artifacts={artifacts} selectedId={selectedId}
            onTextChange={(value, positions) => { if (value !== text) studioSounds.play('tick'); updateText(value, positions); }}
            onPositionChange={(id, position) => { if (pills.find(pill => pill.id === id)?.position !== position) studioSounds.play('thump'); updatePill(id, { position }); }} onSelectArtifact={selectPill}
            onArtifactDragStart={id => { setSelectedId(id); setInspector(null); }} />
        </div>
      </div>
    </main>
    <div className="studio-wordmark">intertext<span>Media inside your words.</span></div>
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas actions">
      <button className="use-site-button" onClick={() => setIntegrationOpen(true)}>Use on your site <ArrowRight size={14} /></button>
      <button className="toolbar-button" data-ui-sound="thump" aria-label="Add pill" title="Add pill" onClick={addPill}><ToolbarIcon name="add" /></button>
      <button className="toolbar-button" data-ui-sound="thump" aria-label="Global settings" title="Global settings" aria-expanded={inspector === 'global'} aria-controls="settings-sidebar" onClick={() => { setInspector(current => current === 'global' ? null : 'global'); setSelectedId(null); }}><ToolbarIcon name="settings" /></button>
    </div>
    <aside id="settings-sidebar" className={`controls-sidebar dialkit-root ${!inspector ? 'is-collapsed' : ''}`} data-theme={dark ? 'dark' : 'light'} aria-label={inspector === 'global' ? 'Global settings' : 'Pill settings'} aria-hidden={!inspector} inert={!inspector}>
      <header className="sidebar-header"><span>{inspector === 'global' ? 'Global settings' : selected?.name || 'Pill settings'}</span><button className="icon-button" aria-label="Close settings" title="Close settings" onClick={closeInspector}><X size={15} /></button></header>
      <div className="sidebar-sections">
        {inspector === 'global' ? <>
          <ControlSection name="text" title="Typography" icon={<Type size={15} />} open={globalPanel === 'text'} onToggle={() => toggleGlobal('text')}>
            <div data-ui-sound="none"><DialFontPicker value={font} onChange={next => { if (next.id !== font.id) studioSounds.play('tick'); setFont(next); }} /></div>
            <div className="shape-dials"><RangeControl label="Type scale" value={fontSize} min={50} max={160} step={1} unit="%" onChange={setFontSize} /></div>
            <p className="control-hint">Click the text on the canvas to edit it.</p>
          </ControlSection>
          <ControlSection name="canvas" title="Canvas" icon={<Monitor size={15} />} open={globalPanel === 'canvas'} onToggle={() => toggleGlobal('canvas')}>
            <span className="field-heading">Background</span>
            <div className="segmented" role="group" aria-label="Canvas background"><button aria-pressed={dark} onClick={() => setDark(true)}>Dark</button><button aria-pressed={!dark} onClick={() => setDark(false)}>Light</button></div>
            <span className="field-heading spaced-field">Preview width</span>
            <div className="segmented" role="group" aria-label="Preview width"><button aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}><Monitor size={13} /> Fluid</button><button aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}><Smartphone size={13} /> 375 px</button></div>
          </ControlSection>
          <ControlSection name="export" title="Export" icon={<Code2 size={15} />} open={globalPanel === 'export'} onToggle={() => toggleGlobal('export')}>
            <p className="control-hint">Take this composition to your website with React, HTML, or your coding agent.</p>
            <button className="primary-button full-width" onClick={() => setIntegrationOpen(true)}>Use on your site <ArrowRight size={14} /></button>
          </ControlSection>
          <div className="sound-preference" data-ui-sound="none"><Toggle label="UI sounds" checked={soundEnabled} onChange={setSoundsEnabled} /></div>
        </> : selected && <PillSettings key={selected.id} pill={selected} wordCount={wordCount} reducedMotion={reducedMotion}
          onChange={patch => updatePill(selected.id, patch)} onAnimate={() => animate(selected)}
          onUpload={() => { uploadTarget.current = selected.id; upload.current?.click(); }} />}
        {error && inspector === 'pill' && <p className="error-text sidebar-error" role="alert">{error}</p>}
      </div>
      <footer className="sidebar-footer">{inspector === 'global'
        ? <><button className="text-button" onClick={resetGlobal}><RotateCcw size={13} /> Reset global settings</button>
          <div className="creator-credit">by <a href="https://www.davidezhang.com/" target="_blank" rel="noopener noreferrer">Davide Zhang</a></div></>
        : selected && <button className="text-button" onClick={() => removePill(selected.id)}><Trash2 size={13} /> Remove pill</button>}
      </footer>
    </aside>
    <IntegrationPanel open={integrationOpen} onClose={() => setIntegrationOpen(false)} composition={exportComposition} />
    <span className="visually-hidden" role="status" aria-live="polite">{announcement}</span>
    <input ref={upload} className="visually-hidden" type="file" aria-label="Upload media file" tabIndex={-1} accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm,video/quicktime,audio/*" onChange={e => { uploadFile(e.target.files?.[0]); e.target.value = ''; }} />
  </div>;
}
