import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactPill, InlineArtifactText, InlineArtifactsText } from '../dist/lib/react.js';
import { registerArtifactPill } from '../dist/lib/artifact-pill.js';

test('native and React entry points import safely without browser globals', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.doesNotThrow(() => registerArtifactPill());
});

test('React wrapper emits custom-element attributes for SSR and hydration', () => {
  const html = renderToStaticMarkup(createElement(ArtifactPill, {
    src: '/clip.mp4', alt: 'A garden', kind: 'video', width: 'clamp(2em, 20vw, 5em)',
    fit: 'fit', hoverExpand: true, expandedWidth: '4em', paused: true,
  }));
  assert.match(html, /<artifact-pill/);
  assert.match(html, /hover-expand=""/);
  assert.match(html, /expanded-width="4em"/);
  assert.match(html, /paused=""/);
  assert.match(html, /width="clamp\(2em, 20vw, 5em\)"/);
  assert.doesNotMatch(html, /hoverExpand|expandedWidth/);
});

test('false boolean props do not accidentally enable native element features', () => {
  const html = renderToStaticMarkup(createElement(ArtifactPill, {
    src: '/photo.jpg', alt: '', paused: false, hoverExpand: false, expanded: false,
  }));
  assert.doesNotMatch(html, /paused|hover-expand| expanded/);
});

function renderText(text, position, movable = true) {
  return renderToStaticMarkup(createElement(InlineArtifactText, {
    text, position, movable, onPositionChange() {}, artifact: { src: '/x.jpg', alt: 'Sample' },
  }));
}

test('text wrapper places the artifact at both edges and clamps out-of-range positions', () => {
  const start = renderText('Hello world', -10);
  assert.ok(start.indexOf('<artifact-pill') < start.indexOf('data-artifact-word="0"'));
  const end = renderText('Hello world', 50);
  assert.ok(end.indexOf('<artifact-pill') > end.indexOf('data-artifact-word="1"'));
  assert.equal((end.match(/<artifact-pill/g) || []).length, 1);
  assert.equal((renderText('', 0).match(/<artifact-pill/g) || []).length, 1);
});

test('text is escaped and Unicode words keep their content', () => {
  const html = renderText('Hello <script>alert(1)</script> 世界 👋', 2);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /世界/);
  assert.match(html, /👋/);
});

test('movement exposes keyboard instructions and a live announcement region', () => {
  const html = renderText('Hello world', 1);
  assert.match(html, /tabIndex="0"/i);
  assert.match(html, /role="button"/);
  assert.match(html, /aria-describedby=/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(renderText('Hello world', 1, false), /role="button"/);
});

test('React build preserves the client directive for React Server Component consumers', () => {
  assert.match(readFileSync(new URL('../dist/lib/react.js', import.meta.url), 'utf8'), /^['"]use client['"];/);
});

test('multiple pills can share a boundary, including an empty text block', () => {
  const artifacts = ['first', 'second', 'third'].map(id => ({ id, position: 20, artifact: { src: `/${id}.jpg`, alt: id } }));
  const html = renderToStaticMarkup(createElement(InlineArtifactsText, { text: '', artifacts, onPositionChange() {} }));
  assert.equal((html.match(/<artifact-pill/g) || []).length, 3);
  assert.ok(html.indexOf('data-artifact-id="first"') < html.indexOf('data-artifact-id="second"'));
  assert.ok(html.indexOf('data-artifact-id="second"') < html.indexOf('data-artifact-id="third"'));
  assert.doesNotMatch(html, /data-artifact-word=/);
});
