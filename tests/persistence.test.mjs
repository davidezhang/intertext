import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Studio modules import each other, so each one is transpiled and linked to its dependencies' data URLs.
const modules = { motion: import.meta.resolve('motion') };
function link(name) {
  const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  const code = outputText.replace(/from '(?:\.\/)?([\w-]+)'/g, (_, specifier) => `from '${modules[specifier]}'`);
  modules[name] = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return import(modules[name]);
}
const { artifactProps, createPill, exportArtifacts, isMediaMissing, missingMedia, samples } = await link('studio-model');
const { studioFonts } = await link('studio-fonts');
const { compileTransition } = await link('studio-motion');
const { buildCompositionFiles, createCompositionManifest } = await link('studio-export');
const { importComposition, loadComposition, missingMediaNote, readCompositionFile, restoreComposition, saveComposition, serializeComposition, storageKey } = await link('studio-persistence');

const sample = id => ({ ...samples.find(item => item.id === id) });
const timed = transition => ({ transition, ...compileTransition(transition) });
const pill = (number, overrides) => ({ ...createPill(`pill-${number}`, number, 0), ...overrides });
const upload = { id: 'upload', name: 'photo.png', kind: 'image', src: 'blob:https://preview.test/photo', alt: 'My photo' };

/** One pill per media source, each with its own shape, motion and playback settings. */
function studio() {
  return {
    text: 'Revise\nthe kit  later, with care.', font: studioFonts[1], fontSize: 125, dark: false, viewport: 'mobile',
    pills: [
      pill(1, { position: 0, media: { ...sample('concrete'), alt: 'Edited description' }, width: 1.4, height: .8, radius: 12, fit: 'fit', focalX: 20, focalY: 80,
        expandedWidth: 4, expandedHeight: 2, hover: true, ...timed({ type: 'easing', duration: 1.2, ease: [.1, -.2, .8, 1.3] }) }),
      pill(2, { position: 2, media: sample('architecture'), paused: true, playOnHover: true, ...timed({ type: 'spring', visualDuration: .4, bounce: .4 }) }),
      pill(4, { position: 3, media: sample('soundtrack'), paused: true, radius: 0, ...timed({ type: 'spring', stiffness: 160, damping: 12, mass: 1 }) }),
      pill(5, { position: 6, media: { id: 'url', name: 'Linked media', kind: 'video', src: 'https://media.example/clip.webm', alt: 'A linked clip' }, fit: 'fill', paused: false }),
      pill(7, { position: 6, media: upload, width: 4.5, loop: true, expanded: true }),
    ],
  };
}
const exportInput = ({ text, pills, font, fontSize, dark }) => ({ text, artifacts: exportArtifacts(pills, dark), font, fontSize, dark });
/** What a kit can carry back: everything but preview state, the viewport and the bytes of uploads. */
function reopened(composition, uploadName) {
  const { viewport, ...rest } = composition;
  return { ...rest, pills: composition.pills.map(item => ({ ...item, expanded: false,
    media: item.media.id === 'upload' ? missingMedia(uploadName, item.media.kind, item.media.alt) : item.media })) };
}

function mockDownloads() {
  const fixtures = {
    '/media/concrete.jpg': 'image/jpeg', '/media/escalator-motion.mp4': 'video/mp4', '/media/escalator-motion.jpg': 'image/jpeg',
    '/media/intertext-music.m4a': 'audio/mp4', [`/releases/${version}/intertext-dev-${version}.tgz`]: 'application/gzip',
    [`/releases/${version}/artifact-pill.js`]: 'text/javascript', [`/releases/${version}/LICENSE`]: 'text/plain', '/media/LICENSE.md': 'text/plain',
    '/fonts/instrument-serif-latin-400-normal.woff2': 'font/woff2', '/fonts/instrument-serif-latin-ext-400-normal.woff2': 'font/woff2', '/fonts/InstrumentSerif-OFL.txt': 'text/plain',
  };
  const fetch = async url => {
    if (url.startsWith('blob:')) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
    const { pathname } = new URL(url);
    const type = fixtures[pathname];
    if (!type) return new Response('missing', { status: 404 });
    const bytes = pathname.endsWith('.tgz') ? [31, 139, 8] : pathname.endsWith('.woff2') ? [...Buffer.from(`wOF2${pathname}`)] : [...Buffer.from(pathname)];
    return new Response(new Uint8Array(bytes), { headers: { 'content-type': type } });
  };
  return { fetch, baseURL: 'https://preview.test/studio' };
}
const kitFile = (files, path) => JSON.parse(new TextDecoder().decode(files.find(file => file.path === path).bytes));

