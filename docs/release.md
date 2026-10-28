# Release Intertext

Maintainer guide for Intertext releases. The public package identity is `intertext-dev`. Version 0.1.0 was deployed to `https://intertext.dev` and published to npm by `davidezhang` on October 26, 2026. The npm tarball and frozen website package are identical.

## Build and verify locally

```sh
pnpm install
pnpm check:release
```

`pnpm build:release` prepares just the library, archive, examples, and integration guide. `pnpm dev` runs this preparation before Vite. The build validates frozen snapshots in `releases/<version>/` and copies every frozen version into `public/releases/`, then includes them in `dist/site/releases/`. For a version without a snapshot, it creates a new candidate archive and manifest. The starter HTML compositions, integration guide, and installable skill with all of its references are copied into the site build too.

Version 0.1.0 is frozen in `releases/0.1.0/`: its browser module, package archive, MIT license, and `release.json` were downloaded from the public deployment and verified against its SHA-256 hashes. These exact bytes are the release record. Do not recreate or edit them. Generated files under `public/releases/` may be rebuilt from those snapshots.

Version 0.1.1 adds tap and keyboard toggling for `hover-expand` pills and the `loop` attribute. It is frozen in `releases/0.1.1/` from a tested local candidate and has not been deployed or published yet; step 4 of the freeze procedure below is the maintainer's remaining step.

For the current frozen version, the build compares every generated `dist/lib` file, the license, runtime package metadata, and installation hooks against the frozen package. A mismatch fails with a version-bump instruction before replacing generated downloads. README text, descriptive package metadata, and development scripts may change without repacking the frozen release. Such source updates therefore do not alter an already published package's README or metadata.

Install the generated tarball into a separate React project and verify `intertext-dev` and `intertext-dev/react` imports before releasing. Open the HTML recipes through an HTTP server, including at phone width. Skill format validation is separate from package tests; the skill also needs a realistic integration check in a clean consumer project.

## Website release

Website skill installation works independently of source repository visibility. The build exposes the distributable skill files through `/.well-known/agent-skills/index.json` and a legacy `/.well-known/skills/index.json`:

```sh
npx skills add https://intertext.dev
```

Deploy the complete `dist/site` output to make the versioned website install URLs work. After deployment, verify the actual responses and content types for the JavaScript module and tarball. Compare their SHA-256 hashes with `release.json` and check that the tarball has gzip content; the configured Cloudflare deployment returns real 404s for missing files, but an alternate host or deployment error can return an HTML fallback with HTTP 200 and a misleading MIME type. Verify the example routes, public documentation, and both native/React integrations using the remote release assets. Run the website skill install command in a temporary consumer project and verify that `SKILL.md`, its referenced integration guide, and `LICENSE` are installed. The modern discovery archive and its SHA-256 must match the served skill files.

## Freeze a new version

1. Increment `package.json`'s version for runtime, declaration, package-contract, or packaged-documentation changes. Update the studio's export/install URLs, skill reference, docs, and examples to the new version. Keep previous snapshots.
2. Run `pnpm check:release` and inspect the new files in `public/releases/<version>/`. The build retains every earlier frozen release alongside the candidate.
3. Copy the tested candidate's `artifact-pill.js`, package `.tgz`, `LICENSE`, and `release.json` into `releases/<version>/`. Commit this snapshot with the source change. Run `pnpm check:release` again so the frozen build comparison and hash checks cover it.
4. Publish/deploy those exact artifacts. Compare remote bytes with the committed manifest. Subsequent documentation or site builds will copy the snapshot without repacking it.

If recovering a release that was already published, retrieve its actual public files and verify them against its deployed manifest before freezing them. Do not substitute a local rebuild. Never remove a published snapshot when creating a new version.

## npm publication

Authenticate as the intended npm publisher, confirm ownership/availability of `intertext-dev`, and inspect the frozen package. Publish the archive itself with public access; do not run bare `npm publish`, which would repack the current source directory:

```sh
npm publish ./releases/0.1.0/intertext-dev-0.1.0.tgz --access public
```

Publication requires the maintainer's authorization and credentials; this repository does not perform it automatically. Use the corresponding frozen archive for later versions too.

After npm confirms publication, verify installation into a clean project before switching the docs and exports to `npm install intertext-dev`. Keep the versioned website release available for existing integrations. No account or npm login is needed to consume the deployed website tarball.
