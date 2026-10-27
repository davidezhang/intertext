import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageFilename = pkg => `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

async function filesBelow(directory, prefix = '') {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) paths.push(...await filesBelow(resolve(directory, entry.name), `${path}/`));
    else if (entry.isFile()) paths.push(path);
    else throw new Error(`Release files must not be links: ${path}`);
  }
  return paths.sort();
}

function tar(archive, args) {
  const result = spawnSync('tar', [...args, archive], { maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.toString() || 'Could not read frozen package');
  return result.stdout;
}

function archiveFile(archive, path) {
  const result = spawnSync('tar', ['-xzOf', archive, path], { maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.toString() || `Missing frozen package file: ${path}`);
  return result.stdout;
}

async function readSnapshot(directory, version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid frozen release directory: ${version}`);
  const bytes = await readFile(resolve(directory, 'release.json'));
  const manifest = JSON.parse(bytes);
  if (manifest.version !== version || typeof manifest.name !== 'string') throw new Error(`Invalid frozen release manifest: ${version}`);
  const filenames = ['artifact-pill.js', 'LICENSE', packageFilename(manifest)].sort();
  if (stable(Object.keys(manifest.files || {}).sort()) !== stable(filenames)) throw new Error(`Unexpected frozen release files: ${version}`);
  const files = new Map([['release.json', bytes]]);
  for (const filename of filenames) {
    const metadata = manifest.files[filename];
    if (filename.includes('/') || filename.includes('\\') || metadata.url !== `/releases/${version}/${filename}`) throw new Error(`Invalid frozen release path: ${filename}`);
    const content = await readFile(resolve(directory, filename));
    if (content.length !== metadata.bytes || digest(content) !== metadata.sha256) throw new Error(`Frozen release ${version} failed hash verification: ${filename}`);
    files.set(filename, content);
  }
  return { directory, manifest, files };
}

async function verifyCurrentBuild(root, pkg, snapshot) {
  const mismatch = detail => new Error(`Frozen release ${pkg.version} differs from this build (${detail}). Bump the package version and update integration URLs; do not replace the published snapshot.`);
  if (snapshot.manifest.name !== pkg.name) throw mismatch('package name');
  const archive = resolve(snapshot.directory, packageFilename(pkg));
  const frozenPackage = JSON.parse(archiveFile(archive, 'package/package.json'));
  // Descriptive metadata, README, docs and development commands may evolve while
  // the installed runtime contract remains identical to the published package.
  const fields = ['name', 'version', 'type', 'license', 'exports', 'main', 'module', 'types', 'typings', 'browser', 'bin', 'files', 'sideEffects', 'dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'engines'];
  for (const field of fields) if (stable(pkg[field]) !== stable(frozenPackage[field])) throw mismatch(`package.json ${field}`);
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (pkg.scripts?.[hook] !== frozenPackage.scripts?.[hook]) throw mismatch(`package.json scripts.${hook}`);
  }
  if (!(await readFile(resolve(root, 'LICENSE'))).equals(snapshot.files.get('LICENSE'))) throw mismatch('LICENSE');
  const builtPaths = await filesBelow(resolve(root, 'dist/lib'));
  const archivePaths = tar(archive, ['-tzf']).toString().trim().split('\n')
    .filter(path => path.startsWith('package/dist/lib/') && !path.endsWith('/'))
    .map(path => path.slice('package/dist/lib/'.length)).sort();
  if (stable(builtPaths) !== stable(archivePaths)) throw mismatch('dist/lib file list');
  for (const path of builtPaths) {
    if (!(await readFile(resolve(root, 'dist/lib', path))).equals(archiveFile(archive, `package/dist/lib/${path}`))) throw mismatch(`dist/lib/${path}`);
  }
  if (!(await readFile(resolve(root, 'dist/lib/artifact-pill.js'))).equals(snapshot.files.get('artifact-pill.js'))) throw mismatch('standalone browser module');
}

