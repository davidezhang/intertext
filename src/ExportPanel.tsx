import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, Copy, FolderOpen } from 'lucide-react';
import { Folder } from 'dialkit';
import { createIntegrationPrompt, createPreviewPage, downloadComposition, EXPORT_VERSION, generateExport, type ExportComposition } from './studio-export';
import { missingMediaNote, readCompositionFile, type StudioComposition } from './studio-persistence';
import { studioSounds } from './studio-sound';

type Method = 'agent' | 'react' | 'html';
type Appearance = NonNullable<ExportComposition['appearance']>;
type Tag = NonNullable<ExportComposition['tag']>;
type Choices<T> = readonly { id: T; label: string }[];
const methods: Choices<Method> = [
  { id: 'agent', label: 'Agent' }, { id: 'react', label: 'React' }, { id: 'html', label: 'HTML' },
];
const appearances: Choices<Appearance> = [{ id: 'site', label: 'Match site' }, { id: 'studio', label: 'Studio' }];
const tags: Choices<Tag> = [{ id: 'h1', label: 'H1' }, { id: 'h2', label: 'H2' }, { id: 'p', label: 'Paragraph' }];
const elementHints: Record<Tag, string> = {
  h1: 'Use H1 once, for the page’s main headline.', h2: 'H2 suits a section heading.', p: 'Paragraph suits body text.',
};
type Copyable = { label: string; value: string; content: ReactNode; code?: boolean; meta?: string; disabled?: boolean };
const skillCommand = 'npx skills add https://intertext.dev';
const packageCommand = 'npm install intertext-dev';
// Thumbnails echo each starter's own typeface, palette and pill shape.
const exampleFonts = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap';

