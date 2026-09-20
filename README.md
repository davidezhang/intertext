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

The canvas always fills the window. **Click the text to edit it in place.** Typing, selection, plain-text paste, line breaks, and undo/redo work directly on the canvas. Pills stay protected while you edit, and their placement follows the surrounding words. Remove pills through their settings. Escape leaves text editing.

The icon-only sliders button opens **global settings**: Typography, Canvas, and Export. Typography controls type scale; there is no separate text field. Click a pill (or focus it and press Enter) to open its own Media, Shape, Motion, and placement settings in the same right-hand sidebar. Each pill has independent media, sizing, fitting, and animation. Escape or a click on the canvas closes settings. Keyboard shortcuts T, C, E open the corresponding global section when you are not editing text.

The **+** button adds a pill at a random word boundary, preferring an unoccupied location. It brings the new pill into view and focuses it so it is ready to drag or move with the arrow keys. Dragging keeps settings closed. Remove a pill from its settings footer. Canvas contains dark/light backgrounds and fluid/375-pixel preview settings; Export includes every pill in the composition. Reset global settings restores the default text, type scale, dark mode, and fluid canvas without resetting individual pill designs.

Shape and Motion use [DialKit](https://joshpuckett.me/dialkit) controls embedded in the sidebar. Drag a slider to adjust it, use the arrow keys for fine changes, or focus it and press Enter to type a precise value. Width and height use `em` (relative to the surrounding text); radius uses pixels. Motion shows both starting and target dimensions, with current width and height synchronized with Shape, plus an interactive Bézier editor. **Easing** uses duration and a curve; **Time** uses visual duration and bounce; **Physics** uses stiffness, damping, and mass. Play, hover, and loop use the selected transition. Springs include their settling tail, so their total playback time can exceed the visual duration.

Upload media stays in your browser using an object URL. URL media is fetched directly from the URL you enter. Settings and uploaded files are session-only; export a snippet to retain the configuration. Add the original media file to your own project when using that snippet.

## Any website: native HTML

Copy `dist/lib/artifact-pill.js` into your project. It has no React, animation, or CSS dependencies, and importing it registers the element once.

```html
<script type="module" src="./artifact-pill.js"></script>

<h1 style="font-size: clamp(2rem, 7vw, 8rem); line-height: 1.2">
  Designing
  <artifact-pill
    src="/media/image.jpg"
    alt="Angular concrete beams and recessed windows"
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
        alt="Clouds passing a curved concrete building"
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
        alt: 'Angular concrete beams and recessed windows',
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

`position` is the boundary before word N: zero is the beginning, and `words.length` is the end. `InlineArtifactText` manages one pill per text block. For multiple pills, use `InlineArtifactsText` with stable IDs:

```tsx
import { useState } from 'react';
import { InlineArtifactsText, type InlineArtifactItem } from '@design-components/artifact-pill/react';

export function Composition() {
  const [artifacts, setArtifacts] = useState<InlineArtifactItem[]>([
    { id: 'concrete', position: 1, artifact: { src: '/concrete.jpg', alt: 'Angular concrete beams', width: '3.3em' } },
    { id: 'architecture', position: 4, artifact: { src: '/concrete-motion.mp4', kind: 'video', alt: 'Clouds passing a curved concrete building', width: '2em' } },
  ]);
  return <InlineArtifactsText
    text="Designing coherent systems for new computing interfaces."
    artifacts={artifacts}
    onPositionChange={(id, position) => setArtifacts(items =>
      items.map(item => item.id === id ? { ...item, position } : item)
    )}
  />;
}
```

`onSelectArtifact(id)` handles a click or Enter/Space activation, independently of dragging. `selectedId` marks the selected pill; `onArtifactDragStart(id)` can close an editor while dragging. Pills at the same boundary retain array order. Updating one item preserves the other pills and their media nodes. The original single-pill API remains compatible.

To enable in-place editing, give `InlineArtifactsText` an `onTextChange` callback and control the text as well as the artifacts:

```tsx
onTextChange={(text, positions) => {
  setText(text);
  setArtifacts(items => items.map(item => ({
    ...item, position: positions[item.id],
  })));
}}
```

The callback provides the updated plain text and pill positions together. Selection replacement and cut preserve the pills, paste strips formatting, and Enter inserts a line break. Text undo/redo works within an editing session; external changes to the composition, such as adding or dragging a pill, start a new undo history. Omit `onTextChange` for a display-only text composition.

Both wrappers are controlled plain-text compositions, not rich-text editors; drag is limited to the current block. Pointer events support mouse, pen, and touch. Focus a pill and use Left/Right or Home/End to move it. Escape cancels an active drag; releasing outside the block cancels placement. Position changes are announced to assistive technology.

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
| `easing` | `easing` | CSS timing function, `cubic-bezier()`, or `linear()` spring curve |
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

The component uses the browser's native inline layout, Shadow DOM, CSS object-fit, CSS transitions, and pointer events. Pretext was considered, but custom text measurement is unnecessary for this flow. The studio embeds DialKit's exported sliders, toggles, folders, and transition editor in its custom sidebar. Pill values remain in React state; a scoped DialKit store registration keeps the transition editor mode in sync and is removed on unmount. Media tools, inline editing, placement, and component export remain custom.

DialKit and Motion are development dependencies used by the studio build only. Motion compiles springs into CSS `linear()` timing functions, which are also included in exported snippets; the reusable `dist/lib` entries import neither library. Spring snippets require a browser with CSS `linear()` support. The library's existing drag springs are independent of the studio's size-animation editor.

`pnpm test` verifies package imports without DOM globals, SSR attributes, false boolean handling, placement boundaries, safe text escaping/Unicode, movement accessibility markup, and the React client directive. DOM interaction tests use a deterministic wrapping layout to verify reflow before release, media identity, grab offset, pointer capture, reversal, single commit, cancellation, keyboard movement, and reduced motion. Multi-pill checks cover independent dragging, click versus drag selection, editing/removal, shared boundaries, and random insertion. Inline editing checks cover caret continuity, pill placement, selection replacement, undo/redo, empty text, plain-text paste, line breaks, and IME composition. Browser verification covers pointer dragging across wrapped lines, media rendering, responsive layouts, full-screen geometry, in-place editing, and global/per-pill controls. Browser-specific autoplay and codecs remain subject to the host browser.

The studio's interaction and material refinements follow the [Apple design skill](https://www.ui-skills.com/skills/emilkowalski/apple-design): direct manipulation, interruptible settling, anchored sidebar transitions, readable system typography, and reduced motion/transparency/contrast preferences.

## Demo asset credits

- **Concrete study** — [Marc Cordeau on Unsplash](https://unsplash.com/photos/Z3MsCdxNJg4), under the [Unsplash License](https://unsplash.com/license). Resized photograph of angular concrete architecture.
- **Analog loop** — [emirkhan bal on Pexels](https://www.pexels.com/video/spinning-vinyl-record-7202466/), under the [Pexels License](https://www.pexels.com/license/). A four-second monochrome GIF excerpt of a spinning turntable, with a still poster.
- **Concrete in motion** — [Nuray on Pexels](https://www.pexels.com/video/elegant-brutalist-architecture-against-blue-sky-28883887/), under the [Pexels License](https://www.pexels.com/license/). An eight-second monochrome, silent architectural video excerpt, with a still poster.
- **Shell chair** — [Resource Database on Unsplash](https://unsplash.com/photos/rZ1RPEom9gs), under the [Unsplash License](https://unsplash.com/license). A resized monochrome chair render from the creator's “Musical Chairs” series.

The demo media is in `public/media` and is not included in the reusable library package.
