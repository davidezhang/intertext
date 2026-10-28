import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, Copy } from 'lucide-react';
import { Folder } from 'dialkit';
import { createIntegrationPrompt, downloadComposition, generateExport, type ExportComposition } from './studio-export';
import { studioSounds } from './studio-sound';

type Method = 'agent' | 'react' | 'html';
const methods: readonly { id: Method; label: string }[] = [
  { id: 'agent', label: 'Agent' }, { id: 'react', label: 'React' }, { id: 'html', label: 'HTML' },
];
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

/** DialKit's segmented surface, with radio-group keyboard navigation like the font picker. */
function MethodPicker({ value, onChange }: { value: Method; onChange: (method: Method) => void }) {
  const selectedIndex = methods.findIndex(method => method.id === value);
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (direction === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? methods.length - 1
      : (selectedIndex + direction! + methods.length) % methods.length;
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
    onChange(methods[index].id);
  }
  return <div className="export-methods dialkit-segmented" role="radiogroup" aria-label="Export method" data-ui-sound="none"
    onKeyDown={handleKeyDown} style={{ '--choice-count': methods.length, '--choice-index': selectedIndex } as CSSProperties}>
    <span className="dialkit-segmented-pill" aria-hidden="true" />
    {methods.map(method => <button key={method.id} type="button" role="radio" className="dialkit-segmented-button"
      data-active={method.id === value} aria-checked={method.id === value} tabIndex={method.id === value ? 0 : -1}
      onClick={() => onChange(method.id)}>{method.label}</button>)}
  </div>;
}

export function ExportPanel({ composition }: { composition: ExportComposition }) {
  const [method, setMethod] = useState<Method>('agent');
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasUploads = composition.artifacts.some(({ artifact }) => [artifact.src, artifact.poster].some(src => src?.startsWith('blob:')));
  const format = method === 'html' ? 'html' : 'react';
  const code = method === 'agent' ? '' : generateExport(composition, format);
  const lines = code.split('\n').length;

  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    if (document.querySelector(`link[href="${exampleFonts}"]`)) return;
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: exampleFonts });
    document.head.append(link);
  }, []);

  function choose(next: Method) {
    if (next === method) return;
    studioSounds.play('tick'); setMethod(next); setError(''); setStatus('');
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
      await downloadComposition(composition, format);
      setStatus('Kit downloaded. Its README walks through setup.');
    } catch (reason) {
      setStatus('');
      setError(reason instanceof Error ? reason.message : 'The kit could not be prepared. Please try again.');
    } finally { setBusy(false); }
  }

  function copyRow(label: string, value: string, content: ReactNode, options: { code?: boolean; meta?: string; disabled?: boolean } = {}) {
    const done = copied === label;
    return <button type="button" className="copy-row" data-copied={done} disabled={options.disabled}
      aria-label={`Copy ${label.toLowerCase()}`} title={options.code ? value : undefined} onClick={() => void copy(value, label)}>
      <span className={`copy-row-text${options.code ? ' is-code' : ''}`}>{content}</span>
      {options.meta && <span className="copy-row-meta">{options.meta}</span>}
      <span className="copy-row-icon" aria-hidden="true">{done ? <Check size={14} /> : <Copy size={14} />}</span>
    </button>;
  }
  const preview = <div className="export-preview"><Folder key={method} title="Preview code" defaultOpen={false}>
    <pre className="export-code" tabIndex={0} aria-label={`${method === 'html' ? 'HTML' : 'React'} code`}><code>{code}</code></pre>
  </Folder></div>;
  const uploadHint = hasUploads && method !== 'agent'
    ? <p className="control-hint">Uploaded media only travels in the kit. Download it for working file paths.</p> : null;

  return <div className="export-panel">
    <MethodPicker value={method} onChange={choose} />
    <ol className={`export-steps${method === 'html' ? '' : ' is-numbered'}`}>
      {method === 'agent' && <>
        <li><span className="export-step-label">Add the Intertext skill to your project</span>
          {copyRow('Install command', skillCommand, skillCommand, { code: true })}</li>
        <li><span className="export-step-label">Ask your agent to add this composition</span>
          {copyRow('Agent prompt', createIntegrationPrompt(composition), 'Agent prompt', { meta: 'with layout data' })}</li>
      </>}
      {method === 'react' && <>
        <li><span className="export-step-label">Install the package</span>
          {copyRow('Install command', packageCommand, packageCommand, { code: true })}</li>
        <li><span className="export-step-label">Add the component</span>
          {copyRow('Component code', code, 'Headline.tsx', { meta: `${lines} lines`, disabled: hasUploads })}{preview}{uploadHint}</li>
      </>}
      {method === 'html' && <li><span className="export-step-label">Paste into any page</span>
        {copyRow('HTML snippet', code, 'HTML snippet', { meta: `${lines} lines`, disabled: hasUploads })}{preview}{uploadHint}</li>}
    </ol>
    <button type="button" className="primary-button full-width export-download" disabled={busy} onClick={() => void download()}>
      <ArrowDownToLine size={14} />{busy ? 'Preparing…' : method === 'agent' ? 'Download kit' : `Download ${method === 'html' ? 'HTML' : 'React'} kit`}<span>ZIP</span>
    </button>
    <p className="control-hint">{method === 'agent'
      ? hasUploads ? 'Attach the kit for your agent. It carries your uploaded media.' : 'Optional for your agent: code, media and a local runtime.'
      : 'Code, media and setup notes. Free for personal and commercial sites.'}</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <span className="visually-hidden" role="status" aria-live="polite">{status}</span>

    <div className="panel-rule" />
    <span className="field-heading">Starting points</span>
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
      <a href="/releases/0.1.0/LICENSE" target="_blank" rel="noreferrer">MIT license<ArrowUpRight size={11} aria-hidden="true" /></a>
    </nav>
  </div>;
}
