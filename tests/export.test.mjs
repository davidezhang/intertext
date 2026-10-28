import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('../src/studio-export.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { EXPORT_VERSION, generateExport, createCompositionManifest, createIntegrationPrompt, createPreviewPage, buildCompositionFiles, buildCompositionArchive, createStoredZip } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const versionPattern = version.replaceAll('.', '\\.');
const font = { id: 'default', name: 'Helvetica Neue', label: 'Default', family: "'Helvetica Neue', Helvetica, Arial, sans-serif", letterSpacing: '-.058em', mobileLetterSpacing: '-.055em' };
const makeInput = (overrides = {}) => ({ text: 'Designing text interfaces.', artifacts: [{ id: 'a', position: 1, artifact: { src: '/media/concrete.jpg', alt: 'Concrete', width: '3.3em', height: '.85em', hoverExpand: true } }], font, fontSize: 125, dark: true, ...overrides });
const content = (files, path) => new TextDecoder().decode(files.find(file => file.path === path)?.bytes);
const mediaName = (bytes, extension) => `media-${createHash('sha256').update(new Uint8Array(bytes)).digest('hex')}.${extension}`;
const mockPill = 'const ArtifactPill = props => _jsx("artifact-pill", Object.fromEntries(Object.entries(props).map(([key, value]) => [key.replace(/[A-Z]/g, c => "-" + c.toLowerCase()), value === true ? "" : value])));';
// Run exported HTML against the built browser module, as a visitor's page would.
const runtime = readFileSync(new URL('../dist/lib/artifact-pill.js', import.meta.url), 'utf8').replace(/export\s*\{[^}]*\};?\s*$/, '');
function withRuntime(html) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    beforeParse(window) { window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); },
  });
  dom.window.eval(runtime);
  return dom;
}

test('HTML preserves literal Unicode, whitespace, line breaks and boundary order with escaped text and attributes', () => {
  const text = '  α<&"\n第二  👩🏽‍💻\tend\n';
  const input = makeInput({ text, tag: 'h2', artifacts: [
    { id: 'first', position: -10, artifact: { src: '/media/a.webp', alt: 'A "quoted" <image>' } },
    { id: 'shared-1', position: 2, artifact: { src: '/media/b.png', alt: 'B', expanded: true, 'aria-label': 'Edit pill', style: { color: 'red' } } },
    { id: 'shared-2', position: 2, artifact: { src: '/media/c.png', alt: 'C', paused: false } },
    { id: 'last', position: 999, artifact: { src: '/media/d.png', alt: 'D' } },
  ] });
  const html = generateExport(input, 'html');
  const document = new JSDOM(html).window.document;
  const heading = document.querySelector('h2');
  assert.equal(heading.textContent, '   α<&"\n第二    👩🏽‍💻\tend\n');
  const pills = [...heading.querySelectorAll('artifact-pill')];
  assert.deepEqual(pills.map(pill => pill.getAttribute('alt')), ['A "quoted" <image>', 'B', 'C', 'D']);
  assert.equal(pills[0].getAttribute('src'), 'https://intertext.dev/media/a.webp');
  assert.equal(pills[1].hasAttribute('expanded'), false);
  assert.equal(pills[1].hasAttribute('aria-label'), false);
  assert.equal(pills[1].hasAttribute('style'), false);
  assert.equal(pills[2].hasAttribute('paused'), false);
  assert.equal(EXPORT_VERSION, version, 'exports must install the release being built');
  assert.match(html, new RegExp(`https://intertext\\.dev/releases/${versionPattern}/artifact-pill\\.js`));
  assert.match(html, /--intertext-scale: 1\.25/);
  assert.match(html, /color-scheme: dark/);
});

