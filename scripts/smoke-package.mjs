import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const filename = `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`;
const archive = resolve(root, `public/releases/${pkg.version}/${filename}`);
const fixture = await mkdtemp(join(tmpdir(), 'intertext-package-'));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: fixture, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout || `${command} failed`);
  return result.stdout;
}

try {
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'intertext-consumer-smoke', private: true, type: 'module' }));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  run(npm, ['install', archive, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false']);
  const modules = await readdir(join(fixture, 'node_modules'));
  assert.ok(!modules.includes('react'), 'HTML consumers must not need React');
  assert.ok(!modules.includes('motion'), 'Studio dependencies must not be installed');
  assert.ok(!modules.includes('dialkit'), 'Studio dependencies must not be installed');

  const installed = join(fixture, 'node_modules', pkg.name);
  assert.deepEqual((await readdir(installed)).sort(), ['LICENSE', 'README.md', 'dist', 'package.json']);
  for (const entry of Object.values(pkg.exports)) {
    await readFile(resolve(installed, entry.types));
    await readFile(resolve(installed, entry.import));
  }
  run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { registerArtifactPill, ArtifactPillElement } from ${JSON.stringify(pkg.name)};
    assert.equal(typeof ArtifactPillElement, 'function');
    assert.doesNotThrow(() => registerArtifactPill());
  `]);

  // Reuse this checkout's peers; the native-package installation above remains fully offline.
  for (const name of ['react', 'react-dom']) {
    await symlink(dirname(require.resolve(`${name}/package.json`)), join(fixture, 'node_modules', name), 'junction');
  }
  run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ArtifactPill, InlineArtifactsText } from ${JSON.stringify(`${pkg.name}/react`)};
    const html = renderToStaticMarkup(createElement(ArtifactPill, { src: '/demo.jpg', alt: 'Demo', hoverExpand: true }));
    assert.match(html, /<artifact-pill/);
    assert.match(html, /hover-expand=""/);
    assert.equal(typeof InlineArtifactsText, 'function');
  `]);
  console.log(`Package smoke passed: ${pkg.name}@${pkg.version}, offline HTML install and React SSR.`);
} finally {
  await rm(fixture, { recursive: true, force: true });
}
