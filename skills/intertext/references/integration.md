# Intertext integration reference — 0.1.0

## Installation

The canonical npm package is `intertext-dev`; its React entry is `intertext-dev/react`. This reference describes version 0.1.0:

```sh
npm install intertext-dev@0.1.0
```

Use the destination's package manager and retain its lockfile. The identical archive is available at https://intertext.dev/releases/0.1.0/intertext-dev-0.1.0.tgz, and studio download kits include the local runtime or package. Report failed installations rather than claiming success. For a source checkout, build it and install the generated archive by absolute path. Do not install the unrelated `intertext` package.

Plain HTML needs only the browser module, with no React or external CSS:

```html
<script type="module" src="https://intertext.dev/releases/0.1.0/artifact-pill.js"></script>
<h1 style="font-size:clamp(2.5rem,7vw,7rem);line-height:1.15">
  Spaces for <artifact-pill src="/media/studio.jpg" alt="Sunlit studio with large windows" width="2.8em" height=".85em" fit="crop"></artifact-pill> new ideas.
</h1>
```

For self-hosting, download that module and its sibling `LICENSE`, retain the MIT notice, and import the local module. Import once per document. In a bundler, `import 'intertext-dev'` registers the same custom element. Serve ES modules over HTTP, not `file://`.

## React and Next.js

React and React DOM 18+ are optional peer dependencies, required by the React entry only. Its client directive is preserved, and importing it during server rendering is supported. A static composition needs no state or drag wrapper:

```tsx
import { ArtifactPill } from 'intertext-dev/react';

export function Introduction() {
  return (
    <h1 className="intro">
      Spaces for{' '}
      <ArtifactPill
        src="/media/studio.jpg"
        alt="Sunlit studio with large windows"
        width="2.8em"
        height=".85em"
        fit="crop"
      />{' '}
      new ideas.
    </h1>
  );
}
```

Keep the parent site's styles. In Next.js, a component with hooks, refs, or event handlers needs its own `'use client'` boundary. A server component may compose the exported client `ArtifactPill` using serializable props.

## Properties

| HTML | React | Values / use |
| --- | --- | --- |
| `src`, `alt` | same | Media URL and description. Empty alt is appropriate for decorative images. |
| `kind` | same | `image` (default), `gif`, `video`, `audio`. Specify the actual type explicitly. |
| `width`, `height` | same | CSS lengths; start near `2.8em` and `.85em`. |
| `radius` | same | CSS radius; `999px` gives a capsule. |
| `fit` | same | `crop` (cover), `fit` (contain), `fill` (stretch). |
| `position` | same | CSS object-position, such as `60% 30%`. This is not a word index. |
| `duration`, `easing` | same | CSS time and timing function. |
| `expanded` | same | Boolean; use the target size. |
| `expanded-width`, `expanded-height` | `expandedWidth`, `expandedHeight` | CSS lengths for expanded state. |
| `hover-expand` | `hoverExpand` | Expand on hover or visible keyboard focus. Add `tabindex="0"` / `tabIndex={0}` if keyboard focus is needed. |
| `poster` | same | Video poster URL. |
| `paused` | same | Boolean; keep video paused or GIF still. Audio also accepts this state. |
| `play-on-hover` | `playOnHover` | Boolean; hover playback takes precedence over `paused`. Keep important actions available to touch and keyboard. |

In HTML, booleans use attribute presence: omit an attribute for false; `paused="false"` is still true. React bindings take booleans and handle that conversion.

The component is an inline-block capped at the container width. Its shadow media exposes `::part(media)`. CSS defaults use `--artifact-width`, `--artifact-height`, `--artifact-radius`, `--artifact-align`, `--artifact-background`, `--artifact-focus`, `--artifact-duration`, `--artifact-easing`, `--artifact-expanded-width`, and `--artifact-expanded-height`; explicit attributes win.

## Media and motion

Video is muted, looping, and inline. Provide `poster` and either a pause control or opt-in playback. Reduced motion disables autoplay and transitions. GIFs use a still preview when paused or reduced motion is requested. The element exposes `play(): Promise<void>` and `pause()` for audio/video. Call `play()` from a user action and handle rejection; `artifact-playback-error` reports blocked playback. Failed media emits `artifact-error` and displays a fallback.

Audio stays silent initially. Remote audio requires CORS for waveform decoding; use a same-origin URL where possible. Its theme variables are `--artifact-audio-background`, `--artifact-audio-color`, and `--artifact-audio-progress`. Do not use an audio waveform as a substitute for text information.

## Optional placement editor

Only for requested editing/dragging, import `InlineArtifactsText` with items of shape `{ id, position, artifact }`. `position` is a word boundary: 0 precedes the first word. Keep IDs stable, control `onPositionChange(id, position)`, and set `movable` explicitly. `onTextChange(text, positions)` additionally enables in-place editing and supplies updated positions together with the text. These wrappers render `div` containers and are not a replacement for semantic headings in a published page.

Public integration guide: https://intertext.dev/docs/integration.md. Studio: https://intertext.dev. Complete HTML recipes: https://intertext.dev/examples/portfolio.html, https://intertext.dev/examples/product.html, and https://intertext.dev/examples/editorial.html.

Install the skill from the website with `npx skills add https://intertext.dev`. Source and issue reports: https://github.com/davidezhang/intertext.
