'use client';
import { createElement, forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { containsPoint, findInsertion, isSettled, stepSpring, type Axis, type Box, type Point } from './drag-layout.js';
import './artifact-pill.js';
import { useInlineEditing, type TextChange } from './use-inline-editing.js';
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

export interface InlineArtifactItem {
  /** Stable identity, retained when the pill moves between words. */
  id: string;
  position: number;
  artifact: ArtifactPillProps;
}

export interface InlineArtifactsTextProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'onSelect'> {
  text: string;
  artifacts: InlineArtifactItem[];
  onPositionChange: (id: string, position: number) => void;
  /** Enables direct plain-text editing while preserving the inline pills. */
  onTextChange?: TextChange;
  onSelectArtifact?: (id: string) => void;
  onArtifactDragStart?: (id: string) => void;
  selectedId?: string | null;
  movable?: boolean;
}

type Drag = { id: string; index: number; width: number; height: number };
type Gesture = {
  id: string; pointer: number; origin: Point; point: Point; grab: Point; width: number; height: number;
  original: number; preview: number; active: boolean; valid: boolean; lastRetarget: Point;
  velocity: Point; lastTime: number; samples: { point: Point; time: number }[];
};
type MovingNode = { x: Axis; y: Axis };
const hiddenStyle: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' };
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The text reflows during drag. Controlled position is committed once on release. */
export function InlineArtifactText({ position, onPositionChange, artifact, ...props }: InlineArtifactTextProps) {
  return <InlineArtifactsText {...props} artifacts={[{ id: 'artifact', position, artifact }]} onPositionChange={(_, next) => onPositionChange(next)} />;
}

export function InlineArtifactsText({ text, artifacts, onPositionChange, onSelectArtifact, onArtifactDragStart, onTextChange, selectedId, movable = true, ...props }: InlineArtifactsTextProps) {
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<ArtifactPillElement | null>(null);
  const pillNodes = useRef(new Map<string, ArtifactPillElement>());
  const gesture = useRef<Gesture | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pointerFrame = useRef(0);
  const springFrame = useRef(0);
  const springs = useRef(new Map<HTMLElement, MovingNode>());
  const snapshots = useRef<Map<HTMLElement, DOMRect> | null>(null);
  const offsets = useRef(new Map<HTMLElement, Point>());
  const releaseVelocity = useRef<Point | null>(null);
  const reducedMotion = useRef(false);
  const cancelRef = useRef<() => void>(() => {});
  const instructionsId = useId();
  const editable = Boolean(onTextChange);
  const editor = useInlineEditing(root, text, Object.fromEntries(artifacts.map(item => [item.id, item.position])), onTextChange);
  const renderedChildren = useRef<ReactNode[]>([]);
  const tokens = text.match(/\S+\s*/gu) || [];
  const leadingSpace = text.match(/^\s+/u)?.[0] || '';
  const clamp = (position: number) => Math.max(0, Math.min(tokens.length, Math.round(position)));
  const placements = artifacts.map(item => ({ ...item, position: drag?.id === item.id ? drag.index : clamp(item.position) }));
  const layoutKey = JSON.stringify(placements.map(({ id, position }) => [id, position]));

  function nodes() {
    return [...(root.current?.querySelectorAll<HTMLElement>('[data-artifact-word], artifact-pill') || [])];
  }

  function captureLayout() {
    snapshots.current = new Map(nodes().map(node => [node, node.getBoundingClientRect()]));
  }

  function naturalBox(node: HTMLElement): Box {
    const box = node.getBoundingClientRect();
    const offset = offsets.current.get(node) || { x: 0, y: 0 };
    return { left: box.left - offset.x, right: box.right - offset.x, top: box.top - offset.y, bottom: box.bottom - offset.y, width: box.width, height: box.height };
  }

  function paintOffset(node: HTMLElement, x: number, y: number) {
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    node.style.willChange = 'transform';
    offsets.current.set(node, { x, y });
  }

  function restoreNode(node: HTMLElement) {
    node.style.removeProperty('transform');
    node.style.removeProperty('will-change');
    offsets.current.delete(node);
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
  }, [layoutKey, drag]);

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
    active.valid = containsPoint(area, active.point, 36) && (!hit || root.current.contains(hit) || !hit.closest('button, input, textarea, select, aside, a'));
    let next = active.preview;
    if (active.valid && Math.hypot(active.point.x - active.lastRetarget.x, active.point.y - active.lastRetarget.y) >= 8) {
      const words = [...root.current.querySelectorAll<HTMLElement>('[data-artifact-word]')].map(naturalBox);
      next = findInsertion(words, active.point, naturalBox(pill.current), active.preview);
    }
    if (next !== active.preview) {
      captureLayout();
      active.preview = next;
      active.lastRetarget = { ...active.point };
      flushSync(() => setDrag({ id: active.id, index: next, width: active.width, height: active.height }));
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
    setPressed(null);
    setDrag(null);
    if (active.active) {
      if (commit && active.valid) {
        onPositionChange(active.id, destination);
        setAnnouncement(`Artifact moved to position ${destination + 1} of ${tokens.length + 1}.`);
      } else setAnnouncement('Move cancelled.');
    } else if (commit) onSelectArtifact?.(active.id);
    const focusTarget = pill.current;
    requestAnimationFrame(() => focusTarget?.isConnected && focusTarget.focus({ preventScroll: true }));
  }
  cancelRef.current = () => endGesture(false);

  function pointerDown(event: ReactPointerEvent<ArtifactPillElement>, item: InlineArtifactItem) {
    if (!movable || event.button !== 0 || !event.isPrimary || gesture.current) return;
    event.preventDefault();
    pill.current = event.currentTarget;
    const committed = clamp(item.position);
    const box = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX, y: event.clientY };
    const now = performance.now();
    gesture.current = {
      id: item.id, pointer: event.pointerId, origin: point, point, grab: { x: point.x - box.left, y: point.y - box.top },
      width: box.width, height: box.height, original: committed, preview: committed, active: false, valid: true,
      lastRetarget: point, velocity: { x: 0, y: 0 }, lastTime: now, samples: [{ point, time: now }],
    };
    // The container stays mounted while the pill moves to a different word boundary.
    root.current!.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setPressed(item.id);
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
      onArtifactDragStart?.(active.id);
      captureLayout();
      springs.current.delete(pill.current!);
      setDrag({ id: active.id, index: active.preview, width: active.width, height: active.height });
    }
    if (!pointerFrame.current) pointerFrame.current = requestAnimationFrame(updateDrag);
  }

  function moveTo(id: string, index: number) {
    if (gesture.current) return;
    captureLayout();
    onPositionChange(id, index);
    setAnnouncement(`Artifact moved to position ${index + 1} of ${tokens.length + 1}.`);
    requestAnimationFrame(() => pillNodes.current.get(id)?.focus({ preventScroll: true }));
  }

  function artifactNode(item: InlineArtifactItem) {
    const { id, artifact } = item;
    const activeDrag = drag?.id === id ? drag : null;
    const isPressed = pressed === id;
    const interactive = movable || Boolean(onSelectArtifact);
    return <ArtifactPill {...artifact} key={`artifact-${id}`} ref={node => { if (node) pillNodes.current.set(id, node); else pillNodes.current.delete(id); }}
      width={activeDrag ? `${activeDrag.width}px` : artifact.width} height={activeDrag ? `${activeDrag.height}px` : artifact.height}
      expanded={activeDrag ? false : artifact.expanded} hoverExpand={activeDrag ? false : artifact.hoverExpand}
      duration={activeDrag ? '0ms' : artifact.duration}
      tabIndex={interactive ? 0 : artifact.tabIndex} role={interactive ? 'button' : artifact.role}
      aria-label={artifact['aria-label'] || (interactive ? `${onSelectArtifact ? 'Edit' : 'Move'} artifact: ${artifact.alt}` : undefined)}
      aria-pressed={onSelectArtifact ? selectedId === id : undefined}
      aria-describedby={interactive ? instructionsId : undefined}
      contentEditable={editable ? false : undefined}
      data-artifact-id={id} data-artifact-position={item.position}
      data-artifact-selected={selectedId === id ? '' : undefined}
      data-artifact-dragging={activeDrag ? '' : undefined}
      style={{ ...artifact.style, marginInlineEnd: editable ? '.22em' : undefined, marginInlineStart: editable && item.position === tokens.length && text && !/\s$/u.test(text) ? '.22em' : undefined, cursor: movable ? (isPressed ? 'grabbing' : 'grab') : onSelectArtifact ? 'pointer' : undefined,
        touchAction: movable ? 'none' : undefined, userSelect: movable ? 'none' : undefined,
        zIndex: activeDrag ? 10 : undefined, opacity: isPressed && !activeDrag ? .82 : 1,
        boxShadow: activeDrag ? '0 12px 32px #0005, 0 2px 8px #0003' : undefined }}
      onPointerDown={event => pointerDown(event, item)}
      onClick={event => { if (!movable || event.detail === 0) onSelectArtifact?.(id); }}
      onKeyDown={event => {
        if (onSelectArtifact && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectArtifact(id); return; }
        if (!movable) return;
        const committed = clamp(item.position);
        const next = event.key === 'ArrowLeft' ? committed - 1 : event.key === 'ArrowRight' ? committed + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tokens.length : null;
        if (next !== null) { event.preventDefault(); moveTo(id, clamp(next)); }
      }} />;
  }

  const children: ReactNode[] = [];
  for (let index = 0; index <= tokens.length; index++) {
    const items = placements.filter(item => item.position === index);
    items.forEach((item, offset) => {
      children.push(artifactNode(item));
      if (!editable && (index < tokens.length || offset < items.length - 1)) children.push(<span key={`after-${item.id}`}> </span>);
    });
    if (index < tokens.length) {
      const token = tokens[index];
      children.push(<span key={`word-${index}`} data-artifact-word={index} style={{ display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere' }}>{token.trimEnd()}</span>);
      children.push(<span key={`space-${index}`}>{token.slice(token.trimEnd().length) || (!editable && index === tokens.length - 1 && placements.some(item => item.position === tokens.length) ? ' ' : '')}</span>);
    }
  }

  if (editable && text.endsWith('\n')) children.push(<br key="editor-tail" data-editor-tail="" />);
  if (!editor.composing.current) renderedChildren.current = [leadingSpace, ...children];

  return <>
    <div {...props} {...(editable ? editor.handlers : {})} ref={root}
      contentEditable={editable ? true : undefined} suppressContentEditableWarning={editable} spellCheck={false}
      role={editable ? 'textbox' : props.role} aria-label={editable ? (props['aria-label'] || 'Canvas text') : props['aria-label']} aria-multiline={editable ? true : undefined}
      data-artifact-empty={editable && !text ? '' : undefined} data-artifact-text="" data-artifact-position={placements[0]?.position ?? 0} data-artifact-dragging={drag ? '' : undefined}
      style={{ ...props.style, cursor: drag ? 'grabbing' : props.style?.cursor, userSelect: pressed ? 'none' : props.style?.userSelect }}
      onPointerMove={pointerMove} onPointerUp={event => { if (gesture.current?.pointer === event.pointerId) endGesture(true); }}
      onPointerCancel={event => { if (gesture.current?.pointer === event.pointerId) endGesture(false); }} onLostPointerCapture={event => { if (gesture.current?.pointer === event.pointerId) endGesture(false); }}>
      {renderedChildren.current}
    </div>
    <span id={instructionsId} style={hiddenStyle}>{onSelectArtifact ? 'Click or press Enter to edit this artifact. ' : ''}Drag to move the artifact and reflow the text. Use Left and Right arrow keys, or Home and End. Escape cancels a drag.</span>
    <span style={hiddenStyle} role="status" aria-live="polite">{announcement}</span>
  </>;
}