type Example = {
  slug: string; name: string; note: string; before: string; after: string; image: string;
  style: CSSProperties; pill: CSSProperties;
};
const examples: readonly Example[] = [
  { slug: 'editorial', name: 'Editorial', note: 'Serif magazine', before: 'A softer', after: 'city.', image: '/media/concrete.jpg',
    style: { '--example-bg': '#f3eee4', '--example-fg': '#211c16', fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 19, letterSpacing: '-.02em', lineHeight: 1 } as CSSProperties,
    pill: { width: '2.1em' } },
  { slug: 'portfolio', name: 'Portfolio', note: 'Quiet and dark', before: 'Mira designs', after: 'interfaces.', image: '/media/escalator-motion.jpg',
    style: { '--example-bg': '#0d0d0d', '--example-fg': '#ececec', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 14, letterSpacing: '-.05em' } as CSSProperties,
    pill: { width: '2.4em' } },
  { slug: 'product', name: 'Product launch', note: 'Bold color', before: 'Sit', after: 'still.', image: '/media/shell-chair.jpg',
    style: { '--example-bg': '#2335f4', '--example-fg': '#fff', fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif", fontStretch: '125%', fontWeight: 800, fontSize: 15, letterSpacing: '-.04em', textTransform: 'uppercase' } as CSSProperties,
    pill: { width: '1.9em', height: '.9em' } },
  { slug: 'event', name: 'Event poster', note: 'Loud and condensed', before: 'Night', after: 'signals live', image: '/media/analog-loop.jpg',
    style: { '--example-bg': '#d6ff3d', '--example-fg': '#0b0b0b', fontFamily: "'Archivo', 'Arial Narrow', sans-serif", fontStretch: '62%', fontWeight: 900, fontSize: 21, letterSpacing: '-.01em', lineHeight: .9, textTransform: 'uppercase' } as CSSProperties,
    pill: { width: '1.7em', height: '.74em' } },
  { slug: 'studio', name: 'Studio', note: 'Swiss grid', before: 'Quiet', after: 'rooms for loud cities.', image: '/media/concrete-motion.jpg',
    style: { '--example-bg': '#e8e7e3', '--example-fg': '#111', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 13, letterSpacing: '-.035em' } as CSSProperties,
    pill: { width: '2.3em', borderRadius: 0 } },
  { slug: 'notes', name: 'Field notes', note: 'Inside body text', before: 'The record kept', after: 'turning in the window while the street went quiet.', image: '/media/analog-loop.jpg',
    style: { '--example-bg': '#fbfaf8', '--example-fg': '#2a2a28', fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 9, lineHeight: 1.55, letterSpacing: 0, alignItems: 'flex-start', paddingTop: 12 } as CSSProperties,
    pill: { width: '2.2em', height: '1.1em', borderRadius: 3, verticalAlign: '-.3em' } },
];

/** Arrow keys, Home and End move a radio group's selection, as in DialKit's segmented controls. */
function selectWithKeys<T>(event: KeyboardEvent<HTMLDivElement>, options: Choices<T>, value: T, onChange: (value: T) => void) {
  const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (direction === undefined && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  const selected = options.findIndex(option => option.id === value);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
    : (selected + direction! + options.length) % options.length;
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  onChange(options[index].id);
}

/** DialKit's labeled segmented row. Its pill is measured, like DialKit's own toggles. */
function ChoiceRow<T extends string>({ label, options, value, onChange }: {
  label: string; options: Choices<T>; value: T; onChange: (value: T) => void;
}) {
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number; animate: boolean } | null>(null);
  useLayoutEffect(() => {
    const active = group.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (active) setPill(current => ({ left: active.offsetLeft, width: active.offsetWidth, animate: current !== null }));
  }, [value]);
  return <div className="dialkit-labeled-control">
    <span className="dialkit-labeled-control-label" id={labelId}>{label}</span>
    <div ref={group} className="dialkit-segmented" role="radiogroup" aria-labelledby={labelId} data-ui-sound="none"
      onKeyDown={event => selectWithKeys(event, options, value, onChange)}>
      {pill && <span className="dialkit-segmented-pill" aria-hidden="true" style={{ left: pill.left, width: pill.width,
        transition: pill.animate ? 'left .2s cubic-bezier(.25, 1, .5, 1), width .2s cubic-bezier(.25, 1, .5, 1)' : 'none' }} />}
      {options.map(option => <button key={option.id} type="button" role="radio" className="dialkit-segmented-button"
        data-active={option.id === value} aria-checked={option.id === value} tabIndex={option.id === value ? 0 : -1}
        onClick={() => { if (option.id !== value) onChange(option.id); }}>{option.label}</button>)}
    </div>
  </div>;
}

/** DialKit's segmented surface, with radio-group keyboard navigation like the font picker. */
function MethodPicker({ value, onChange }: { value: Method; onChange: (method: Method) => void }) {
  const selectedIndex = methods.findIndex(method => method.id === value);
  return <div className="export-methods dialkit-segmented" role="radiogroup" aria-label="Export method" data-ui-sound="none"
    onKeyDown={event => selectWithKeys(event, methods, value, onChange)} style={{ '--choice-count': methods.length, '--choice-index': selectedIndex } as CSSProperties}>
    <span className="dialkit-segmented-pill" aria-hidden="true" />
    {methods.map(method => <button key={method.id} type="button" role="radio" className="dialkit-segmented-button"
      data-active={method.id === value} aria-checked={method.id === value} tabIndex={method.id === value ? 0 : -1}
      onClick={() => onChange(method.id)}>{method.label}</button>)}
  </div>;
}

export function ExportPanel({ composition, missingMedia, autosave, onOpen }: {
  composition: ExportComposition; missingMedia: string[]; autosave: boolean; onOpen: (composition: StudioComposition) => void;
}) {
  const [method, setMethod] = useState<Method>('agent');
  // Most compositions join an existing design, so exports take the page's typography by default.
  const [appearance, setAppearance] = useState<Appearance>('site');
  const [tag, setTag] = useState<Tag>('h1');
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [opened, setOpened] = useState('');
  const [openError, setOpenError] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewURL = useRef<string | undefined>(undefined);
  const input: ExportComposition = { ...composition, appearance, tag };
  const openInput = useRef<HTMLInputElement>(null);
  const openHint = useId();
  const hasUploads = composition.artifacts.some(({ artifact }) => [artifact.src, artifact.poster].some(src => src?.startsWith('blob:')));
  // Placeholders must never ship, so exports wait until missing media is uploaded again.
  const blocked = missingMedia.length > 0;
  const format = method === 'html' ? 'html' : 'react';
  const code = method === 'agent' || blocked ? '' : generateExport(input, format);
  const lines = code.split('\n').length;

  useEffect(() => () => {
    clearTimeout(copyTimer.current);
    if (previewURL.current) URL.revokeObjectURL(previewURL.current);
  }, []);
  useEffect(() => {
    if (document.querySelector(`link[href="${exampleFonts}"]`)) return;
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: exampleFonts });
    document.head.append(link);
  }, []);

  function choose(next: Method) {
    if (next === method) return;
    studioSounds.play('tick'); setMethod(next); setCopied(null); setError(''); setStatus('');
  }
  function setOption<T>(set: (value: T) => void) {
    return (next: T) => { studioSounds.play('tick'); set(next); setStatus(''); };
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label); setError(''); setStatus(`${label} copied.`);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1800);
    } catch {
      setError('Your browser blocked the clipboard. Try again, or download the kit for the code and setup steps.');
    }
  }
  async function download() {
    setBusy(true); setError(''); setStatus('Preparing your kit…');
    try {
      await downloadComposition(input, format);
      setStatus('Kit downloaded. Its README walks through setup.');
    } catch (reason) {
      setStatus('');
      setError(reason instanceof Error ? reason.message : 'The kit could not be prepared. Please try again.');
    } finally { setBusy(false); }
  }
  function openPreview() {
    // One preview page stays available, so its tab can reload until the next preview replaces it.
    if (previewURL.current) URL.revokeObjectURL(previewURL.current);
    previewURL.current = URL.createObjectURL(new Blob([createPreviewPage(input, location.href)], { type: 'text/html' }));
    window.open(previewURL.current, '_blank', 'noopener');
  }
  async function open(file?: File) {
    if (!file) return;
    setOpened(''); setOpenError('');
    try {
      const next = await readCompositionFile(file);
      onOpen(next);
      setOpened(`Opened ${file.name}. ${missingMediaNote(next.pills)}`.trim());
    } catch (reason) {
      setOpenError(reason instanceof Error ? reason.message : 'The composition could not be opened. Please try again.');
    }
  }

  // "Copied" appears on the step's label line, so confirming never changes the row's size.
  function step(title: string, row: Copyable, extra?: ReactNode) {
    const done = copied === row.label;
    return <li><span className="export-step-label">{title}{done && <span className="export-step-copied" aria-hidden="true">Copied</span>}</span>
      <button type="button" className="copy-row" data-copied={done} disabled={row.disabled}
        aria-label={`Copy ${row.label.toLowerCase()}`} title={row.code ? row.value : undefined} onClick={() => void copy(row.value, row.label)}>
        <span className={`copy-row-text${row.code ? ' is-code' : ''}`}>{row.content}</span>
        {row.meta && <span className="copy-row-meta">{row.meta}</span>}
        <span className="copy-row-icon" aria-hidden="true">{done ? <Check size={14} /> : <Copy size={14} />}</span>
      </button>{extra}</li>;
  }
  const preview = <div className="export-preview"><Folder key={method} title="Preview code" defaultOpen={false}>
    <pre className="export-code" tabIndex={0} aria-label={`${method === 'html' ? 'HTML' : 'React'} code`}><code>{code}</code></pre>
  </Folder></div>;
  const uploadHint = hasUploads && method !== 'agent'
    ? <p className="control-hint">Uploaded media only travels in the kit. Download it for working file paths.</p> : null;

  return <div className="export-panel">
    <MethodPicker value={method} onChange={choose} />
    <div className="export-options">
      <ChoiceRow label="Style" options={appearances} value={appearance} onChange={setOption(setAppearance)} />
      <ChoiceRow label="Element" options={tags} value={tag} onChange={setOption(setTag)} />
    </div>
    <p className="control-hint">{appearance === 'site' ? 'Uses your page’s fonts, colors and size.' : 'Brings the studio’s fonts, colors and size.'} {elementHints[tag]}</p>
    <button type="button" className="text-button export-sample" disabled={blocked} onClick={openPreview}>
      Preview on a sample page<ArrowUpRight size={12} aria-hidden="true" /><span className="visually-hidden"> (opens in a new tab)</span>
    </button>
    <ol className={`export-steps${method === 'html' ? '' : ' is-numbered'}`}>
      {method === 'agent' && <>
        {step('Add the Intertext skill to your project', { label: 'Install command', value: skillCommand, content: skillCommand, code: true })}
        {step('Ask your agent to add this composition', { label: 'Agent prompt', value: blocked ? '' : createIntegrationPrompt(input), content: 'Agent prompt', meta: 'with layout data', disabled: blocked })}
      </>}
      {method === 'react' && <>
        {step('Install the package', { label: 'Install command', value: packageCommand, content: packageCommand, code: true })}
        {step('Add the component', { label: 'Component code', value: code, content: 'Headline.tsx', meta: blocked ? undefined : `${lines} lines`, disabled: hasUploads || blocked }, <>{!blocked && preview}{uploadHint}</>)}
      </>}
      {method === 'html' && step('Paste into any page', { label: 'HTML snippet', value: code, content: 'HTML snippet', meta: blocked ? undefined : `${lines} lines`, disabled: hasUploads || blocked }, <>{!blocked && preview}{uploadHint}</>)}
    </ol>
    <button type="button" className="primary-button full-width export-download" disabled={busy || blocked} onClick={() => void download()}>
      <ArrowDownToLine size={14} />{busy ? 'Preparing…' : method === 'agent' ? 'Download kit' : `Download ${method === 'html' ? 'HTML' : 'React'} kit`}<span>ZIP</span>
    </button>
    <p className="control-hint">{blocked ? `Upload the missing media for ${new Intl.ListFormat('en').format(missingMedia)} to export.`
      : method === 'agent' ? hasUploads ? 'Attach the kit for your agent. It carries your uploaded media.' : 'Optional for your agent: code, media and a local runtime.'
      : 'Code, media and setup notes. Free for personal and commercial sites.'}</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <span className="visually-hidden" role="status" aria-live="polite">{status}</span>

    <div className="panel-rule" />
    <span className="field-heading">Reopen a kit</span>
    {/* DialKit's row surface, shared with the copy actions above. */}
    <button type="button" className="copy-row" aria-describedby={openHint} onClick={() => openInput.current?.click()}>
      <span className="copy-row-text">Open composition</span>
      <span className="copy-row-meta" aria-hidden="true">composition.json</span>
      <span className="copy-row-icon" aria-hidden="true"><FolderOpen size={14} /></span>
    </button>
    <input ref={openInput} className="visually-hidden" type="file" accept=".json,application/json" tabIndex={-1} aria-label="Open composition file"
      onChange={event => { void open(event.target.files?.[0]); event.target.value = ''; }} />
    <p id={openHint} className="control-hint" aria-live="polite">{opened || 'Choose composition.json from a downloaded kit to keep editing. It replaces the current composition.'}</p>
    {openError && <p className="error-text" role="alert">{openError}</p>}
    {!autosave && <p className="control-hint">Autosave is unavailable in this browser. Download a kit to keep your work.</p>}

    <div className="panel-rule" />
    <span className="field-heading">Examples</span>
    <div className="example-grid">{examples.map(example =>
      <a key={example.slug} className="example-card" href={`/examples/${example.slug}.html`} target="_blank" rel="noreferrer">
        <span className="example-thumb" style={example.style} aria-hidden="true">
          <span className="example-specimen">{example.before} <span className="example-pill" style={{ ...example.pill, backgroundImage: `url(${example.image})` }} /> {example.after}</span>
        </span>
        <span className="example-name">{example.name}<ArrowUpRight size={11} aria-hidden="true" /></span>
        <span className="example-note">{example.note}<span className="visually-hidden"> (opens in a new tab)</span></span>
      </a>)}
    </div>
    <nav className="export-links" aria-label="Intertext resources">
      <a href="/docs/integration.md" target="_blank" rel="noreferrer">Docs<ArrowUpRight size={11} aria-hidden="true" /></a>
      <a href="https://github.com/davidezhang/intertext" target="_blank" rel="noreferrer">GitHub<ArrowUpRight size={11} aria-hidden="true" /></a>
      <a href={`/releases/${EXPORT_VERSION}/LICENSE`} target="_blank" rel="noreferrer">MIT license<ArrowUpRight size={11} aria-hidden="true" /></a>
    </nav>
  </div>;
}
