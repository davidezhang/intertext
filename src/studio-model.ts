import type { CSSProperties } from 'react';
import type { ArtifactPillProps } from './lib/react';
import type { MediaFit, MediaKind } from './lib/artifact-pill';

export type Media = { id: string; name: string; kind: MediaKind; src: string; poster?: string; alt: string };
export const samples: Media[] = [
  { id: 'alpine', name: 'Alpine still', kind: 'image', src: '/media/alpine-lake.jpg', alt: 'An alpine lake surrounded by forest and mountains' },
  { id: 'petals', name: 'In bloom', kind: 'gif', src: '/media/flowers.gif', poster: '/media/flowers.jpg', alt: 'Pink flowers gently moving in the breeze' },
  { id: 'motion', name: 'A moving moment', kind: 'video', src: '/media/flowers.mp4', poster: '/media/flowers.jpg', alt: 'A close-up video of flowers in a garden' },
];
export const defaultText = 'Designing coherent systems for new computing interfaces.';
export const easingOptions = { Smooth: 'cubic-bezier(.22, 1, .36, 1)', Gentle: 'ease-in-out', Snappy: 'cubic-bezier(.16, 1, .3, 1)', Linear: 'linear' };
export type PillConfig = {
  id: string; name: string; position: number; media: Media;
  width: number; height: number; radius: number; fit: MediaFit; focalX: number; focalY: number;
  duration: number; easing: keyof typeof easingOptions; hover: boolean; expanded: boolean; loop: boolean; paused: boolean;
};
export function createPill(id: string, number: number, position: number): PillConfig {
  return { id, name: `Pill ${number}`, position, media: { ...samples[(number - 1) % samples.length] },
    width: 3.3, height: .85, radius: 200, fit: 'crop', focalX: 50, focalY: 50,
    duration: 650, easing: 'Smooth', hover: false, expanded: false, loop: false, paused: false };
}
export function randomPosition(wordCount: number, occupied: number[], random = Math.random) {
  const boundaries = Array.from({ length: wordCount + 1 }, (_, index) => index);
  const empty = boundaries.filter(index => !occupied.includes(index));
  const choices = empty.length ? empty : boundaries;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
export function artifactProps(pill: PillConfig, dark: boolean, reducedMotion: boolean): ArtifactPillProps {
  return {
    src: pill.media.src, kind: pill.media.kind, alt: pill.media.alt, poster: pill.media.poster,
    width: `${pill.width}em`, height: `${pill.height}em`, radius: `${pill.radius}px`, fit: pill.fit,
    position: `${pill.focalX}% ${pill.focalY}%`, duration: `${pill.duration}ms`, easing: easingOptions[pill.easing],
    hoverExpand: pill.hover && !reducedMotion, expanded: pill.expanded && !reducedMotion,
    expandedWidth: `${Math.min(7, pill.width * 1.55).toFixed(2)}em`, expandedHeight: `${(pill.height * 1.3).toFixed(2)}em`, paused: pill.paused,
    'aria-label': `Edit ${pill.name.toLowerCase()}: ${pill.media.alt}`,
    style: { '--artifact-focus': dark ? '#fff' : '#000' } as CSSProperties,
  };
}
