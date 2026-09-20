# Intertext

A responsive image, GIF, or silent looping video that sits between words. The studio is a full-screen canvas that defaults to dark mode, with a single collapsible control sidebar. The reusable pill is a dependency-free **Web Component**; React bindings add controlled placement, pointer/touch dragging, and keyboard movement.

## Run the studio

With Node 20.19+ or 22.12+ and pnpm:

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Vite. `pnpm build` builds both the studio (`dist/site`) and the reusable library (`dist/lib`). `pnpm test` runs package, SSR, and drag interaction checks after building.

On the current Codex machine, `./scripts/dev.sh` also works with the bundled Node runtime when Node is missing from PATH.

The canvas always fills the window. **Text**, **Media**, **Shape**, **Motion**, **Canvas**, and **Export** are collapsible sections in one right-hand sidebar. Keyboard shortcuts: T, M, S, A, C, E. Escape closes the active section or restores hidden controls. Canvas contains the dark/light background and fluid/375-pixel preview settings. The sidebar header collapses the controls; the Controls button restores them. Export previews and downloads code inside the same sidebar. Reset restores dark mode.

Upload media stays in your browser using an object URL. URL media is fetched directly from the URL you enter. Settings and uploaded files are session-only; export a snippet to retain the configuration. Add the original media file to your own project when using that snippet.

## Any website: native HTML

Copy `dist/lib/artifact-pill.js` into your project. It has no React, animation, or CSS dependencies, and importing it registers the element once.

```html
<script type="module" src="./artifact-pill.js"></script>

<h1 style="font-size: clamp(2rem, 7vw, 8rem); line-height: 1.2">
  Designing
  <artifact-pill
    src="/media/image.jpg"
    alt="A forest around an alpine lake"
    width="3.3em"
    height="0.85em"
    radius="999px"
    fit="crop"
    hover-expand
    expanded-width="4.5em"
    expanded-height="1.1em"
  ></artifact-pill>
  coherent systems.
</h1>
```

Open [examples/plain-html.html](examples/plain-html.html) through the dev server after building for an example using only HTML and the compiled element. The same custom element can be used from Vue, Svelte, or another framework. Follow that framework's custom-element configuration if needed.

## React

This is a local package, not a published npm release. Build and pack it first:

```sh
pnpm build
pnpm pack
# From the consuming React project:
pnpm add /absolute/path/to/design-components-artifact-pill-0.1.0.tgz
```

React and React DOM are optional peers, required only by the React entry point. The package includes TypeScript declarations. The React bundle preserves `use client` for frameworks using React Server Components. Browser registration occurs in the client bundle; imports are safe during server rendering.

For a static inline pill:

```tsx
import { ArtifactPill } from '@design-components/artifact-pill/react';

export function Heading() {
  return (
    <h1>
      Designing{' '}
      <ArtifactPill
        src="/media/clip.mp4"
        kind="video"
        alt="A close-up of flowers moving in the breeze"
        poster="/media/poster.jpg"
        width="3.3em"
        height="0.85em"
        fit="crop"
      />{' '}
      coherent systems.
    </h1>
  );
}
```

For drag placement between words:

```tsx
'use client';
import { useState } from 'react';
import { InlineArtifactText } from '@design-components/artifact-pill/react';

export function EditableHeading() {
  const [position, setPosition] = useState(1);
  return (
    <InlineArtifactText
      text="Designing coherent systems for new computing interfaces."
      position={position}
      onPositionChange={setPosition}
      style={{ fontSize: 'clamp(2rem, 7vw, 8rem)', lineHeight: 1.2 }}
      artifact={{
        src: '/media/photo.jpg',
        alt: 'An alpine lake surrounded by forest',
        width: '3.3em',
        height: '.85em',
        fit: 'crop',
        duration: '650ms',
        hoverExpand: true,
        expandedWidth: '5em',
        expandedHeight: '1.1em',
      }}
    />
  );
}
```

`position` is the boundary before word N: zero is the beginning, and `words.length` is the end. The wrapper manages one pill per text block. It is a controlled plain-text composition, not a rich-text editor; drag is limited to the current block. Pointer events support mouse, pen, and touch. Focus the pill and use Left/Right or Home/End to move it. Escape cancels an active drag; releasing outside the block cancels placement. Position changes are announced to assistive technology.

While dragging, the pill follows the exact point you grabbed and the words reflow immediately around its new position. The same media element stays mounted. Interruptible springs soften the movement of words and the pill's release; there is no insertion cursor or duplicate drag image. `onPositionChange` fires once on a valid release, so cancellation restores the original placement without updating your state. Reduced motion keeps direct pointer tracking and skips the settling animation.

