import { useEffect, useLayoutEffect, useRef, type RefObject, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { readDOM, readSelection, reconcilePositions, restoreDOM, restoreSelection, snapshotDOM, type DOMSnapshot, type TextSelection, type TextState } from './inline-editing.js';

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
export type TextChange = (text: string, positions: Record<string, number>) => void;

export function useInlineEditing(root: RefObject<HTMLDivElement | null>, text: string, positions: Record<string, number>, onChange?: TextChange) {
  const composing = useRef(false);
  const snapshot = useRef<DOMSnapshot | null>(null);
  const current = useRef<TextState>({ text, positions });
  const beforeSelection = useRef<TextSelection | undefined>(undefined);
  const pendingSelection = useRef<TextSelection | undefined>(undefined);
  const history = useRef<{ past: TextState[]; future: TextState[] }>({ past: [], future: [] });
  const lastEdit = useRef<{ kind: string; time: number; focus?: number } | null>(null);
  const expected = useRef(JSON.stringify([text, positions]));
  const nativeInput = useRef<(event: InputEvent) => void>(() => {});

  useBrowserLayoutEffect(() => {
    if (!root.current || !onChange || composing.current) return;
    const key = JSON.stringify([text, positions]);
    if (key !== expected.current) { history.current = { past: [], future: [] }; lastEdit.current = null; }
    expected.current = key;
    current.current = { text, positions };
    if (pendingSelection.current && root.current === document.activeElement) restoreSelection(root.current, pendingSelection.current);
    pendingSelection.current = undefined;
    snapshot.current = snapshotDOM(root.current);
  });

  function apply(state: TextState) {
    if (!onChange || !root.current) return;
    if (snapshot.current) restoreDOM(snapshot.current);
    expected.current = JSON.stringify([state.text, state.positions]);
    pendingSelection.current = state.selection;
    flushSync(() => onChange(state.text, state.positions));
    // Also restore a caret when the text itself did not change.
    if (pendingSelection.current) { restoreSelection(root.current, pendingSelection.current); pendingSelection.current = undefined; }
    current.current = { text: state.text, positions: state.positions };
    snapshot.current = snapshotDOM(root.current);
  }

  function commit(kind = 'input') {
    if (!root.current || !onChange || composing.current) return;
    const next = readDOM(root.current);
    const selection = readSelection(root.current);
    const updated = reconcilePositions(current.current, next.text, next.offsets);
    const before = { ...current.current, selection: beforeSelection.current };
    const changed = next.text !== before.text || JSON.stringify(updated) !== JSON.stringify(before.positions);
    if (changed) {
      const previous = lastEdit.current;
      const grouped = kind === 'insertText' && previous?.kind === kind && performance.now() - previous.time < 1000
        && beforeSelection.current?.anchor === previous.focus && beforeSelection.current?.focus === previous.focus;
      if (!grouped) { history.current.past.push(before); if (history.current.past.length > 100) history.current.past.shift(); }
      history.current.future = [];
      lastEdit.current = { kind, time: performance.now(), focus: selection?.focus };
    }
    apply({ text: next.text, positions: updated, selection });
  }

  function travel(redo: boolean) {
    const from = redo ? history.current.future : history.current.past;
    const destination = from.pop();
    if (!destination || !root.current) return;
    (redo ? history.current.past : history.current.future).push({ ...current.current, selection: readSelection(root.current) });
    lastEdit.current = null;
    apply(destination);
  }

  function replaceSelection(value: string, kind: string) {
    if (!root.current) return;
    const selection = document.getSelection();
    if (!selection?.rangeCount || !selection.anchorNode || !selection.focusNode || !root.current.contains(selection.anchorNode) || !root.current.contains(selection.focusNode)) return;
    beforeSelection.current = readSelection(root.current);
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(value.replace(/\r\n?/g, '\n'));
    range.insertNode(node);
    range.setStartAfter(node); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    commit(kind);
  }

  nativeInput.current = event => {
    if (!onChange || composing.current) return;
    beforeSelection.current = root.current ? readSelection(root.current) : undefined;
    if (!event.cancelable) return;
    if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
      event.preventDefault(); replaceSelection('\n', event.inputType);
    } else if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault(); travel(event.inputType === 'historyRedo');
    } else if (event.inputType.startsWith('format')) event.preventDefault();
  };
  useEffect(() => {
    const element = root.current;
    if (!element || !onChange) return;
    const handle = (event: Event) => nativeInput.current(event as InputEvent);
    element.addEventListener('beforeinput', handle);
    return () => element.removeEventListener('beforeinput', handle);
  }, [Boolean(onChange)]);

  function copy(event: ClipboardEvent<HTMLDivElement>, cut = false) {
    const selection = document.getSelection();
    if (!onChange || !selection?.rangeCount || !root.current || !selection.anchorNode || !selection.focusNode || !root.current.contains(selection.anchorNode) || !root.current.contains(selection.focusNode)) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', readDOM(selection.getRangeAt(0).cloneContents()).text);
    if (cut) replaceSelection('', 'deleteByCut');
  }

  return { composing, handlers: {
    onInput: (event: FormEvent<HTMLDivElement>) => { if (!(event.nativeEvent as InputEvent).isComposing) commit((event.nativeEvent as InputEvent).inputType); },
    onCompositionStart: () => { composing.current = true; beforeSelection.current = root.current ? readSelection(root.current) : undefined; },
    onCompositionEnd: () => { composing.current = false; commit('composition'); },
    onPaste: (event: ClipboardEvent<HTMLDivElement>) => { if (!onChange) return; event.preventDefault(); replaceSelection(event.clipboardData.getData('text/plain'), 'insertFromPaste'); },
    onCopy: (event: ClipboardEvent<HTMLDivElement>) => copy(event),
    onCut: (event: ClipboardEvent<HTMLDivElement>) => copy(event, true),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (!onChange || (event.target as HTMLElement).closest('artifact-pill') || composing.current) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && (key === 'z' || key === 'y')) {
        event.preventDefault(); travel(key === 'y' || event.shiftKey);
      } else if (key === 'escape') { event.preventDefault(); root.current?.blur(); }
    },
  } };
}
