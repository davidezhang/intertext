---
name: intertext
description: Add Intertext inline images, GIFs, video, or audio waveforms to website headings and paragraphs. Use when integrating Intertext, placing media between words, or adapting an Intertext studio composition to a website.
license: MIT
metadata:
  author: davidezhang
  version: "0.1.0"
---

# Intertext

Intertext places media inside ordinary text flow. Use its canonical `artifact-pill` Web Component or the `ArtifactPill` React binding; preserve the site's existing typography and layout. The skill is an integration guide, while the component runs on the website.

## Integrate

Inspect the relevant page, framework, package manager, existing dependencies, and media assets. Preserve the user's content and design direction; use media where it supports the sentence. A normal integration needs no studio UI, account, backend, or animation dependency.

Read [the integration reference](references/integration.md) for installation, exact attributes, React usage, and media behavior. Check whether Intertext is already installed before adding a dependency. Use the versioned release or existing compatible package, and keep the lockfile. Do not substitute an unrelated npm package named `intertext`.

Use real `<h1>`–`<h6>` and `<p>` elements containing static pills by default. Set `em` dimensions so the media scales with the type. Keep the sentence readable without the media, supply useful descriptions, and retain whitespace on both sides of each pill.

Use the visitor's own assets or project assets. Studio uploads use temporary `blob:` URLs: copy the underlying file into the destination project and replace those URLs. A copied studio snippet does not bundle media. Do not treat the studio's demo photographs as MIT-licensed assets.

For React, prefer `ArtifactPill` inside semantic text. `InlineArtifactsText` and `InlineArtifactText` are editor/placement controls that render a `div`; use them only when the user wants dragging or editing. They default to movable, so explicitly set `movable={false}` for a display-only wrapper. Do not place their `div` inside a heading or paragraph.

Motion should enhance a complete static composition. Keep essential information available without hover; provide a keyboard/touch control if an action matters. Start audio paused, and play it from an explicit user action. For looping video, include a poster and a pause control, or keep playback opt-in. Respect reduced-motion behavior rather than overriding it to force autoplay.

## Check the result

Run the destination project's relevant checks. Inspect the integrated page at a narrow phone width and desktop width: the sentence should wrap naturally, media should load, and the expanded pill should stay inside its container. Check focus/keyboard controls, touch behavior for any action, and reduced motion. Confirm there are no missing module/media requests or hydration errors.

Report the files changed, how to edit the copy/media, and any check that could not be completed. Installing this skill or integrating the component does not itself publish the user's website.
