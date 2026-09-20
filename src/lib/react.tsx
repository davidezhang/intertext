'use client';
import { createElement, forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { containsPoint, findInsertion, isSettled, stepSpring, type Axis, type Box, type Point } from './drag-layout.js';
import './artifact-pill.js';
import type { ArtifactPillElement, MediaFit, MediaKind } from './artifact-pill.js';

export interface ArtifactPillProps extends HTMLAttributes<ArtifactPillElement> {
  src: string;
  alt: string;
  kind?: MediaKind;
  fit?: MediaFit;
  /** Any CSS length; em sizes follow the surrounding typography. */
  width?: string;
  height?: string;
  radius?: string;
  duration?: string;
  easing?: string;
  position?: string;
  poster?: string;
  paused?: boolean;
  expanded?: boolean;
  hoverExpand?: boolean;
  expandedWidth?: string;
  expandedHeight?: string;
}

export const ArtifactPill = forwardRef<ArtifactPillElement, ArtifactPillProps>(function ArtifactPill({ expanded, hoverExpand, expandedWidth, expandedHeight, paused, ...props }, ref) {
  return createElement('artifact-pill', {
    ...props, ref, expanded: expanded ? '' : undefined,
    'hover-expand': hoverExpand ? '' : undefined, paused: paused ? '' : undefined,
    'expanded-width': expandedWidth, 'expanded-height': expandedHeight,
  });
});

export interface InlineArtifactTextProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  text: string;
  /** Insertion boundary: 0 = before the first word, words.length = after the last. */
  position: number;
  onPositionChange: (position: number) => void;
  artifact: ArtifactPillProps;
  movable?: boolean;
}

