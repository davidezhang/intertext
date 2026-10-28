import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import ts from 'typescript';
import { gunzipSync } from 'node:zlib';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRuntimeRelease } from '../scripts/prepare-release.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const pkg = JSON.parse(read('package.json'));

async function frozenFixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'intertext-frozen-release-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const snapshot = new URL('releases/0.1.0/', root);
  execFileSync('tar', ['-xzf', fileURLToPath(new URL('intertext-dev-0.1.0.tgz', snapshot)), '-C', temporary]);
  const directory = join(temporary, 'package');
  await mkdir(join(directory, 'releases'), { recursive: true });
  await cp(snapshot, join(directory, 'releases/0.1.0'), { recursive: true });
  return { directory, pkg: JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) };
}

test('published release bytes survive README and descriptive metadata changes', async t => {
  const fixture = await frozenFixture(t);
  fixture.pkg.description = 'Updated public onboarding';
  fixture.pkg.homepage = 'https://intertext.dev';
  await writeFile(join(fixture.directory, 'README.md'), '# New source documentation\n');
  await writeFile(join(fixture.directory, 'package.json'), JSON.stringify(fixture.pkg));
  await prepareRuntimeRelease(fixture.directory, fixture.pkg);
  for (const name of ['artifact-pill.js', 'intertext-dev-0.1.0.tgz', 'LICENSE', 'release.json']) {
    assert.deepEqual(await readFile(join(fixture.directory, 'public/releases/0.1.0', name)), readFileSync(new URL(`releases/0.1.0/${name}`, root)));
  }
});

test('changed runtime bytes or package contract require a new version before replacing generated downloads', async t => {
  for (const change of ['runtime', 'types', 'exports', 'install-hook']) {
    await t.test(change, async t => {
      const fixture = await frozenFixture(t);
      await mkdir(join(fixture.directory, 'public/releases'), { recursive: true });
      await writeFile(join(fixture.directory, 'public/releases/unchanged.txt'), 'previous build');
      if (change === 'runtime') await writeFile(join(fixture.directory, 'dist/lib/react.js'), 'export const changed = true;');
      if (change === 'types') await writeFile(join(fixture.directory, 'dist/lib/react.d.ts'), 'export declare const changed: boolean;');
      if (change === 'exports') fixture.pkg.exports['./new-entry'] = './dist/lib/new-entry.js';
      if (change === 'install-hook') fixture.pkg.scripts.postinstall = 'node setup.js';
      await assert.rejects(prepareRuntimeRelease(fixture.directory, fixture.pkg), /Bump the package version/);
      assert.equal(await readFile(join(fixture.directory, 'public/releases/unchanged.txt'), 'utf8'), 'previous build');
    });
  }
});

test('corrupt frozen release files fail manifest verification', async t => {
  const fixture = await frozenFixture(t);
  await writeFile(join(fixture.directory, 'releases/0.1.0/artifact-pill.js'), 'corrupted');
  await assert.rejects(prepareRuntimeRelease(fixture.directory, fixture.pkg), /failed hash verification: artifact-pill.js/);
});

test('a new package version is generated while all earlier frozen downloads remain intact', async t => {
  const fixture = await frozenFixture(t);
  fixture.pkg.version = '0.1.1';
  await writeFile(join(fixture.directory, 'package.json'), JSON.stringify(fixture.pkg));
  assert.equal(await prepareRuntimeRelease(fixture.directory, fixture.pkg), 'intertext-dev-0.1.1.tgz');
  const manifest = JSON.parse(await readFile(join(fixture.directory, 'public/releases/0.1.1/release.json'), 'utf8'));
  assert.equal(manifest.version, '0.1.1');
  const archive = await readFile(join(fixture.directory, 'public/releases/0.1.1/intertext-dev-0.1.1.tgz'));
  assert.equal(createHash('sha256').update(archive).digest('hex'), manifest.files['intertext-dev-0.1.1.tgz'].sha256);
  for (const name of ['artifact-pill.js', 'intertext-dev-0.1.0.tgz', 'LICENSE', 'release.json']) {
    assert.deepEqual(await readFile(join(fixture.directory, 'public/releases/0.1.0', name)), readFileSync(new URL(`releases/0.1.0/${name}`, root)));
  }
});

test('native release is one self-contained browser module with its license', () => {
  const code = read('dist/lib/artifact-pill.js');
  const source = ts.createSourceFile('artifact-pill.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function inspect(node) {
    assert.ok(!ts.isImportDeclaration(node), 'Browser file must not import sibling chunks or dependencies');
    assert.ok(!(ts.isExportDeclaration(node) && node.moduleSpecifier), 'Browser file must not re-export sibling chunks');
    assert.ok(!(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword), 'Browser file must not dynamically import dependencies');
    ts.forEachChild(node, inspect);
  }
  inspect(source);
  assert.ok(code.includes(read('LICENSE').trim()), 'Standalone copies must retain the full MIT notice');
  assert.equal(read(`public/releases/${pkg.version}/artifact-pill.js`), code);
});

