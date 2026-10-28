import type { CSSProperties } from 'react';
import type { ArtifactPillProps } from './lib/react';
import type { MediaFit, MediaKind } from './lib/artifact-pill';
import type { TransitionConfig } from 'dialkit';

export type Media = { id: string; name: string; kind: MediaKind; src: string; poster?: string; alt: string; credit?: { name: string; url: string } };
export const samples: Media[] = [
  { id: 'concrete', name: 'Concrete study', kind: 'image', src: '/media/concrete.jpg', alt: 'Angular concrete beams and recessed windows in monochrome',
    credit: { name: 'Marc Cordeau', url: 'https://unsplash.com/photos/Z3MsCdxNJg4' } },
  { id: 'analog', name: 'Analog loop', kind: 'gif', src: '/media/analog-loop.gif', poster: '/media/analog-loop.jpg', alt: 'A monochrome close-up of a spinning vinyl record and tonearm',
    credit: { name: 'emirkhan bal', url: 'https://www.pexels.com/video/spinning-vinyl-record-7202466/' } },
  { id: 'architecture', name: 'Escalator study', kind: 'video', src: '/media/escalator-motion.mp4', poster: '/media/escalator-motion.jpg', alt: 'A monochrome ascent through a steel and glass escalator',
    credit: { name: 'Therese B.', url: 'https://www.pexels.com/video/black-and-white-urban-escalator-scene-32250489/' } },
  { id: 'soundtrack', name: 'Film music', kind: 'audio', src: '/media/intertext-music.m4a', alt: 'The Intertext demo film’s synth music, without UI sound effects' },
  { id: 'chair', name: 'Shell chair', kind: 'image', src: '/media/shell-chair.jpg', alt: 'A black shell chair casting a soft shadow on a pale gray floor',
    credit: { name: 'Resource Database', url: 'https://unsplash.com/photos/rZ1RPEom9gs' } },
];
export const defaultText = 'Designing text interfaces for new forms of computing.';
export type PillConfig = {
  id: string; name: string; position: number; media: Media;
  width: number; height: number; radius: number; fit: MediaFit; focalX: number; focalY: number;
  expandedWidth: number; expandedHeight: number; transition: TransitionConfig;
  duration: number; easing: string; hover: boolean; expanded: boolean; loop: boolean; paused: boolean; playOnHover: boolean;
};
export function createPill(id: string, number: number, position: number): PillConfig {
  return { id, name: `Pill ${number}`, position, media: { ...samples[(number - 1) % samples.length] },
    width: 3.3, height: .85, radius: 200, fit: 'crop', focalX: 50, focalY: 50,
    expandedWidth: 5.12, expandedHeight: 1.11,
    transition: { type: 'easing', duration: .65, ease: [.22, 1, .36, 1] },
    duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', hover: false, expanded: false, loop: false, playOnHover: false, paused: samples[(number - 1) % samples.length].kind === 'audio' };
}
/** The composition a new studio, and Start over, begins with. */
export function starterPills(): PillConfig[] {
  const pill = createPill('pill-1', 1, 1);
  return [{ ...pill, media: { ...(samples.find(sample => sample.kind === 'video') ?? pill.media) }, hover: true, expandedHeight: pill.height }];
}
/** Uploads and kit files the studio cannot read again keep their pill until they are uploaded again. */
export function missingMedia(name: string, kind: MediaKind, alt: string): Media {
  return { id: 'missing', name, kind, src: '', alt };
}
export const isMediaMissing = (media: Media) => media.id === 'missing';
function missingMediaImage(dark: boolean) {
  // No intrinsic size, so the stripes keep their spacing and the upload mark scales with the pill height.
  const [fill, stripe, mark] = dark ? ['#222', '#2c2c2c', '#8c8c8c'] : ['#dedede', '#d2d2d2', '#6f6f6f'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><pattern id="s" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="8" fill="${stripe}"/></pattern></defs><rect width="100%" height="100%" fill="${fill}"/><rect width="100%" height="100%" fill="url(#s)"/><svg y="28%" height="44%" viewBox="0 0 24 24" fill="none" stroke="${mark}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
export function randomPosition(wordCount: number, occupied: number[], random = Math.random) {
  const boundaries = Array.from({ length: wordCount + 1 }, (_, index) => index);
  const empty = boundaries.filter(index => !occupied.includes(index));
  const choices = empty.length ? empty : boundaries;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
export function artifactProps(pill: PillConfig, dark: boolean, reducedMotion: boolean): ArtifactPillProps {
  const missing = isMediaMissing(pill.media);
  return {
    src: pill.media.src, kind: pill.media.kind, alt: pill.media.alt, poster: pill.media.poster,
    width: `${pill.width}em`, height: `${pill.height}em`, radius: `${pill.radius}px`, fit: pill.fit,
    position: `${pill.focalX}% ${pill.focalY}%`, duration: `${pill.duration}ms`, easing: pill.easing,
    hoverExpand: pill.hover && !reducedMotion, expanded: pill.expanded && !reducedMotion,
    expandedWidth: `${pill.expandedWidth}em`, expandedHeight: `${pill.expandedHeight}em`, paused: pill.paused, playOnHover: pill.playOnHover, loop: pill.loop,
    'aria-label': `Edit ${pill.name.toLowerCase()}: ${missing ? 'media missing, upload it again' : pill.media.alt}`,
    style: { '--artifact-focus': dark ? '#fff' : '#000' } as CSSProperties,
    // The placeholder keeps the pill's shape and motion; its playback settings wait for the upload.
    ...(missing ? { src: missingMediaImage(dark), kind: 'image', fit: 'crop', position: '50% 50%', poster: undefined, playOnHover: false } as const : {}),
  };
}
/** Every export gets display props plus the transition that compiled them, so a kit can be reopened. */
export function exportArtifacts(pills: PillConfig[], dark: boolean) {
  return pills.map(pill => ({ id: pill.id, position: pill.position, artifact: artifactProps(pill, dark, false), transition: pill.transition }));
}
