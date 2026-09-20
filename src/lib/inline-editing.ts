/** DOM editing helpers. Native input is read, then restored before React reconciles. */
export type TextSelection = { anchor: number; focus: number; afterAnchor: string[]; afterFocus: string[] };
export type TextState = { text: string; positions: Record<string, number>; selection?: TextSelection };
export type DOMSnapshot = { node: Node; value: string | null; children: DOMSnapshot[] };

export function snapshotDOM(node: Node): DOMSnapshot {
  return { node, value: node.nodeValue, children: Array.from(node.childNodes, snapshotDOM) };
}
export function restoreDOM(snapshot: DOMSnapshot) {
  const { node, value, children } = snapshot;
  if (node.nodeValue !== value) node.nodeValue = value;
  const current = Array.from(node.childNodes);
  if (current.length !== children.length || children.some((child, index) => current[index] !== child.node)) {
    (node as Element).replaceChildren(...children.map(child => child.node));
  }
  children.forEach(restoreDOM);
}

export function readDOM(root: Node) {
  let text = '';
  const offsets: Record<string, number> = {};
  let needsBoundary = false;
  function walk(node: Node) {
    if (node.nodeType === 3) {
      const value = (node.nodeValue || '').replaceAll('\u00a0', ' ');
      if (needsBoundary && value && text && !/\s$/u.test(text) && !/^\s/u.test(value)) text += ' ';
      if (value) needsBoundary = false;
      text += value;
      return;
    }
    const element = node as Element;
    if (element.nodeName === 'ARTIFACT-PILL') {
      const id = element.getAttribute('data-artifact-id');
      if (id) offsets[id] = text.length;
      needsBoundary = true;
      return;
    }
    if (element.nodeName === 'BR') {
      if (element.hasAttribute('data-editor-tail')) return;
      // A lone BR is the browser's caret placeholder in an empty editor.
      if (node.parentNode?.childNodes.length !== 1) text += '\n';
      return;
    }
    Array.from(node.childNodes).forEach((child, index) => {
      if (index && /^(DIV|P)$/u.test(child.nodeName) && !text.endsWith('\n')) text += '\n';
      walk(child);
    });
  }
  walk(root);
  return { text, offsets };
}

export function readSelection(root: HTMLElement): TextSelection | undefined {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return;
  function bookmark(node: Node, offset: number) {
    const range = root.ownerDocument.createRange();
    range.setStart(root, 0); range.setEnd(node, offset);
    const prefix = readDOM(range.cloneContents());
    return { offset: prefix.text.length, after: Object.keys(prefix.offsets) };
  }
  const anchor = bookmark(selection.anchorNode, selection.anchorOffset);
  const focus = bookmark(selection.focusNode, selection.focusOffset);
  return { anchor: anchor.offset, focus: focus.offset, afterAnchor: anchor.after, afterFocus: focus.after };
}

export function restoreSelection(root: HTMLElement, bookmark: TextSelection) {
  const document = root.ownerDocument;
  function point(wanted: number, after: string[]): [Node, number] {
    const tail = root.querySelector('[data-editor-tail]');
    if (tail && wanted === readDOM(root).text.length) return [root, Array.prototype.indexOf.call(root.childNodes, tail)];
    let count = 0;
    let result: [Node, number] = [root, root.childNodes.length];
    let found = false;
    function walk(node: Node) {
      if (found) return;
      if (node.nodeType === 3) {
        const length = node.nodeValue?.length || 0;
        if (wanted <= count + length) { result = [node, Math.max(0, wanted - count)]; found = true; }
        count += length;
      } else if (node.nodeName === 'ARTIFACT-PILL') {
        if (count === wanted) {
          const index = Array.prototype.indexOf.call(node.parentNode!.childNodes, node);
          result = [node.parentNode!, index + (after.includes((node as HTMLElement).dataset.artifactId || '') ? 1 : 0)];
          if (!after.includes((node as HTMLElement).dataset.artifactId || '')) found = true;
        }
      } else Array.from(node.childNodes).forEach(walk);
    }
    walk(root);
    // At a shared text offset, retain the side of the pill where typing occurred.
    for (const pill of root.querySelectorAll<HTMLElement>('artifact-pill')) {
      const range = document.createRange(); range.setStart(root, 0); range.setEndBefore(pill);
      if (readDOM(range.cloneContents()).text.length === wanted && after.includes(pill.dataset.artifactId || '')) {
        result = [pill.parentNode!, Array.prototype.indexOf.call(pill.parentNode!.childNodes, pill) + 1];
      }
    }
    return result;
  }
  const [anchor, anchorOffset] = point(bookmark.anchor, bookmark.afterAnchor);
  const [focus, focusOffset] = point(bookmark.focus, bookmark.afterFocus);
  document.getSelection()?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
}

export function wordOffset(text: string, position: number) {
  const words = [...text.matchAll(/\S+/gu)];
  return position < words.length ? words[position].index! : text.length;
}

/** Keep a pill near its surviving words when a selection deletes its DOM node. */
export function reconcilePositions(before: TextState, nextText: string, offsets: Record<string, number>) {
  let prefix = 0;
  while (prefix < before.text.length && prefix < nextText.length && before.text[prefix] === nextText[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.text.length - prefix && suffix < nextText.length - prefix && before.text.at(-1 - suffix) === nextText.at(-1 - suffix)) suffix++;
  const positions: Record<string, number> = {};
  for (const [id, position] of Object.entries(before.positions)) {
    const oldOffset = wordOffset(before.text, position);
    const fallback = oldOffset <= prefix ? oldOffset : oldOffset >= before.text.length - suffix ? oldOffset + nextText.length - before.text.length : prefix;
    const offset = offsets[id] ?? Math.max(0, Math.min(nextText.length, fallback));
    positions[id] = (nextText.slice(0, offset).match(/\S+/gu) || []).length;
  }
  return positions;
}