test('public release manifest identifies and verifies the exact distributable files', () => {
  const manifest = JSON.parse(read(`public/releases/${pkg.version}/release.json`));
  assert.equal(manifest.name, pkg.name);
  assert.equal(manifest.version, pkg.version);
  const archive = `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`;
  assert.deepEqual(Object.keys(manifest.files).sort(), ['LICENSE', 'artifact-pill.js', archive].sort());
  for (const [filename, metadata] of Object.entries(manifest.files)) {
    const file = readFileSync(new URL(`public/releases/${pkg.version}/${filename}`, root));
    assert.equal(metadata.url, `/releases/${pkg.version}/${filename}`);
    assert.equal(metadata.bytes, file.byteLength);
    assert.equal(metadata.sha256, createHash('sha256').update(file).digest('hex'));
  }
});

test('website examples and integration guide ship with working local runtime paths', () => {
  assert.equal(read('public/docs/integration.md'), read('docs/integration.md'));
  const exampleNames = readdirSync(new URL('examples/', root)).filter(name => name.endsWith('.html'));
  assert.ok(exampleNames.length > 0);
  for (const name of exampleNames) {
    const html = read(`public/examples/${name}`);
    assert.doesNotMatch(html, /\.\.\/dist\/lib/);
    const module = html.match(/<script\b[^>]*\bsrc=["']([^"']*artifact-pill\.js)["']/);
    assert.ok(module, `${name} must load the Intertext runtime`);
    const websiteURL = new URL(module[1], `https://intertext.example/examples/${name}`);
    assert.equal(websiteURL.pathname, `/releases/${pkg.version}/artifact-pill.js`);
    assert.ok(existsSync(new URL(`public${websiteURL.pathname}`, root)));
  }
});

test('docs, skill and examples install the version being built', () => {
  const examples = readdirSync(new URL('examples/', root)).filter(name => name.endsWith('.html')).map(name => `examples/${name}`);
  for (const path of ['README.md', 'docs/integration.md', 'skills/intertext/SKILL.md', 'skills/intertext/references/integration.md', ...examples]) {
    const text = read(path);
    for (const [reference, version] of text.matchAll(/(?:releases\/|intertext-dev[@-]|version: ")(\d+\.\d+\.\d+)/g)) assert.equal(version, pkg.version, `${path}: ${reference}`);
  }
});

test('website skill discovery contains the exact skill, references and license', () => {
  const list = (path, prefix = '') => readdirSync(new URL(path, root), { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.')) return [];
    return entry.isDirectory() ? list(`${path}/${entry.name}`, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`];
  }).sort();
  const paths = list('skills/intertext');
  assert.ok(paths.includes('SKILL.md'));
  assert.ok(paths.includes('LICENSE'));
  assert.ok(paths.some(path => path.startsWith('references/')));
  const legacy = JSON.parse(read('public/.well-known/skills/index.json'));
  assert.deepEqual(legacy.skills[0].files, paths);
  for (const directory of ['agent-skills', 'skills']) {
    for (const path of paths) assert.equal(read(`public/.well-known/${directory}/intertext/${path}`), read(`skills/intertext/${path}`));
  }
  const index = JSON.parse(read('public/.well-known/agent-skills/index.json'));
  assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  assert.equal(index.skills[0].name, 'intertext');
  assert.equal(index.skills[0].type, 'archive');
  assert.equal(index.skills[0].description, legacy.skills[0].description);
  const archive = readFileSync(new URL(index.skills[0].url, new URL('public/.well-known/agent-skills/index.json', root)));
  assert.equal(index.skills[0].digest, `sha256:${createHash('sha256').update(archive).digest('hex')}`);
  const tar = gunzipSync(archive);
  const unpacked = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString().split('\0')[0];
    const size = parseInt(header.subarray(124, 136).toString().split('\0')[0].trim() || '0', 8);
    assert.ok(Number.isFinite(size) && size >= 0);
    offset += 512;
    if (header[156] === 48 || header[156] === 0) unpacked.set(name, tar.subarray(offset, offset + size));
    offset += Math.ceil(size / 512) * 512;
  }
  assert.deepEqual([...unpacked.keys()].sort(), paths);
  for (const path of paths) assert.equal(unpacked.get(path).toString(), read(`skills/intertext/${path}`));
});
