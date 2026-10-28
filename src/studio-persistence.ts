import type { TransitionConfig } from 'dialkit';
import type { MediaFit, MediaKind } from './lib/artifact-pill';
import { SITE } from './studio-export';
import { studioFonts, type StudioFont } from './studio-fonts';
import { compileTransition } from './studio-motion';
import { createPill, defaultText, isMediaMissing, missingMedia, samples, starterPills, type Media, type PillConfig } from './studio-model';

export type StudioComposition = { text: string; pills: PillConfig[]; font: StudioFont; fontSize: number; dark: boolean; viewport?: 'desktop' | 'mobile' };
type Data = Record<string, unknown>;
type PillFields = Partial<Record<keyof PillConfig, unknown>> & { media: Media };

export const storageKey = 'intertext.composition';
const maxPills = 200;
const maxFileSize = 1_000_000;
const kinds: readonly MediaKind[] = ['image', 'gif', 'video', 'audio'];
const fits: readonly MediaFit[] = ['crop', 'fit', 'fill'];
// Springs from kits that predate saved transitions keep their exact curve; the editor starts from DialKit's default.
const sampledSpring: TransitionConfig = { type: 'spring', visualDuration: .3, bounce: .2 };
const decimal = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const notComposition = 'Choose the composition.json file from a downloaded Intertext kit.';

const isData = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const range = (value: unknown, min: number, max: number, fallback: number) => isNumber(value) ? clamp(value, min, max) : fallback;
const oneOf = <T,>(value: unknown, options: readonly T[], fallback: T) => options.includes(value as T) ? value as T : fallback;
const wordCount = (text: string) => (text.match(/\S+/gu) || []).length;

export function starterComposition(): StudioComposition {
  return { text: defaultText, pills: starterPills(), font: studioFonts[0], fontSize: 100, dark: true, viewport: 'desktop' };
}

export function nextPillNumber(pills: PillConfig[]) {
  return Math.max(0, ...pills.map(pill => Number(pill.id.slice(5)) || 0)) + 1;
}

export function missingMediaNote(pills: PillConfig[]) {
  const count = pills.filter(pill => isMediaMissing(pill.media)).length;
  return !count ? '' : count === 1 ? '1 pill needs its media uploaded again.' : `${count} pills need their media uploaded again.`;
}

/** "3.3em" becomes 3.3. Other units are not studio values. */
function unit(value: unknown, suffix: string) {
  if (typeof value !== 'string' || !new RegExp(`^${decimal}${suffix}$`, 'i').test(value.trim())) return undefined;
  return Number(value.trim().slice(0, -suffix.length));
}

function cubicBezier(value: string) {
  const ease = new RegExp(`^cubic-bezier\\((\\s*${decimal}\\s*(?:,\\s*${decimal}\\s*){3})\\)$`, 'i').exec(value)?.[1].split(',').map(Number);
  return ease && ease[0] >= 0 && ease[0] <= 1 && ease[2] >= 0 && ease[2] <= 1 ? ease : undefined;
}

/** Only the two curves the studio writes: a Bézier, or a spring sampled into linear(). */
function readEasing(value: unknown) {
  if (typeof value !== 'string' || value.length > 20_000) return undefined;
  return /^linear\([\d\s.,%-]+\)$/.test(value) || cubicBezier(value) ? value : undefined;
}

/** DialKit's control ranges, so the editor can show every imported value. */
function readTransition(value: unknown): TransitionConfig | undefined {
  if (!isData(value)) return undefined;
  if (value.type === 'easing') {
    const { duration, ease } = value;
    if (!isNumber(duration) || !Array.isArray(ease) || ease.length !== 4 || !ease.every(isNumber)) return undefined;
    return { type: 'easing', duration: clamp(duration, .1, 2), ease: [clamp(ease[0], 0, 1), clamp(ease[1], -1, 2), clamp(ease[2], 0, 1), clamp(ease[3], -1, 2)] };
  }
  if (value.type !== 'spring') return undefined;
  if (isNumber(value.visualDuration)) return { type: 'spring', visualDuration: clamp(value.visualDuration, .1, 1), bounce: range(value.bounce, 0, 1, .2) };
  if (![value.stiffness, value.damping, value.mass].some(isNumber)) return undefined;
  return { type: 'spring', stiffness: range(value.stiffness, 1, 1000, 400), damping: range(value.damping, 1, 100, 17), mass: range(value.mass, .1, 10, 1) };
}

