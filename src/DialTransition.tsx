import { useId, useLayoutEffect, useRef } from 'react';
import { DialStore, TransitionControl, type TransitionConfig } from 'dialkit';

/** DialKit owns the editor mode; the selected pill remains the source of truth. */
export function DialTransition({ value, onChange }: {
  value: TransitionConfig; onChange: (value: TransitionConfig) => void;
}) {
  const panelId = useId();
  const initial = useRef(value);
  useLayoutEffect(() => {
    DialStore.registerPanel(panelId, 'Motion', { transition: initial.current });
    return () => DialStore.unregisterPanel(panelId);
  }, [panelId]);
  useLayoutEffect(() => {
    DialStore.updateValue(panelId, 'transition', value);
    DialStore.updateTransitionMode(panelId, 'transition', value.type === 'easing'
      ? 'easing' : value.visualDuration !== undefined ? 'simple' : 'advanced');
  }, [panelId, value]);
  return <TransitionControl panelId={panelId} path="transition" label="Transition" value={value} onChange={onChange} />;
}
