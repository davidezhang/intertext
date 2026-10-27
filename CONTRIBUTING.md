# Contributing to Intertext

Intertext's core, React bindings, integration skill, and studio are MIT licensed. Contributions should make inline media easier to integrate into real websites.

## Run locally

Use Node 20.19+ or 22.12+ and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Before opening a pull request, run:

```sh
pnpm check:release
```

This builds the studio and library, runs the tests, and verifies installation and server rendering from a packaged consumer project. For interaction changes, also check keyboard navigation, touch layouts, and reduced motion in the studio and a standalone example. Keep the native component free of React and studio dependencies.

## Report a problem or propose a change

Open a [GitHub issue](https://github.com/davidezhang/intertext/issues) with a small reproduction, expected and actual behavior, browser version, and framework/package version. Screenshots help for layout bugs. Remove credentials, private project data, and personal media from examples.

For a substantial API change, explain the intended website use case in an issue before implementing it. Keep pull requests focused and describe what changed and how it was checked.

## Source and releases

- `src/lib`: native element and React bindings.
- `src/IntegrationPanel.tsx` and `src/studio-export.ts`: integration flow and portable exports.
- `skills/intertext`: coding-agent instructions and reference material.
- `examples`: standalone compositions.
- `docs/release.md`: versioned artifacts and release procedure.

Preserve published release bytes; change the version for a changed runtime. Do not commit generated site output, browser logs, credentials, or premium content. Demo media and fonts keep their separate licenses; include the appropriate notices when adding assets.