test('a composition survives its manifest: export, import, then the same composition', () => {
  const composition = studio();
  const manifest = JSON.parse(JSON.stringify(createCompositionManifest(exportInput(composition))));
  assert.deepEqual(manifest.artifacts.map(item => item.transition), composition.pills.map(item => item.transition));
  const restored = importComposition(manifest);
  assert.deepEqual(restored, reopened(composition, 'upload-1'));
  assert.equal(restored.pills[0].name, 'Pill 1');
  assert.equal(restored.pills.at(-1).name, 'Pill 7', 'studio ids keep their pill names');
});

test('a downloaded kit reopens from its composition.json as the same composition', async () => {
  const composition = studio();
  const uploadName = `media-${createHash('sha256').update(new Uint8Array([137, 80, 78, 71])).digest('hex')}.png`;
  for (const format of ['html', 'react']) {
    const files = await buildCompositionFiles(exportInput(composition), format, mockDownloads());
    const manifest = kitFile(files, 'composition.json');
    assert.ok(manifest.artifacts.every(item => !item.artifact.src.startsWith('blob:') && !item.artifact.src.includes('intertext.dev')), 'kit media uses local paths');
    assert.deepEqual(importComposition(manifest), reopened(composition, uploadName), `${format} kit`);
    assert.match(new TextDecoder().decode(files.find(file => file.path === 'README.md').bytes), /Open composition/);
  }
});

test('kits exported before transitions were saved keep their exact curves', () => {
  const composition = studio();
  const manifest = createCompositionManifest(exportInput(composition));
  for (const item of manifest.artifacts) delete item.transition;
  const restored = importComposition(manifest);
  assert.deepEqual(restored.pills.map(({ duration, easing }) => ({ duration, easing })), composition.pills.map(({ duration, easing }) => ({ duration, easing })));
  assert.deepEqual(restored.pills[0].transition, composition.pills[0].transition, 'a Bézier rebuilds its editor values');
  assert.deepEqual(restored.pills.map(item => item.transition.type), ['easing', 'spring', 'spring', 'easing', 'easing']);
});

