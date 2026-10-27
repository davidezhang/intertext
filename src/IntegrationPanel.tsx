import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, Copy, X } from 'lucide-react';
import { createIntegrationPrompt, downloadComposition, generateExport, type ExportComposition } from './studio-export';

type Route = 'ai' | 'react' | 'html';
const skillCommand = 'npx skills add https://intertext.dev';
const packageCommand = 'npm install intertext-dev';

export function IntegrationPanel({ open, onClose, composition }: {
  open: boolean;
  onClose: () => void;
  composition: ExportComposition;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [route, setRoute] = useState<Route>('ai');
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasUploads = composition.artifacts.some(({ artifact }) => [artifact.src, artifact.poster].some(src => src?.startsWith('blob:')));
  const format = route === 'html' ? 'html' : 'react';
  const code = generateExport(composition, format);

  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
    if (open) setStatus('');
  }, [open]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setStatus(`${label} copied.`);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      setStatus('Could not copy. Select the text below, or download your composition.');
    }
  }

  async function download() {
    setBusy(true);
    setStatus('Preparing your code and media…');
    try {
      await downloadComposition(composition, format);
      setStatus('Your download is ready. Open the included README to add it to your site.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The download could not be prepared. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function copyButton(value: string, label: string, disabled = false) {
    return <button className="integration-copy" disabled={disabled} onClick={() => void copy(value, label)} aria-label={`Copy ${label.toLowerCase()}`}>
      {copied === label ? <Check size={14} /> : <Copy size={14} />}
      {copied === label ? 'Copied' : 'Copy'}
    </button>;
  }

  return <dialog ref={dialog} className="integration-dialog" aria-labelledby="integration-title" aria-describedby="integration-description"
    onCancel={onClose} onClose={onClose} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="integration-header">
      <div><span className="integration-eyebrow">INTERTEXT</span><h1 id="integration-title">Use it on your site.</h1>
        <p id="integration-description">Your composition, ready for the web.</p></div>
      <button className="icon-button" onClick={onClose} aria-label="Close integration"><X size={19} /></button>
    </header>
    <div className="integration-routes" role="group" aria-label="Integration method">
      {([{ id: 'ai', label: 'With AI' }, { id: 'react', label: 'React / Next.js' }, { id: 'html', label: 'HTML' }] as const).map(item =>
        <button key={item.id} aria-pressed={route === item.id} onClick={() => { setRoute(item.id); setStatus(''); }}>{item.label}</button>)}
    </div>
    <div className="integration-content">
      {route === 'ai' ? <>
        <section className="integration-step">
          <div className="integration-step-title"><h2><span>1</span> Add the Intertext skill</h2>{copyButton(skillCommand, 'Install command')}</div>
          <p>Run this in your website project. Choose your coding agent when prompted.</p>
          <pre className="integration-command"><code>{skillCommand}</code></pre>
        </section>
        <section className="integration-step">
          <div className="integration-step-title"><h2><span>2</span> Bring your composition</h2>{copyButton(createIntegrationPrompt(composition), 'Integration prompt')}</div>
          <p>Download the kit, then give your agent the included files and this prompt.</p>
          <pre className="integration-prompt"><code>{createIntegrationPrompt(composition)}</code></pre>
        </section>
      </> : <>
        {route === 'react' && <section className="integration-step">
          <div className="integration-step-title"><h2><span>1</span> Install Intertext</h2>{copyButton(packageCommand, 'Install command')}</div>
          <pre className="integration-command"><code>{packageCommand}</code></pre>
          <p>The download also includes the package for a local install.</p>
        </section>}
        <section className="integration-step">
          <div className="integration-step-title"><h2>{route === 'react' && <span>2</span>} Add your composition</h2>{copyButton(code, 'Component code', hasUploads)}</div>
          <p>{hasUploads ? 'Download the kit to include your uploaded media and working file paths.' : route === 'html' ? 'Paste into your page, or download a complete example with the component and media.' : 'Add this component to your page, or download the complete kit with your media.'}</p>
          <pre className="integration-code" tabIndex={0} aria-label="Integration code"><code>{code}</code></pre>
        </section>
      </>}
      <div className="integration-download">
        <button className="primary-button" disabled={busy} onClick={() => void download()}><ArrowDownToLine size={16} />{busy ? 'Preparing…' : route === 'ai' ? 'Download composition' : `Download ${route === 'html' ? 'HTML' : 'React'} kit`}</button>
        <p>Code, media, and setup instructions. Free for personal and commercial sites.</p>
      </div>
      <p className="integration-status" role="status" aria-live="polite">{status}</p>
      <section className="integration-examples" aria-labelledby="examples-title">
        <h2 id="examples-title">A few places to start</h2>
        <div>{[{ slug: 'portfolio', label: 'Portfolio intro' }, { slug: 'product', label: 'Product story' }, { slug: 'editorial', label: 'Editorial lead' }].map(example =>
          <a key={example.slug} href={`/examples/${example.slug}.html`} target="_blank" rel="noreferrer">{example.label}<ArrowUpRight size={14} /></a>)}</div>
      </section>
    </div>
    <footer className="integration-footer"><span>Made to fit your typography.</span><nav aria-label="Intertext resources"><a href="/docs/integration.md" target="_blank" rel="noreferrer">Docs <ArrowUpRight size={12} /></a><a href="https://github.com/davidezhang/intertext" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12} /></a><a href="/releases/0.1.0/LICENSE" target="_blank" rel="noreferrer">License <ArrowUpRight size={12} /></a></nav></footer>
  </dialog>;
}
