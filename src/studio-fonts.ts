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
];