test('composition files are untrusted: types, ranges and media are validated and unknown fields ignored', () => {
  assert.throws(() => importComposition(null), /composition\.json/);
  assert.throws(() => importComposition({ schemaVersion: '1', text: '', artifacts: [] }), /composition\.json/);
  assert.throws(() => importComposition({ schemaVersion: 2, text: '', artifacts: [] }), /newer version/);
  assert.throws(() => importComposition({ schemaVersion: 1, text: 'No artifacts' }), /composition\.json/);
  const restored = importComposition({
    schemaVersion: 1, text: 'One two\r\nthree', theme: 'neon', unknown: { anything: true },
    typography: { font: { id: 'instrument-serif', family: "x; background: url('https://tracker.example')" }, scale: 900 },
    media: ['junk', null, { artifactId: 'pill-2', property: 'src', source: 'javascript:alert(1)' }],
    artifacts: [
      'not an artifact', null, { id: 'pill-1' },
      { id: 'pill-2', position: 99, extra: '<script>', artifact: { src: 'javascript:alert(1)', kind: 'flash', fit: 'cover', width: '99em', height: '-3em', radius: '12%', position: 'left top',
        duration: '1s', easing: 'steps(2); color: red', expandedWidth: 7, hoverExpand: 'yes', paused: 1, alt: 42 }, transition: { type: 'spring', stiffness: 1e9, damping: -5, mass: 'heavy' } },
      { id: 'pill-2', position: -4.6, artifact: { src: 'data:image/svg+xml,<svg onload=alert(1)>', alt: 'Data' } },
      { id: '__proto__', position: 1.6, artifact: { src: 'https://media.example/a.jpg', poster: 'javascript:alert(1)', alt: 'Remote' }, transition: { type: 'easing', duration: 9, ease: [3, 5, -2, -9] } },
    ],
  });
  assert.equal(restored.text, 'One two\nthree');
  assert.equal(restored.font, studioFonts[1], 'fonts come from the studio list, never from file CSS');
  assert.equal(restored.fontSize, 160);
  assert.equal(restored.dark, true);
  assert.deepEqual(restored.pills.map(item => [item.id, item.name, item.position]), [['pill-2', 'Pill 2', 3], ['pill-3', 'Pill 3', 0], ['pill-4', 'Pill 4', 2]]);
  const [scripted, data, remote] = restored.pills;
  assert.deepEqual(scripted.media, missingMedia('Uploaded media', 'image', ''));
  assert.deepEqual([scripted.width, scripted.height, scripted.radius, scripted.fit, scripted.focalX, scripted.focalY, scripted.expandedWidth], [6, .35, 200, 'crop', 50, 50, 5.12]);
  assert.deepEqual(scripted.transition, { type: 'spring', stiffness: 1000, damping: 1, mass: 1 });
  assert.deepEqual({ duration: scripted.duration, easing: scripted.easing }, compileTransition(scripted.transition));
  assert.deepEqual([scripted.hover, scripted.paused, scripted.playOnHover, 'extra' in scripted], [false, false, false, false]);
  assert.deepEqual(data.media, missingMedia('Uploaded media', 'image', 'Data'));
  assert.deepEqual(remote.media, { id: 'url', name: 'Linked media', kind: 'image', src: 'https://media.example/a.jpg', alt: 'Remote' });
  assert.deepEqual(remote.transition, { type: 'easing', duration: 2, ease: [1, 2, 0, -1] });
  assert.equal(remote.easing, 'cubic-bezier(1, 2, 0, -1)');
  assert.equal(Object.getPrototypeOf(remote), Object.prototype);
  for (const item of restored.pills) assert.match(artifactProps(item, true, false).src, item.media.id === 'url' ? /^https:\/\/media\.example\// : /^data:image\/svg\+xml,/);
});

test('opening a file is bounded and explains what to choose instead', async () => {
  const many = { schemaVersion: 1, text: 'Many', artifacts: Array.from({ length: 250 }, () => ({ position: 0, artifact: { src: '/media/concrete.jpg', alt: '' } })) };
  assert.equal(importComposition(many).pills.length, 200);
  await assert.rejects(readCompositionFile(new Blob(['PK\u0003\u0004 zip bytes'])), /Unzip the kit first/);
  await assert.rejects(readCompositionFile(new Blob(['{"schemaVersion":1,', ' '.repeat(1_000_001)])), /too large/);
  await assert.rejects(readCompositionFile(new Blob(['<!doctype html>'])), /composition\.json/);
  const opened = await readCompositionFile(new Blob([JSON.stringify(createCompositionManifest(exportInput(studio())))]));
  assert.deepEqual(opened, reopened(studio(), 'upload-1'));
});

test('autosave restores the same composition, with uploads waiting to be uploaded again', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const composition = studio();
  const snapshot = serializeComposition(composition);
  assert.equal(snapshot, serializeComposition({ ...composition, pills: composition.pills.map(item => ({ ...item, expanded: !item.expanded })) }), 'preview loops do not rewrite storage');
  assert.doesNotMatch(snapshot, /blob:/);
  assert.equal(saveComposition(snapshot, storage), true);
  assert.ok(values.has(storageKey));
  const restored = loadComposition(storage);
  assert.deepEqual(restored, { ...composition, pills: composition.pills.map(item => ({ ...item, expanded: false,
    media: item.media.id === 'upload' ? missingMedia('photo.png', 'image', 'My photo') : item.media })) });
  assert.equal(restored.pills.at(-1).loop, true);
  assert.ok(isMediaMissing(restored.pills.at(-1).media));
  assert.equal(missingMediaNote(restored.pills), '1 pill needs its media uploaded again.');
  assert.equal(missingMediaNote([...restored.pills, restored.pills.at(-1)]), '2 pills need their media uploaded again.');
  assert.equal(missingMediaNote(composition.pills), '');
  assert.equal(serializeComposition(restored), snapshot, 'a restored composition saves the same snapshot');
});

test('blocked, full or damaged storage never stops the studio', () => {
  const blocked = { getItem() { throw new DOMException('Blocked', 'SecurityError'); }, setItem() { throw new DOMException('Full', 'QuotaExceededError'); } };
  assert.equal(loadComposition(blocked), null);
  assert.equal(saveComposition('{}', blocked), false);
  assert.equal(loadComposition(null), null);
  assert.equal(saveComposition('{}', null), false);
  for (const saved of ['{', 'null', '{"version":2,"text":"","pills":[]}', '{"version":1,"text":5,"pills":[]}']) {
    assert.equal(loadComposition({ getItem: () => saved }), null, saved);
  }
  assert.equal(restoreComposition({ version: 1, text: 'Hi', pills: 'none' }), null);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('Blocked', 'SecurityError'); } });
  try {
    assert.equal(loadComposition(), null);
    assert.equal(saveComposition('{}'), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage;
  }
});

test('a pill with missing media keeps its shape behind a themed placeholder', () => {
  const missing = pill(3, { media: missingMedia('clip.mp4', 'video', 'A clip'), width: 2, playOnHover: true, paused: false, fit: 'fit', focalX: 10 });
  const dark = artifactProps(missing, true, false);
  const light = artifactProps(missing, false, false);
  assert.match(dark.src, /^data:image\/svg\+xml,/);
  assert.notEqual(dark.src, light.src);
  assert.deepEqual([dark.kind, dark.fit, dark.position, dark.poster, dark.playOnHover, dark.width], ['image', 'crop', '50% 50%', undefined, false, '2em']);
  assert.match(dark['aria-label'], /pill 3: media missing, upload it again/);
  assert.equal(artifactProps(pill(3, {}), true, false).src, samples[2].src);
});
