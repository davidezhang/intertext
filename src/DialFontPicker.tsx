import type { CSSProperties, KeyboardEvent } from 'react';
import { studioFonts, type StudioFont } from './studio-fonts';

/** DialKit's segmented surfaces with type specimens and radio-group navigation. */
export function DialFontPicker({ value, onChange }: {
  value: StudioFont; onChange: (font: StudioFont) => void;
}) {
  const selectedIndex = studioFonts.findIndex(font => font.id === value.id);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (direction === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? studioFonts.length - 1
      : (selectedIndex + direction! + studioFonts.length) % studioFonts.length;
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
    onChange(studioFonts[index]);
  }

  return <div className="font-picker dialkit-segmented" role="radiogroup" aria-label="Font family"
    onKeyDown={handleKeyDown} style={{ '--font-count': studioFonts.length, '--font-index': selectedIndex } as CSSProperties}>
    <span className="dialkit-segmented-pill" aria-hidden="true" />
    {studioFonts.map(font => <button key={font.id} type="button" role="radio"
      className="font-option dialkit-segmented-button" data-active={font.id === value.id}
      aria-checked={font.id === value.id} aria-label={`${font.label} — ${font.name}`}
      tabIndex={font.id === value.id ? 0 : -1} title={font.name} onClick={() => onChange(font)}>
      <span className="font-specimen" style={{ fontFamily: font.family }} aria-hidden="true">Ag</span>
      <span className="font-label" aria-hidden="true">{font.label}</span>
    </button>)}
  </div>;
}
