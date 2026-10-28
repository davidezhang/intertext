export interface StudioFont {
  id: string;
  label: string;
  name: string;
  family: string;
  letterSpacing: string;
  mobileLetterSpacing: string;
  stylesheetUrl?: string;
}

// Add future typefaces here; the picker divides its width between the options.
export const studioFonts: readonly StudioFont[] = [
  {
    id: 'default',
    label: 'Default',
    name: 'Helvetica Neue',
    family: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    letterSpacing: '-.058em',
    mobileLetterSpacing: '-.055em',
  },
  {
    id: 'instrument-serif',
    label: 'Serif',
    name: 'Instrument Serif',
    family: "'Instrument Serif', Georgia, serif",
    letterSpacing: '-.02em',
    mobileLetterSpacing: '-.02em',
    stylesheetUrl: 'https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap',
  },
  {
    // DialKit already loads Geist Mono for its values, so the studio needs no extra request.
    id: 'geist-mono',
    label: 'Mono',
    name: 'Geist Mono',
    family: "'Geist Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
    letterSpacing: '-.06em',
    mobileLetterSpacing: '-.05em',
    stylesheetUrl: 'https://fonts.googleapis.com/css2?family=Geist+Mono&display=swap',
  },
];