/** The rendered timing wins. Its editable transition is kept, rebuilt from a Bézier, or compiled when only it is valid. */
function motion(fields: PillFields, fallback: PillConfig) {
  const transition = readTransition(fields.transition);
  const duration = isNumber(fields.duration) && fields.duration >= 0 && fields.duration <= 20_000 ? fields.duration : undefined;
  const easing = readEasing(fields.easing);
  if (duration !== undefined && easing) {
    return { transition: transition ?? readTransition({ type: 'easing', duration: duration / 1000, ease: cubicBezier(easing) }) ?? sampledSpring, duration, easing };
  }
  if (transition) return { transition, ...compileTransition(transition) };
  return { transition: fallback.transition, duration: fallback.duration, easing: fallback.easing };
}

function buildPill(fields: PillFields, number: number, words: number): PillConfig {
  const base = createPill(`pill-${number}`, number, 0);
  return {
    ...base, media: fields.media, position: Math.round(range(fields.position, 0, words, 0)),
    width: range(fields.width, .5, 6, base.width), height: range(fields.height, .35, 2.5, base.height),
    radius: range(fields.radius, 0, 200, base.radius), fit: oneOf(fields.fit, fits, base.fit),
    focalX: range(fields.focalX, 0, 100, 50), focalY: range(fields.focalY, 0, 100, 50),
    expandedWidth: range(fields.expandedWidth, .5, 7, base.expandedWidth), expandedHeight: range(fields.expandedHeight, .35, 3.5, base.expandedHeight),
    ...motion(fields, base),
    hover: fields.hover === true, loop: fields.loop === true, playOnHover: fields.playOnHover === true,
    paused: typeof fields.paused === 'boolean' ? fields.paused : fields.media.kind === 'audio',
  };
}

/** Studio ids such as pill-3 keep their names; missing or repeated ids get the next free number. */
function pillNumbers(ids: unknown[]) {
  const used = new Set<number>();
  const kept = ids.map(id => {
    const value = typeof id === 'string' && /^pill-[1-9]\d{0,5}$/.test(id) ? Number(id.slice(5)) : 0;
    if (!value || used.has(value)) return 0;
    used.add(value);
    return value;
  });
  let next = Math.max(0, ...kept);
  return kept.map(value => value || ++next);
}

function webURL(value: unknown) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return undefined;
  try { return new URL(value).href; } catch { return undefined; }
}

function sampleAt(value: unknown) {
  if (typeof value !== 'string') return undefined;
  try {
    const href = new URL(value, SITE).href;
    return samples.find(sample => new URL(sample.src, SITE).href === href);
  } catch { return undefined; }
}

function storedMedia(value: unknown): Media {
  const media = isData(value) ? value : {};
  const sample = samples.find(item => item.id === media.id);
  const alt = typeof media.alt === 'string' ? media.alt : sample?.alt ?? '';
  if (sample) return { ...sample, alt };
  const kind = oneOf(media.kind, kinds, 'image');
  const src = webURL(media.src);
  if (media.id === 'url' && src) return { id: 'url', name: 'Linked media', kind, src, alt };
  // Uploads only lived in the previous page's memory.
  return missingMedia(typeof media.name === 'string' && media.name ? media.name : 'Uploaded media', kind, alt);
}