## Pill API

| HTML attribute | React prop | Behavior |
| --- | --- | --- |
| `src` | `src` | Image, GIF, or video URL |
| `kind` | `kind` | `image` (default), `gif`, or `video`; explicit for URLs without extensions |
| `alt` | `alt` | Media description; empty for decorative images |
| `width`, `height` | same | Any CSS length, such as `em`, `px`, `%`, or `clamp()` |
| `radius` | `radius` | CSS border radius; defaults to `999px` |
| `fit` | `fit` | `crop` → `cover`; `fit` → `contain`; `fill` → stretched |
| `position` | `position` | CSS object-position, e.g. `60% 30%` |
| `duration` | `duration` | CSS duration, e.g. `650ms` |
| `easing` | `easing` | CSS timing function or cubic-bezier |
| `expanded` | `expanded` | Use the expanded size |
| `hover-expand` | `hoverExpand` | Expand on hover or visible keyboard focus |
| `expanded-width` | `expandedWidth` | Expanded width; default `4.2em` |
| `expanded-height` | `expandedHeight` | Expanded height; default `1.25em` |
| `poster` | `poster` | Video poster image |
| `paused` | `paused` | Pause video; native boolean attribute: omit to allow autoplay |

The pill is `inline-block`, baseline aligned, and capped at `max-width:100%` of its containing block. `em` values scale with the surrounding type. Changing width, height, or radius triggers a CSS transition; text naturally reflows as dimensions change. During size transitions, line breaks move at their actual wrapping threshold. The React wrapper animates individual words when drag or keyboard placement changes. Hover expansion can change wrapping, so choose expanded dimensions appropriate to your paragraph.

Use CSS variables for defaults: `--artifact-width`, `--artifact-height`, `--artifact-radius`, `--artifact-align`, `--artifact-background`, `--artifact-focus`, `--artifact-duration`, `--artifact-easing`, `--artifact-expanded-width`, and `--artifact-expanded-height`. Explicit attributes take precedence. The shadow media element exposes `::part(media)` for custom styling.

Change the size from application state or plain JavaScript:

```js
const pill = document.querySelector('artifact-pill');
pill.setAttribute('width', '5em');
pill.setAttribute('height', '1.1em');
// Or toggle a predefined expanded state:
pill.toggleAttribute('expanded');
```

## Media and accessibility

- Video is muted, inline, and looping. `paused` stops it. Browser autoplay policies may still block playback; supply a poster.
- Reduced motion disables pill transitions and video autoplay. The studio also disables size loops and hover expansion under reduced motion.
- GIF animation is intrinsic to the file. It cannot be paused by `paused`; use video or a still image when pause/reduced-motion behavior matters.
- Supply meaningful media descriptions. The studio lets you edit them in Media. Interactive pills expose movement instructions and a live region; static images expose alt text.
- Failed media shows an inline fallback and emits an `artifact-error` event. Supported video codecs depend on the visitor's browser; MP4/H.264 and WebM are the recommended formats.
- The native element can be used in any normal inline layout. The React wrapper's `movable={false}` disables its drag/keyboard behavior.

## Implementation and verification

The component uses the browser's native inline layout, Shadow DOM, CSS object-fit, CSS transitions, and pointer events. Pretext was considered, but custom text measurement is unnecessary for this flow. The studio's controls are direct React controls, so DialKit and Motion are not shipped as dependencies.

`pnpm test` verifies package imports without DOM globals, SSR attributes, false boolean handling, placement boundaries, safe text escaping/Unicode, movement accessibility markup, and the React client directive. DOM interaction tests use a deterministic wrapping layout to verify reflow before release, media identity, grab offset, pointer capture, reversal, single commit, cancellation, keyboard movement, and reduced motion. Browser verification covers pointer dragging across wrapped lines, media rendering, responsive layouts, full-screen geometry, and overlay controls. Browser-specific autoplay and codecs remain subject to the host browser.

The studio's interaction and material refinements follow the [Apple design skill](https://www.ui-skills.com/skills/emilkowalski/apple-design): direct manipulation, interruptible settling, anchored sidebar transitions, readable system typography, and reduced motion/transparency/contrast preferences.

## Demo asset credits

- Alpine lake photograph by Joaquim: https://unsplash.com/photos/Eo59O2GdipY
- Flower video: https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4 (MDN CC0 example). The GIF and poster are derived from this video.

The demo media is in `public/media` and is not included in the reusable library package.