test('generated React compiles and renders the exact composition with direct display elements', async () => {
  const text = ' } </script><script>alert("x")</script>\nこんにちは 🫧 \\ ${x}';
  const input = makeInput({ text, artifacts: [{ id: 'a', position: 2, artifact: { src: '/media/test.png', alt: '<caption> "quoted"', paused: true, expandedWidth: '5em' } }] });
  const code = generateExport(input, 'react');
  assert.match(code, /import \{ ArtifactPill \} from 'intertext-dev\/react'/);
  assert.doesNotMatch(code, /useState|InlineArtifactsText|onPositionChange|contentEditable/);
  assert.match(code, /'use client';/);
  const diagnostics = ts.transpileModule(code, { reportDiagnostics: true, fileName: 'Headline.tsx', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual(diagnostics.diagnostics, []);
  const compiled = diagnostics.outputText
    .replace(/from "react\/jsx-runtime"/g, `from ${JSON.stringify(import.meta.resolve('react/jsx-runtime'))}`)
    .replace(/import \{ ArtifactPill \} from 'intertext-dev\/react';/, mockPill);
  const { default: Headline } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const document = new JSDOM(renderToStaticMarkup(React.createElement(Headline))).window.document;
  assert.equal(document.querySelector('h1').textContent, text.replace('alert("x")</script>\n', 'alert("x")</script>\n '));
  assert.equal(document.querySelectorAll('script').length, 0);
  assert.equal(document.querySelector('artifact-pill').getAttribute('alt'), '<caption> "quoted"');
  assert.equal(document.querySelector('artifact-pill').hasAttribute('paused'), true);
});

test('upload copy and agent manifest use explicit placeholders, never browser-session URLs', () => {
  const input = makeInput({ artifacts: [{ id: '../../escape', position: 0, artifact: { src: 'blob:https://intertext.dev/upload-123', poster: 'blob:https://intertext.dev/poster-456', alt: 'Uploaded', kind: 'video' } }] });
  for (const format of ['react', 'html']) {
    const code = generateExport(input, format);
    assert.doesNotMatch(code, /blob:/);
    assert.match(code, /Download the ZIP/);
    assert.match(code, /\/media\/upload-1/);
    assert.match(code, /\/media\/upload-2/);
  }
  const manifest = createCompositionManifest(input);
  assert.equal(manifest.media[0].requiresDownload, true);
  assert.equal(manifest.media[0].source, 'browser-upload');
  assert.doesNotMatch(JSON.stringify(manifest), /blob:/);
  assert.match(createIntegrationPrompt(input), /downloaded Intertext ZIP/);
  assert.doesNotMatch(createIntegrationPrompt(input), /blob:/);
});

function mockDownloads() {
  const calls = [];
  const fixtures = {
    '/media/concrete.jpg': { bytes: [255, 216, 255, 10], type: 'image/jpeg' },
    '/media/poster.webp': { bytes: [82, 73, 70, 70, 15], type: 'image/webp' },
    [`/releases/${version}/artifact-pill.js`]: { text: 'customElements.define("artifact-pill", class extends HTMLElement {});', type: 'text/javascript' },
    [`/releases/${version}/intertext-dev-${version}.tgz`]: { bytes: [31, 139, 8, 1, 2], type: 'application/gzip' },
    [`/releases/${version}/LICENSE`]: { text: 'MIT License', type: 'text/plain' },
    '/media/LICENSE.md': { text: '# Demo media licenses\nUnsplash and Pexels', type: 'text/plain' },
    '/fonts/instrument-serif-latin-400-normal.woff2': { bytes: [119, 79, 70, 50, 1], type: 'font/woff2' },
    '/fonts/instrument-serif-latin-ext-400-normal.woff2': { bytes: [119, 79, 70, 50, 2], type: 'font/woff2' },
    '/fonts/InstrumentSerif-OFL.txt': { text: 'SIL Open Font License', type: 'text/plain' },
  };
  const fetch = async url => {
    calls.push(url);
    if (url.startsWith('blob:')) return new Response(new Uint8Array([26, 69, 223, 163, 99]), { headers: { 'content-type': 'video/webm' } });
    const fixture = fixtures[new URL(url).pathname];
    if (!fixture) return new Response('missing', { status: 404 });
    return new Response(fixture.text ?? new Uint8Array(fixture.bytes), { headers: { 'content-type': fixture.type } });
  };
  return { fetch, calls, baseURL: 'https://preview.test/studio' };
}

test('HTML archive includes exact uploaded bytes, sample posters, local runtime and mapping without fetching remote media', async () => {
  const options = mockDownloads();
  const input = makeInput({ artifacts: [
    { id: '../../bad-name', position: 1, artifact: { src: 'blob:https://preview.test/something', poster: '/media/poster.webp', alt: 'Upload', kind: 'video' } },
    { id: 'again', position: 1, artifact: { src: 'blob:https://preview.test/something', alt: 'Shared', kind: 'video' } },
    { id: 'external', position: 2, artifact: { src: 'https://remote.test/photo.avif', alt: 'Remote' } },
  ] });
  const files = await buildCompositionFiles(input, 'html', options);
  const paths = files.map(file => file.path);
  const videoName = mediaName([26, 69, 223, 163, 99], 'webm');
  const posterName = mediaName([82, 73, 70, 70, 15], 'webp');
  assert.ok(paths.includes(`media/${videoName}`));
  assert.ok(paths.includes(`media/${posterName}`));
  assert.deepEqual([...files.find(file => file.path === `media/${videoName}`).bytes], [26, 69, 223, 163, 99]);
  assert.ok(paths.includes('artifact-pill.js'));
  assert.ok(paths.includes('LICENSE'));
  assert.ok(paths.includes('MEDIA-CREDITS.md'));
  assert.equal(options.calls.filter(url => url.startsWith('blob:')).length, 1);
  assert.equal(options.calls.some(url => url.includes('remote.test')), false);
  const html = content(files, 'index.html');
  assert.match(html, /src="\.\/artifact-pill\.js"/);
  assert.ok(html.includes(`src="./media/${videoName}"`));
  assert.ok(html.includes(`poster="./media/${posterName}"`));
  assert.doesNotMatch(html, /blob:|\.\.\/bad-name/);
  const manifest = JSON.parse(content(files, 'composition.json'));
  assert.equal(manifest.artifacts[0].artifact.src, `./media/${videoName}`);
  assert.equal(manifest.media[0].mime, 'video/webm');
  assert.equal(manifest.media.at(-1).bundled, false);
  assert.match(content(files, 'README.md'), /https:\/\/remote\.test\/photo\.avif/);
});

test('React archive includes installable package and correct public media plus local font assets', async () => {
  const options = mockDownloads();
  const input = makeInput({ font: { ...font, id: 'instrument-serif', name: 'Instrument Serif', family: "'Instrument Serif', Georgia, serif", stylesheetUrl: 'https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap' } });
  const files = await buildCompositionFiles(input, 'react', options);
  const imageName = mediaName([255, 216, 255, 10], 'jpg');
  assert.ok(files.some(file => file.path === `public/media/${imageName}`));
  assert.ok(files.some(file => file.path === `intertext-dev-${version}.tgz`));
  assert.ok(files.some(file => file.path === 'fonts/InstrumentSerif-OFL.txt'));
  assert.match(content(files, 'Headline.tsx'), new RegExp(`npm install \\./intertext-dev-${versionPattern}\\.tgz`));
  assert.match(content(files, 'Headline.tsx'), /import '\.\/fonts\.css'/);
  assert.ok(content(files, 'Headline.tsx').includes(`/media/${imageName}`));
  assert.match(content(files, 'fonts.css'), /\.\/fonts\/instrument-serif-latin-400-normal\.woff2/);
  assert.equal(options.calls.some(url => url.includes('fonts.googleapis.com')), false);
  assert.match(content(files, 'README.md'), /give each TSX file and its exported component a unique name/);
  const htmlFiles = await buildCompositionFiles(input, 'html', options);
  assert.match(content(htmlFiles, 'README.md'), /Also copy fonts\.css and the fonts\/ directory beside your HTML file/);
});

test('content filenames preserve earlier compositions and deduplicate identical bytes across distinct URLs', async () => {
  const first = await buildCompositionFiles(makeInput(), 'react', mockDownloads());
  const options = mockDownloads();
  const fetch = options.fetch;
  options.fetch = url => url.endsWith('/media/concrete.jpg') ? Promise.resolve(new Response(new Uint8Array([255, 216, 255, 11]), { headers: { 'content-type': 'image/jpeg' } })) : fetch(url);
  const second = await buildCompositionFiles(makeInput(), 'react', options);
  const firstPath = first.find(file => file.path.startsWith('public/media/')).path;
  const secondPath = second.find(file => file.path.startsWith('public/media/')).path;
  assert.notEqual(firstPath, secondPath, 'different bytes must not overwrite earlier media');
  const again = await buildCompositionFiles(makeInput(), 'react', mockDownloads());
  assert.equal(again.find(file => file.path.startsWith('public/media/')).path, firstPath, 'identical bytes use a stable filename');
  const duplicates = await buildCompositionFiles(makeInput({ artifacts: ['one', 'two'].map(id => ({ id, position: 1, artifact: { src: `blob:https://preview.test/${id}`, alt: id, kind: 'video' } })) }), 'html', mockDownloads());
  assert.equal(duplicates.filter(file => file.path.startsWith('media/')).length, 1);
  assert.doesNotThrow(() => createStoredZip(duplicates));
  const manifest = JSON.parse(content(duplicates, 'composition.json'));
  assert.equal(manifest.artifacts[0].artifact.src, manifest.artifacts[1].artifact.src);
});

test('hover expansion exports focusable media that the runtime toggles by tap or keyboard, without separate buttons', () => {
  const input = makeInput();
  const dom = withRuntime(generateExport(input, 'html'));
  const { document, KeyboardEvent } = dom.window;
  const pill = document.querySelector('artifact-pill');
  assert.equal(pill.tabIndex, 0);
  assert.equal(pill.hasAttribute('tab-index'), false);
  assert.equal(document.querySelector('button'), null, 'the pill itself is the touch and keyboard control');
  assert.equal(pill.getAttribute('role'), 'button');
  assert.equal(pill.getAttribute('aria-label'), 'Concrete');
  assert.equal(pill.getAttribute('aria-expanded'), 'false');
  pill.click(); // A tap ends with this click; touch pointers never start hover.
  assert.equal(pill.hasAttribute('expanded'), true);
  assert.equal(pill.getAttribute('aria-expanded'), 'true');
  pill.focus();
  pill.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(pill.hasAttribute('expanded'), false);
  assert.equal(pill.getAttribute('aria-expanded'), 'false');
  dom.window.close();
  const react = generateExport(input, 'react');
  assert.match(react, /tabIndex=\{0\}/);
  assert.match(react, /hoverExpand=\{true\}/);
  assert.doesNotMatch(react, /useState|aria-expanded| expanded=/);
  const staticInput = makeInput({ artifacts: [{ id: 'static', position: 1, artifact: { src: '/media/concrete.jpg', alt: 'Static' } }] });
  const staticReact = generateExport(staticInput, 'react');
  assert.doesNotMatch(staticReact, /useState|useRef|aria-expanded|tabIndex/);
  const staticHTML = new JSDOM(generateExport(staticInput, 'html')).window.document;
  assert.equal(staticHTML.querySelector('button'), null);
  assert.equal(staticHTML.querySelector('artifact-pill').tabIndex, -1);
});

test('looping pills export the runtime loop with one pause control that reduced motion hides', async () => {
  const input = makeInput({ artifacts: [
    { id: 'a', position: 1, artifact: { src: '/media/concrete.jpg', alt: 'First', loop: true, expanded: true } },
    { id: 'b', position: 2, artifact: { src: '/media/concrete.jpg', alt: 'Second', loop: true, hoverExpand: true } },
    { id: 'c', position: 3, artifact: { src: '/media/concrete.jpg', alt: 'Still', loop: false } },
  ] });
  const html = generateExport(input, 'html');
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{ \.intertext-loop-control \{ display: none; \} \}/);
  const dom = withRuntime(html);
  const pills = [...dom.window.document.querySelectorAll('artifact-pill')];
  const looping = () => pills.map(pill => pill.hasAttribute('loop'));
  assert.deepEqual(looping(), [true, true, false]);
  assert.equal(pills[0].hasAttribute('expanded'), false, 'the studio preview state is not exported');
  const buttons = dom.window.document.querySelectorAll('button');
  assert.equal(buttons.length, 1, 'one control pauses every loop');
  assert.equal(buttons[0].textContent, 'Pause animation');
  buttons[0].click();
  assert.deepEqual(looping(), [false, false, false]);
  assert.equal(buttons[0].textContent, 'Play animation');
  buttons[0].click();
  assert.deepEqual(looping(), [true, true, false]);
  dom.window.close();

  const react = generateExport(input, 'react');
  assert.equal(react.match(/loop=\{looping\}/g)?.length, 2);
  const compiled = ts.transpileModule(react, { reportDiagnostics: true, fileName: 'Headline.tsx', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual(compiled.diagnostics, []);
  const runnable = compiled.outputText
    .replace(/from "react\/jsx-runtime"/g, `from ${JSON.stringify(import.meta.resolve('react/jsx-runtime'))}`)
    .replace(/from 'react'/g, `from ${JSON.stringify(import.meta.resolve('react'))}`)
    .replace(/import \{ ArtifactPill \} from 'intertext-dev\/react';/, mockPill);
  const { default: Headline } = await import(`data:text/javascript;base64,${Buffer.from(runnable).toString('base64')}`);
  const rendered = new JSDOM(renderToStaticMarkup(React.createElement(Headline))).window.document;
  assert.deepEqual([...rendered.querySelectorAll('artifact-pill')].map(pill => pill.hasAttribute('loop')), [true, true, false]);
  assert.equal(rendered.querySelector('button.intertext-loop-control').textContent, 'Pause animation');

  assert.deepEqual(createCompositionManifest(input).artifacts.map(({ artifact }) => artifact.loop), [true, true, undefined]);
  assert.match(createIntegrationPrompt(input), /pause control for looping media/);
  const readme = content(await buildCompositionFiles(input, 'html', mockDownloads()), 'README.md');
  assert.match(readme, /Pause animation button stops looping pills/);
  assert.doesNotMatch(readme, /loops are omitted/);
});

test('missing release fails before creating a misleading download', async () => {
  const options = mockDownloads();
  const fetch = options.fetch;
  options.fetch = url => url.endsWith('artifact-pill.js') ? Promise.resolve(new Response('missing', { status: 404 })) : fetch(url);
  await assert.rejects(buildCompositionArchive(makeInput(), 'html', options), /Could not download.*artifact-pill\.js/);
});

test('downloads reject SPA fallback HTML even when release headers claim JavaScript or gzip', async () => {
  for (const format of ['html', 'react']) {
    const options = mockDownloads();
    const fetch = options.fetch;
    options.fetch = url => url.endsWith(format === 'html' ? 'artifact-pill.js' : '.tgz')
      ? Promise.resolve(new Response('<!doctype html><html>Studio fallback</html>', { headers: { 'content-type': format === 'html' ? 'text/javascript' : 'application/gzip' } }))
      : fetch(url);
    await assert.rejects(buildCompositionArchive(makeInput(), format, options), /server returned unexpected content/);
  }
  const options = mockDownloads();
  const fetch = options.fetch;
  options.fetch = url => url.endsWith('.tgz') ? Promise.resolve(new Response('not a gzip archive', { headers: { 'content-type': 'application/gzip' } })) : fetch(url);
  await assert.rejects(buildCompositionArchive(makeInput(), 'react', options), /server returned unexpected content/);
});

test('media has natural gaps at shared/start/end boundaries while original newlines remain', () => {
  const input = makeInput({ text: 'first\nsecond', artifacts: [0, 1, 1, 2].map((position, index) => ({ id: String(index), position, artifact: { src: '/media/x.jpg', alt: String(index) } })) });
  const document = new JSDOM(generateExport(input, 'html')).window.document;
  assert.equal(document.querySelector('h1').textContent, ' first\n  second ');
  assert.equal(new JSDOM(generateExport(makeInput({ text: ' \nα  β\n', artifacts: [] }), 'html')).window.document.querySelector('h1').textContent, ' \nα  β\n');
});

test('generated HTML audio controls play, pause, reflect ended state and announce rejected playback', async () => {
  const input = makeInput({ artifacts: [{ id: 'audio', position: 1, artifact: { src: '/media/sound.m4a', alt: 'A short sound', kind: 'audio', paused: false } }] });
  const dom = new JSDOM(generateExport(input, 'html'), {
    runScripts: 'dangerously',
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      class Pill extends window.HTMLElement {
        connectedCallback() {
          const root = this.attachShadow({ mode: 'open' });
          this.media = window.document.createElement('audio');
          this.active = false; this.finished = false;
          Object.defineProperty(this.media, 'paused', { get: () => !this.active });
          Object.defineProperty(this.media, 'ended', { get: () => this.finished });
          root.append(this.media);
        }
        async play() {
          if (this.fail) throw new Error('blocked');
          this.active = true; this.finished = false;
          this.media.dispatchEvent(new window.Event('play'));
        }
        pause() { this.active = false; this.media.dispatchEvent(new window.Event('pause')); }
      }
      window.customElements.define('artifact-pill', Pill);
    },
  });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  await settle();
  const button = dom.window.document.querySelector('button');
  const pill = dom.window.document.querySelector('artifact-pill');
  assert.equal(pill.hasAttribute('paused'), true, 'audio remains silent on load');
  assert.equal(button.textContent, 'Play audio');
  assert.equal(button.getAttribute('aria-label'), 'Play audio: A short sound');
  button.click(); await settle();
  assert.equal(button.textContent, 'Pause audio');
  assert.equal(button.getAttribute('aria-label'), 'Pause audio: A short sound');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  button.click(); await settle();
  assert.equal(button.textContent, 'Play audio');
  button.click(); await settle();
  pill.finished = true; pill.media.dispatchEvent(new dom.window.Event('ended')); await settle();
  assert.equal(button.textContent, 'Play audio');
  pill.fail = true;
  button.click(); await settle();
  assert.match(dom.window.document.querySelector('[role="status"]').textContent, /Playback could not start/);
  dom.window.close();
});

test('React media exports compile with visible controls and versioned download install instructions', async () => {
  const code = generateExport(makeInput({ artifacts: [{ id: 'a', position: 1, artifact: { src: '/media/sound.m4a', alt: 'Music', kind: 'audio' } }] }), 'react');
  assert.match(code, new RegExp(`npm install intertext-dev@${versionPattern}`));
  assert.match(code, /onClick=\{\(\) => void togglePlayback/);
  assert.match(code, /paused=\{true\}/);
  assert.match(code, /aria-live="polite"/);
  const compiled = ts.transpileModule(code, { reportDiagnostics: true, fileName: 'Headline.tsx', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual(compiled.diagnostics, []);
  const runnable = compiled.outputText
    .replace(/from "react\/jsx-runtime"/g, `from ${JSON.stringify(import.meta.resolve('react/jsx-runtime'))}`)
    .replace(/from 'react'/g, `from ${JSON.stringify(import.meta.resolve('react'))}`)
    .replace(/import \{ ArtifactPill \} from 'intertext-dev\/react';/, 'const ArtifactPill = () => null;');
  const { default: Headline } = await import(`data:text/javascript;base64,${Buffer.from(runnable).toString('base64')}`);
  const document = new JSDOM(renderToStaticMarkup(React.createElement(Headline))).window.document;
  assert.equal(document.querySelector('button').textContent, 'Play audio');
  assert.equal(document.querySelector('button').getAttribute('aria-label'), 'Play audio: Music');
});

test('ZIP output extracts with system unzip and rejects unsafe or duplicate paths', async () => {
  const blob = await buildCompositionArchive(makeInput(), 'html', mockDownloads());
  assert.equal(blob.type, 'application/zip');
  const directory = mkdtempSync(join(tmpdir(), 'intertext-export-'));
  try {
    const path = join(directory, 'composition.zip');
    writeFileSync(path, Buffer.from(await blob.arrayBuffer()));
    const result = execFileSync('/usr/bin/unzip', ['-t', path], { encoding: 'utf8' });
    assert.match(result, /No errors detected/);
    const html = execFileSync('/usr/bin/unzip', ['-p', path, 'index.html'], { encoding: 'utf8' });
    assert.match(html, /<h1 class="intertext-heading">/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const bytes = new Uint8Array([1]);
  for (const path of ['../escape', '/absolute', 'a/../escape', 'a\\escape']) assert.throws(() => createStoredZip([{ path, bytes }]), /Invalid/);
  assert.throws(() => createStoredZip([{ path: 'same', bytes }, { path: 'same', bytes }]), /duplicate/);
});

test('controls show short labels, keep full descriptions in accessible names and number repeated media', () => {
  const input = makeInput({ artifacts: [
    { id: 'a', position: 0, artifact: { src: '/media/a.mp4', alt: 'First clip', kind: 'video', hoverExpand: true } },
    { id: 'b', position: 1, artifact: { src: '/media/b.mp4', alt: 'Second clip', kind: 'video' } },
    { id: 'c', position: 2, artifact: { src: '/media/c.gif', alt: 'Record', kind: 'gif' } },
  ] });
  const buttons = [...new JSDOM(generateExport(input, 'html')).window.document.querySelectorAll('button')];
  assert.deepEqual(buttons.map(button => button.textContent), ['Play video 1', 'Play video 2', 'Play GIF']);
  assert.deepEqual(buttons.map(button => button.getAttribute('aria-label')), ['Play video 1: First clip', 'Play video 2: Second clip', 'Play GIF: Record']);
  const react = generateExport(input, 'react');
  assert.match(react, /"Pause video 1: First clip"/);
  assert.match(react, /\? "Pause video 2" : "Play video 2"/);
});

test('site appearance inherits the page typeface, color and size across HTML, React, kits and the agent prompt', async () => {
  const serif = { ...font, id: 'instrument-serif', name: 'Instrument Serif', family: "'Instrument Serif', Georgia, serif", stylesheetUrl: 'https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap' };
  const input = makeInput({ appearance: 'site', tag: 'p', font: serif });
  const html = generateExport(input, 'html');
  const document = new JSDOM(html).window.document;
  const paragraph = document.querySelector('p.intertext-heading');
  assert.ok(paragraph, 'the chosen element is used');
  assert.equal(paragraph.parentElement.hasAttribute('style'), false);
  assert.doesNotMatch(html, /font-family|color-scheme|--intertext-scale|@container|fonts\.googleapis|Instrument Serif/);
  assert.match(html, /--artifact-focus: currentColor/);
  assert.equal(paragraph.querySelector('artifact-pill').getAttribute('width'), '3.3em');
  assert.equal(document.querySelector('button'), null, 'hover pills are their own tap and keyboard control');

  const react = generateExport(input, 'react');
  assert.doesNotMatch(react, /CSSProperties|compositionStyle|fonts\.css|Instrument Serif/);
  const compiled = ts.transpileModule(react, { reportDiagnostics: true, fileName: 'Headline.tsx', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual(compiled.diagnostics, []);
  const runnable = compiled.outputText
    .replace(/from "react\/jsx-runtime"/g, `from ${JSON.stringify(import.meta.resolve('react/jsx-runtime'))}`)
    .replace(/from 'react'/g, `from ${JSON.stringify(import.meta.resolve('react'))}`)
    .replace(/import \{ ArtifactPill \} from 'intertext-dev\/react';/, 'const ArtifactPill = () => null;');
  const { default: Headline } = await import(`data:text/javascript;base64,${Buffer.from(runnable).toString('base64')}`);
  const rendered = new JSDOM(renderToStaticMarkup(React.createElement(Headline))).window.document;
  assert.equal(rendered.querySelector('p.intertext-heading').parentElement.hasAttribute('style'), false);

  const files = await buildCompositionFiles(input, 'html', mockDownloads());
  assert.equal(files.some(file => file.path.startsWith('fonts/') || file.path === 'fonts.css'), false);
  assert.match(content(files, 'index.html'), /Sample page styles for this preview/);
  assert.match(content(files, 'README.md'), /takes its typeface, color and size from your page/);
  assert.equal(JSON.parse(content(files, 'composition.json')).appearance, 'site');
  assert.match(createIntegrationPrompt(input), /use the site's own typography and colors/);
  assert.equal(createCompositionManifest(makeInput()).appearance, 'studio');
});

test('sample-page preview loads media and the runtime from the studio origin and keeps uploads readable', () => {
  const input = makeInput({ appearance: 'site', artifacts: [
    { id: 'a', position: 1, artifact: { src: '/media/concrete.jpg', alt: 'Concrete', hoverExpand: true } },
    { id: 'b', position: 2, artifact: { src: 'blob:https://preview.test/upload', alt: 'Upload', kind: 'video', poster: '/media/poster.webp' } },
  ] });
  const html = createPreviewPage(input, 'https://preview.test/studio');
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('script[type="module"]').getAttribute('src'), `https://preview.test/releases/${EXPORT_VERSION}/artifact-pill.js`);
  const pills = [...document.querySelectorAll('artifact-pill')];
  assert.deepEqual(pills.map(pill => pill.getAttribute('src')), ['https://preview.test/media/concrete.jpg', 'blob:https://preview.test/upload']);
  assert.equal(pills[1].getAttribute('poster'), 'https://preview.test/media/poster.webp');
  assert.match(html, /Sample page styles for this preview/);
  assert.match(document.body.firstElementChild.textContent, /^Sample page preview\. Your site’s own fonts/);
  assert.match(createPreviewPage(makeInput(), 'https://preview.test/studio'), /The Studio style brings its own fonts/);
});