function importedMedia(artifact: Data, source: unknown, poster: unknown): Media {
  const alt = typeof artifact.alt === 'string' ? artifact.alt : undefined;
  const sample = sampleAt(source);
  if (sample) return { ...sample, alt: alt ?? sample.alt };
  const kind = oneOf(artifact.kind, kinds, 'image');
  const src = webURL(source);
  const posterURL = webURL(poster);
  if (src) return { id: 'url', name: 'Linked media', kind, src, alt: alt ?? '', ...(posterURL ? { poster: posterURL } : {}) };
  // Uploads travel as kit files, so a relative path names the file to upload again.
  const file = typeof artifact.src === 'string' && !artifact.src.includes(':') ? artifact.src.split(/[?#]/)[0].split('/').pop()?.slice(0, 120) : '';
  return missingMedia(file || 'Uploaded media', kind, alt ?? '');
}

/** Reads a kit's composition.json (schemaVersion 1) as untrusted data. Throws a message for the person opening it. */
export function importComposition(data: unknown): StudioComposition {
  if (!isData(data) || !isNumber(data.schemaVersion) || typeof data.text !== 'string' || !Array.isArray(data.artifacts)) throw new Error(notComposition);
  if (data.schemaVersion !== 1) throw new Error(data.schemaVersion > 1 ? 'This composition needs a newer version of the Intertext studio.' : notComposition);
  const text = data.text.replace(/\r\n?/g, '\n');
  const words = wordCount(text);
  // The kit maps each local media path back to its source: a studio sample, an external URL, or an upload.
  const sources = new Map<string, unknown[]>();
  for (const entry of Array.isArray(data.media) ? data.media.filter(isData) : []) {
    if (typeof entry.artifactId !== 'string' || typeof entry.property !== 'string') continue;
    const key = `${entry.property} ${entry.artifactId}`;
    sources.set(key, [...sources.get(key) ?? [], entry.source]);
  }
  const source = (id: unknown, property: string, fallback: unknown) => (typeof id === 'string' ? sources.get(`${property} ${id}`)?.shift() : undefined) ?? fallback;
  const items = data.artifacts.filter((item): item is Data & { artifact: Data } => isData(item) && isData(item.artifact)).slice(0, maxPills);
  const ids = pillNumbers(items.map(item => item.id));
  const typography = isData(data.typography) ? data.typography : {};
  const fontId = isData(typography.font) ? typography.font.id : undefined;
  return {
    text, font: studioFonts.find(font => font.id === fontId) ?? studioFonts[0],
    fontSize: Math.round(range(typography.scale, 50, 160, 100)), dark: data.theme !== 'light',
    pills: items.map(({ artifact, ...item }, index) => {
      const [focalX, focalY] = typeof artifact.position === 'string' ? artifact.position.trim().split(/\s+/).map(value => unit(value, '%')) : [];
      return buildPill({
        position: item.position, media: importedMedia(artifact, source(item.id, 'src', artifact.src), source(item.id, 'poster', artifact.poster)),
        width: unit(artifact.width, 'em'), height: unit(artifact.height, 'em'), radius: unit(artifact.radius, 'px'), fit: artifact.fit, focalX, focalY,
        expandedWidth: unit(artifact.expandedWidth, 'em'), expandedHeight: unit(artifact.expandedHeight, 'em'),
        transition: item.transition, duration: unit(artifact.duration, 'ms'), easing: artifact.easing,
        hover: artifact.hoverExpand, loop: artifact.loop, paused: artifact.paused === true, playOnHover: artifact.playOnHover,
      }, ids[index], words);
    }),
  };
}

export async function readCompositionFile(file: Blob) {
  if (await file.slice(0, 2).text() === 'PK') throw new Error('Unzip the kit first, then choose its composition.json file.');
  if (file.size > maxFileSize) throw new Error('That file is too large to be an Intertext composition.');
  const text = await file.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error(notComposition); }
  return importComposition(data);
}

/** A stable snapshot without preview state, so looping pills do not rewrite storage. */
export function serializeComposition({ text, pills, font, fontSize, dark, viewport }: StudioComposition) {
  return JSON.stringify({ version: 1, text, font: font.id, fontSize, dark, viewport, pills: pills.map(({ name, expanded, media: { credit, ...media }, ...pill }) => ({
    ...pill, media: media.src.startsWith('blob:') ? missingMedia(media.name, media.kind, media.alt) : media,
  })) });
}

/** Validates a saved snapshot. A damaged or unknown snapshot restores nothing. */
export function restoreComposition(data: unknown): StudioComposition | null {
  if (!isData(data) || data.version !== 1 || typeof data.text !== 'string' || !Array.isArray(data.pills)) return null;
  const words = wordCount(data.text);
  const items = data.pills.filter(isData).slice(0, maxPills);
  const ids = pillNumbers(items.map(item => item.id));
  return {
    text: data.text, font: studioFonts.find(font => font.id === data.font) ?? studioFonts[0],
    fontSize: Math.round(range(data.fontSize, 50, 160, 100)), dark: data.dark !== false, viewport: data.viewport === 'mobile' ? 'mobile' : 'desktop',
    pills: items.map((item, index) => buildPill({ ...item, media: storedMedia(item.media) }, ids[index], words)),
  };
}

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

// Storage may be missing, blocked or full. The studio keeps working without it.
export function loadComposition(storage: Pick<Storage, 'getItem'> | null = browserStorage()) {
  try {
    const saved = storage?.getItem(storageKey);
    return saved ? restoreComposition(JSON.parse(saved)) : null;
  } catch { return null; }
}

export function saveComposition(snapshot: string, storage: Pick<Storage, 'setItem'> | null = browserStorage()) {
  if (!storage) return false;
  try { storage.setItem(storageKey, snapshot); return true; } catch { return false; }
}
