import { spring } from 'motion';
import type { TransitionConfig } from 'dialkit';

/** Compile editor values to portable CSS; the pill itself needs no animation library. */
export function compileTransition(transition: TransitionConfig) {
  if (transition.type === 'easing') {
    return {
      duration: Math.round(transition.duration * 1000),
      easing: `cubic-bezier(${transition.ease.join(', ')})`,
    };
  }
  // Motion samples the complete spring, including its settling tail, into CSS linear().
  const css = String(spring({ ...transition, keyframes: [0, 1] }));
  const separator = css.indexOf(' ');
  return { duration: parseFloat(css), easing: css.slice(separator + 1) };
}