type Drag = { index: number; width: number; height: number };
type Gesture = {
  pointer: number; origin: Point; point: Point; grab: Point; width: number; height: number;
  original: number; preview: number; active: boolean; valid: boolean; lastRetarget: Point;
  velocity: Point; lastTime: number; samples: { point: Point; time: number }[];
};
type MovingNode = { x: Axis; y: Axis };
const hiddenStyle: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' };
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The text reflows during drag. Controlled position is committed once on release. */
export function InlineArtifactText({ text, position, onPositionChange, artifact, movable = true, ...props }: InlineArtifactTextProps) {
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<ArtifactPillElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pressed, setPressed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const pointerFrame = useRef(0);
  const springFrame = useRef(0);
  const springs = useRef(new Map<HTMLElement, MovingNode>());
  const snapshots = useRef<Map<HTMLElement, DOMRect> | null>(null);
  const pillOffset = useRef<Point>({ x: 0, y: 0 });
  const releaseVelocity = useRef<Point | null>(null);
  const reducedMotion = useRef(false);
  const cancelRef = useRef<() => void>(() => {});
  const instructionsId = useId();
  const tokens = text.match(/\S+\s*/gu) || [];
  const leadingSpace = text.match(/^\s+/u)?.[0] || '';
  const committed = Math.max(0, Math.min(tokens.length, Math.round(position)));
  const at = drag?.index ?? committed;

  function nodes() {
    return [...(root.current?.querySelectorAll<HTMLElement>('[data-artifact-word], artifact-pill') || [])];
  }

  function captureLayout() {
    snapshots.current = new Map(nodes().map(node => [node, node.getBoundingClientRect()]));
  }

  function naturalBox(node: HTMLElement): Box {
    const box = node.getBoundingClientRect();
    const motion = springs.current.get(node);
    const offset = node === pill.current ? pillOffset.current : { x: motion?.x.value || 0, y: motion?.y.value || 0 };
    return { left: box.left - offset.x, right: box.right - offset.x, top: box.top - offset.y, bottom: box.bottom - offset.y, width: box.width, height: box.height };
  }

  function paintOffset(node: HTMLElement, x: number, y: number) {
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    node.style.willChange = 'transform';
    if (node === pill.current) pillOffset.current = { x, y };
  }

  function restoreNode(node: HTMLElement) {
    node.style.removeProperty('transform');
    node.style.removeProperty('will-change');
    if (node === pill.current) pillOffset.current = { x: 0, y: 0 };
  }

  function animateSprings() {
    if (springFrame.current) return;
    let previousTime = performance.now();
    const tick = (time: number) => {
      const elapsed = Math.min((time - previousTime) / 1000, .04);
      previousTime = time;
      for (const [node, motion] of springs.current) {
        if (!node.isConnected || reducedMotion.current) {
          restoreNode(node); springs.current.delete(node); continue;
        }
        motion.x = stepSpring(motion.x, elapsed);
        motion.y = stepSpring(motion.y, elapsed);
        if (isSettled(motion.x) && isSettled(motion.y)) {
          restoreNode(node); springs.current.delete(node);
        } else paintOffset(node, motion.x.value, motion.y.value);
      }
      springFrame.current = springs.current.size ? requestAnimationFrame(tick) : 0;
    };
    springFrame.current = requestAnimationFrame(tick);
  }

  function followPointer() {
    const active = gesture.current;
    const element = pill.current;
    if (!active?.active || !element) return;
    const box = naturalBox(element);
    // Keep the exact spot grabbed under the pointer; no easing on the input path.
    paintOffset(element, active.point.x - active.grab.x - box.left, active.point.y - active.grab.y - box.top);
  }

  useBrowserLayoutEffect(() => {
    const before = snapshots.current;
    snapshots.current = null;
    if (before) {
      for (const node of nodes()) {
        const from = before.get(node);
        if (!from) continue;
        if (node === pill.current && gesture.current?.active) {
          springs.current.delete(node);
          continue;
        }
        const to = naturalBox(node);
        const previous = springs.current.get(node);
        const velocity = node === pill.current ? releaseVelocity.current : null;
        const next = {
          x: { value: from.left - to.left, velocity: velocity?.x ?? previous?.x.velocity ?? 0 },
          y: { value: from.top - to.top, velocity: velocity?.y ?? previous?.y.velocity ?? 0 },
        };
        if (reducedMotion.current || (isSettled(next.x) && isSettled(next.y))) {
          restoreNode(node); springs.current.delete(node);
        } else {
          springs.current.set(node, next);
          paintOffset(node, next.x.value, next.y.value);
        }
      }
      releaseVelocity.current = null;
      animateSprings();
    }
    followPointer();
  }, [at, drag]);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotion.current = query.matches; };
    update(); query.addEventListener('change', update);
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture.current) { event.preventDefault(); cancelRef.current(); }
    };
    const cancelOnInterrupt = () => cancelRef.current();
    window.addEventListener('keydown', cancel);
    window.addEventListener('blur', cancelOnInterrupt);
    window.addEventListener('resize', cancelOnInterrupt);
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('blur', cancelOnInterrupt);
      window.removeEventListener('resize', cancelOnInterrupt);
      cancelAnimationFrame(pointerFrame.current);
      cancelAnimationFrame(springFrame.current);
      springs.current.forEach((_, node) => restoreNode(node));
      springs.current.clear();
    };
  }, []);

  function updateDrag() {
    pointerFrame.current = 0;
    const active = gesture.current;
    if (!active?.active || !root.current || !pill.current) return;
    const area = root.current.getBoundingClientRect();
    // Only the text surface accepts a drop; a control over the text does not.
    const hit = document.elementFromPoint(active.point.x, active.point.y);
    active.valid = containsPoint(area, active.point, 36) && (!hit || root.current.contains(hit) || !hit.closest('button, input, textarea, select, aside'));
    let next = active.preview;
    if (active.valid && Math.hypot(active.point.x - active.lastRetarget.x, active.point.y - active.lastRetarget.y) >= 8) {
      const words = [...root.current.querySelectorAll<HTMLElement>('[data-artifact-word]')].map(naturalBox);
      next = findInsertion(words, active.point, naturalBox(pill.current), active.preview);
    }
    if (next !== active.preview) {
      captureLayout();
      active.preview = next;
      active.lastRetarget = { ...active.point };
      flushSync(() => setDrag({ index: next, width: active.width, height: active.height }));
    }
    followPointer();
  }

  function endGesture(commit: boolean) {
    const active = gesture.current;
    if (!active) return;
    cancelAnimationFrame(pointerFrame.current); pointerFrame.current = 0;
    if (active.active) updateDrag();
    const destination = commit && active.valid ? active.preview : active.original;
    captureLayout();
    const recentRelease = performance.now() - active.lastTime < 90;
    releaseVelocity.current = active.active && commit && recentRelease ? active.velocity : { x: 0, y: 0 };
    gesture.current = null;
    if (root.current?.hasPointerCapture(active.pointer)) root.current.releasePointerCapture(active.pointer);
    setPressed(false);
    setDrag(null);
    if (active.active) {
      if (commit && active.valid) {
        onPositionChange(destination);
        setAnnouncement(`Artifact moved to position ${destination + 1} of ${tokens.length + 1}.`);
      } else setAnnouncement('Move cancelled.');
    }
    requestAnimationFrame(() => pill.current?.focus({ preventScroll: true }));
  }
  cancelRef.current = () => endGesture(false);

  function pointerDown(event: ReactPointerEvent<ArtifactPillElement>) {
    if (!movable || event.button !== 0 || !event.isPrimary || gesture.current) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX, y: event.clientY };
    const now = performance.now();
    gesture.current = {
      pointer: event.pointerId, origin: point, point, grab: { x: point.x - box.left, y: point.y - box.top },
      width: box.width, height: box.height, original: committed, preview: committed, active: false, valid: true,
      lastRetarget: point, velocity: { x: 0, y: 0 }, lastTime: now, samples: [{ point, time: now }],
    };
    // The container stays mounted while the pill moves to a different word boundary.
    root.current!.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setPressed(true);
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointer) return;
    active.point = { x: event.clientX, y: event.clientY };
    const now = performance.now();
    active.samples.push({ point: active.point, time: now });
    active.samples = active.samples.filter(sample => now - sample.time <= 80).slice(-6);
    const first = active.samples[0];
    const elapsed = (now - first.time) / 1000;
    if (elapsed > .008) active.velocity = { x: (active.point.x - first.point.x) / elapsed, y: (active.point.y - first.point.y) / elapsed };
    active.lastTime = now;
    if (!active.active) {
      if (Math.hypot(active.point.x - active.origin.x, active.point.y - active.origin.y) < 6) return;
      active.active = true;
      captureLayout();
      springs.current.delete(pill.current!);
      setDrag({ index: active.preview, width: active.width, height: active.height });
    }
    if (!pointerFrame.current) pointerFrame.current = requestAnimationFrame(updateDrag);
  }

  function moveTo(index: number) {
    if (gesture.current) return;
    captureLayout();
    onPositionChange(index);
    setAnnouncement(`Artifact moved to position ${index + 1} of ${tokens.length + 1}.`);
    requestAnimationFrame(() => pill.current?.focus({ preventScroll: true }));
  }

  const artifactNode = <ArtifactPill {...artifact} key="artifact" ref={pill}
    width={drag ? `${drag.width}px` : artifact.width} height={drag ? `${drag.height}px` : artifact.height}
    expanded={drag ? false : artifact.expanded} hoverExpand={drag ? false : artifact.hoverExpand}
    duration={drag ? '0ms' : artifact.duration}
    tabIndex={movable ? 0 : artifact.tabIndex} role={movable ? 'button' : artifact.role}
    aria-label={movable ? `Move artifact: ${artifact.alt}` : artifact['aria-label']}
    aria-describedby={movable ? instructionsId : undefined}
    data-artifact-dragging={drag ? '' : undefined}
    style={{ ...artifact.style, cursor: movable ? (pressed ? 'grabbing' : 'grab') : undefined,
      touchAction: movable ? 'none' : undefined, userSelect: movable ? 'none' : undefined,
      zIndex: drag ? 10 : undefined, opacity: pressed && !drag ? .82 : 1,
      boxShadow: drag ? '0 12px 32px #0005, 0 2px 8px #0003' : undefined }}
    onPointerDown={pointerDown}
    onKeyDown={event => {
      if (!movable) return;
      const next = event.key === 'ArrowLeft' ? committed - 1 : event.key === 'ArrowRight' ? committed + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tokens.length : null;
      if (next !== null) { event.preventDefault(); moveTo(Math.max(0, Math.min(tokens.length, next))); }
    }} />;

  const children = tokens.flatMap((token, index) => [
    ...(index === at ? [artifactNode, <span key="after-artifact"> </span>] : []),
    <span key={`word-${index}`} data-artifact-word={index} style={{ display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere' }}>{token.trimEnd()}</span>,
    <span key={`space-${index}`}>{token.slice(token.trimEnd().length) || (index === tokens.length - 1 && at === tokens.length ? ' ' : '')}</span>,
  ]);
  if (at === tokens.length) children.push(artifactNode);

  return <>
    <div {...props} ref={root} data-artifact-position={at} data-artifact-dragging={drag ? '' : undefined}
      style={{ ...props.style, cursor: drag ? 'grabbing' : props.style?.cursor, userSelect: pressed ? 'none' : props.style?.userSelect }}
      onPointerMove={pointerMove} onPointerUp={event => { if (gesture.current?.pointer === event.pointerId) endGesture(true); }}
      onPointerCancel={() => endGesture(false)} onLostPointerCapture={() => endGesture(false)}>
      {leadingSpace}{children}
    </div>
    <span id={instructionsId} style={hiddenStyle}>Drag to move the artifact and reflow the text. Use Left and Right arrow keys, or Home and End. Escape cancels a drag.</span>
    <span style={hiddenStyle} role="status" aria-live="polite">{announcement}</span>
  </>;
}
