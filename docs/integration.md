# Add Intertext to a website

Intertext adds images, GIFs, silent video, and audio waveforms between words. A dependency-free custom element works in ordinary HTML; a React binding provides typed props. Use it inside the headings and paragraphs your site already has.

## Choose an integration

**intertext-dev 0.1.0** is available on [npm](https://www.npmjs.com/package/intertext-dev) and as a versioned website download. Use the skill with a coding agent, import the browser module in HTML, or install the package in a React project. You do not need an account to install or use Intertext.

The skill is discovered from the website’s `/.well-known/agent-skills/` endpoint. Installing it gives an agent integration instructions; it does not add the runtime to your site automatically.

## Let an agent integrate it

Run from your website project:

```sh
npx skills add https://intertext.dev
```

Then ask:

> Use Intertext to add a small inline video to my homepage heading. Keep my current typography and semantic h1. Use my existing media, make it responsive, and keep dragging off.

The skill supports agents implementing the Agent Skills format, including Codex, Claude Code, and Cursor. It reads the project and chooses the native or React route. See the [hosted skill instructions](https://intertext.dev/.well-known/agent-skills/intertext/SKILL.md).

## HTML, Astro, or a custom-code embed

Load the canonical browser module once. This example is a complete static composition; it needs no framework, additional CSS library, or hosted account.

```html
<script type="module" src="https://intertext.dev/releases/0.1.0/artifact-pill.js"></script>

<h1 class="intro">
  Building
  <artifact-pill
    src="/media/studio.jpg"
    alt="Sunlit studio with tall windows"
    width="2.8em"
    height=".85em"
    fit="crop"
  ></artifact-pill>
  spaces for new ideas.
</h1>

<style>
  .intro { font-size: clamp(2.5rem, 7vw, 7rem); line-height: 1.15; }
</style>
```

Replace the media path with a file in your project. For self-hosting, download the [browser module](https://intertext.dev/releases/0.1.0/artifact-pill.js) and [MIT license](https://intertext.dev/releases/0.1.0/LICENSE) into your public assets, then change the script URL to your local path. The studio’s HTML kit includes both files. Preserve the MIT notice. In a bundler, importing `intertext-dev` registers the same element. Frameworks may need their normal custom-element configuration. A website builder must allow custom JavaScript and custom HTML; check the published page as well as its editor preview.

## React and Next.js

Install the package:

```sh
npm install intertext-dev
```

If you have a local source checkout, you can instead install its built archive:

```sh
npm install /absolute/path/to/intertext/public/releases/0.1.0/intertext-dev-0.1.0.tgz
```

Use your project's package manager and retain the lockfile. The same package is also available as a [versioned archive](https://intertext.dev/releases/0.1.0/intertext-dev-0.1.0.tgz). Do not install `intertext`: that name belongs to an unrelated package.

```tsx
import { ArtifactPill } from 'intertext-dev/react';

export function Hero() {
  return (
    <h1 className="intro">
      Building{' '}
      <ArtifactPill
        src="/media/studio.jpg"
        alt="Sunlit studio with tall windows"
        width="2.8em"
        height=".85em"
        fit="crop"
      />{' '}
      spaces for new ideas.
    </h1>
  );
}
```

The React entry supports React/React DOM 18+ and retains its client boundary for Next.js. Static headings need no state. Add `'use client'` to your own component if it uses hooks or event handlers. `ArtifactPill` is static by default; the separate `InlineArtifactsText` placement editor defaults to dragging and should be used only when visitors need to rearrange or edit text.

## Start from a complete example

Start from one of these complete HTML pages. Each uses local demo media, the same browser bundle, semantic headings, and responsive CSS. Save and adapt the page’s HTML, keeping its runtime and media URLs or replacing them with your own.

- [Editorial](https://intertext.dev/examples/editorial.html): a serif magazine feature with photography in its headline and small pills in the body copy.
- [Portfolio](https://intertext.dev/examples/portfolio.html): a dark, minimal introduction with three hover-expanding pills, a motion toggle, and an indexed work list.
- [Product launch](https://intertext.dev/examples/product.html): wide uppercase type on bold color, an expanding product photo with a touch and keyboard toggle, and a specification list.
- [Event poster](https://intertext.dev/examples/event.html): condensed poster type with a playable audio pill, a spinning record, and a lineup.
- [Studio](https://intertext.dev/examples/studio.html): a Swiss-grid architecture practice with square media, an opt-in film, and a project index.
- [Field notes](https://intertext.dev/examples/notes.html): a journal entry with images, a GIF, and a video set inside running text at reading size.

These are free starter compositions. Replace their illustrative copy and media before publishing your own site. See the [demo media credits](https://intertext.dev/media/LICENSE.md); the photos and video retain their original licenses.

## Bring a studio composition

Open **Global settings → Export** in the studio (or press <kbd>E</kbd>) to copy HTML or React, copy an agent prompt, or download a complete kit. The ZIP includes your code, uploaded and sample media, a local runtime or package, and setup instructions. Follow its README to place those files in your project. External media URLs stay external.

A copied snippet or composition JSON stores configuration, not uploaded file bytes. Uploads use temporary `blob:` URLs in the studio; the kit replaces them with real local paths. Download the kit when your composition includes uploads, and never publish browser-session URLs. Keep the exported dimensions, fitting, and motion settings while adapting the semantic text container to your page.

## Check before shipping

Keep the sentence meaningful as text. Add useful media descriptions, use `em` dimensions, and check wrapping on a narrow phone and desktop. Include a video poster. Use `paused` for opt-in playback and a real button for meaningful actions; hover alone is not available on every device. Audio should start from a user gesture. The component honors reduced motion for transitions and autoplay. Verify media URLs, keyboard focus, touch controls, and the destination's build/hydration checks.

The [integration API reference](https://intertext.dev/.well-known/agent-skills/intertext/references/integration.md) lists attributes, CSS variables, audio behavior, and the optional controlled editing APIs.