/** Stage immutable releases without repacking published versions. No network required. */
export async function prepareRuntimeRelease(root, pkg) {
  const snapshotsRoot = resolve(root, 'releases');
  let entries;
  try { entries = await readdir(snapshotsRoot, { withFileTypes: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; entries = []; }
  const snapshots = [];
  for (const entry of entries) {
    if (entry.isDirectory()) snapshots.push(await readSnapshot(resolve(snapshotsRoot, entry.name), entry.name));
  }
  const current = snapshots.find(snapshot => snapshot.manifest.version === pkg.version);
  if (current) await verifyCurrentBuild(root, pkg, current);

  // Validate everything before replacing the generated directory. Copy every old
  // version as well as the current one so a new deployment cannot remove downloads.
  const output = resolve(root, 'public/releases');
  await rm(output, { recursive: true, force: true });
  for (const snapshot of snapshots) {
    const directory = resolve(output, snapshot.manifest.version);
    await mkdir(directory, { recursive: true });
    for (const [name, bytes] of snapshot.files) await writeFile(resolve(directory, name), bytes);
  }
  if (current) return packageFilename(pkg);

  const releasePath = `/releases/${pkg.version}`;
  const releaseDir = resolve(output, pkg.version);
  await mkdir(releaseDir, { recursive: true });
  await copyFile(resolve(root, 'dist/lib/artifact-pill.js'), resolve(releaseDir, 'artifact-pill.js'));
  await copyFile(resolve(root, 'LICENSE'), resolve(releaseDir, 'LICENSE'));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packed = spawnSync(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', releaseDir], { cwd: root, encoding: 'utf8' });
  if (packed.error) throw packed.error;
  if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout || 'npm pack failed');
  const [archive] = JSON.parse(packed.stdout);
  const manifest = { name: pkg.name, version: pkg.version, files: {} };
  for (const filename of ['artifact-pill.js', 'LICENSE', archive.filename]) {
    const content = await readFile(resolve(releaseDir, filename));
    manifest.files[filename] = { url: `${releasePath}/${filename}`, bytes: content.length, sha256: digest(content) };
  }
  await writeFile(resolve(releaseDir, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return archive.filename;
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const releasePath = `/releases/${pkg.version}`;
  const archiveFilename = await prepareRuntimeRelease(root, pkg);

  // Vite serves public/ during development and copies it into dist/site on build.
  const examplesDir = resolve(root, 'public/examples');
  await rm(examplesDir, { recursive: true, force: true });
  await mkdir(examplesDir, { recursive: true });
  for (const entry of await readdir(resolve(root, 'examples'), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const html = (await readFile(resolve(root, 'examples', entry.name), 'utf8'))
      .replaceAll('../dist/lib/artifact-pill.js', `${releasePath}/artifact-pill.js`);
    await writeFile(resolve(examplesDir, entry.name), html);
  }
  const target = resolve(root, 'public/docs/integration.md');
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, 'docs/integration.md'), target);

  // Website discovery keeps skill installation independent of repository visibility.
  // Current clients verify the complete archive; the legacy index lists every file.
  const skillDir = resolve(root, 'skills/intertext');
  async function skillFiles(directory, prefix = '') {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) result.push(...await skillFiles(resolve(directory, entry.name), `${path}/`));
      else if (entry.isFile()) result.push(path);
      else throw new Error(`Skill distribution does not support links: ${path}`);
    }
    return result.sort();
  }
  const skillPaths = await skillFiles(skillDir);
  const skillMarkdown = await readFile(resolve(skillDir, 'SKILL.md'), 'utf8');
  const frontmatter = skillMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  function skillField(name) {
    const value = frontmatter?.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1].trim();
    if (!value) throw new Error(`The skill needs a single-line ${name} field.`);
    return value.startsWith('"') ? JSON.parse(value) : value.startsWith("'") ? value.slice(1, -1).replaceAll("''", "'") : value;
  }
  const skillName = skillField('name');
  const description = skillField('description');
  if (skillName !== 'intertext' || description.length > 1024) throw new Error('Invalid Intertext discovery metadata.');
  for (const directoryName of ['agent-skills', 'skills']) {
    const directory = resolve(root, `public/.well-known/${directoryName}`);
    await rm(directory, { recursive: true, force: true });
    for (const path of skillPaths) {
      const destination = resolve(directory, skillName, path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(skillDir, path), destination);
    }
    let index;
    if (directoryName === 'agent-skills') {
      const archiveName = `${skillName}.tar.gz`;
      const archivePath = resolve(directory, archiveName);
      const packedSkill = spawnSync('tar', ['--no-xattrs', '-czf', archivePath, '-C', skillDir, ...skillPaths], {
        cwd: root, encoding: 'utf8', env: { ...process.env, COPYFILE_DISABLE: '1' },
      });
      if (packedSkill.error) throw packedSkill.error;
      if (packedSkill.status !== 0) throw new Error(packedSkill.stderr || 'Could not create the skill archive.');
      const digest = createHash('sha256').update(await readFile(archivePath)).digest('hex');
      index = {
        $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
        skills: [{ name: skillName, description, type: 'archive', url: `./${archiveName}`, digest: `sha256:${digest}` }],
      };
    } else {
      index = { skills: [{ name: skillName, description, files: skillPaths }] };
    }
    await writeFile(resolve(directory, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  }

  console.log(`Prepared ${pkg.name}@${pkg.version}: ${releasePath}/${archiveFilename}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
