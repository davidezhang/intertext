type Bounds = Pick<DOMRectReadOnly, 'left' | 'right' | 'top' | 'bottom'>;
type ActiveHover = { element: HTMLElement; origin: Bounds };

const controllers = new WeakMap<Document, PillHoverController>();

/** One pointer owner per document; layout-generated enter/leave events never own hover. */
class PillHoverController {
  readonly elements = new Set<HTMLElement>();
  private active?: ActiveHover;
  private lastPoint?: { x: number; y: number; id: number };

  constructor(private document: Document) {
    document.addEventListener('pointermove', this.move, true);
    document.addEventListener('pointerdown', this.down, true);
    document.addEventListener('pointerout', this.out, true);
    document.addEventListener('pointercancel', this.reset, true);
    document.addEventListener('scroll', this.layoutChanged, true);
    document.addEventListener('visibilitychange', this.reset);
    document.defaultView?.addEventListener('blur', this.reset);
    document.defaultView?.addEventListener('resize', this.layoutChanged);
  }

  release(element?: HTMLElement) {
    if (element && this.active?.element !== element) return;
    this.active?.element.removeAttribute('data-hover-active');
    this.active = undefined;
  }

  private reset = () => { this.release(); this.lastPoint = undefined; };
  // Scroll/resize can themselves synthesize pointer events at unchanged coordinates.
  private layoutChanged = () => this.release();

  private move = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.isPrimary === false) return;
    if (event.buttons) return; // Dragging must not acquire another pill under the pointer.
    const { clientX: x, clientY: y, pointerId: id } = event;
    if (this.lastPoint?.x === x && this.lastPoint.y === y && this.lastPoint.id === id) return;
    this.lastPoint = { x, y, id };

    if (this.active) {
      const { element, origin } = this.active;
      const current = element.getBoundingClientRect();
      // Keep a corridor between the initial hit area and the animated pill. Wrapping
      // may move the pill away from a stationary pointer, or put a sibling under it.
      if (x >= Math.min(origin.left, current.left) && x <= Math.max(origin.right, current.right)
        && y >= Math.min(origin.top, current.top) && y <= Math.max(origin.bottom, current.bottom)) return;
    }

    const candidate = event.composedPath().find(node => this.elements.has(node as HTMLElement)
      && ((node as HTMLElement).hasAttribute('hover-expand') || (node as HTMLElement).hasAttribute('play-on-hover'))) as HTMLElement | undefined;
    const origin = candidate?.getBoundingClientRect();
    this.release();
    if (candidate && origin) {
      this.active = { element: candidate, origin };
      candidate.setAttribute('data-hover-active', '');
    }
  };

  private down = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || (this.active && !event.composedPath().includes(this.active.element))) this.release();
  };

  private out = (event: PointerEvent) => {
    if (!event.relatedTarget) this.reset(); // Leaving the document, not a moving pill.
  };

  dispose() {
    this.reset();
    const document = this.document;
    document.removeEventListener('pointermove', this.move, true);
    document.removeEventListener('pointerdown', this.down, true);
    document.removeEventListener('pointerout', this.out, true);
    document.removeEventListener('pointercancel', this.reset, true);
    document.removeEventListener('scroll', this.layoutChanged, true);
    document.removeEventListener('visibilitychange', this.reset);
    document.defaultView?.removeEventListener('blur', this.reset);
    document.defaultView?.removeEventListener('resize', this.layoutChanged);
    controllers.delete(document);
  }
}

export function connectPillHover(element: HTMLElement) {
  const document = element.ownerDocument;
  let controller = controllers.get(document);
  if (!controller) { controller = new PillHoverController(document); controllers.set(document, controller); }
  controller.elements.add(element);
  const owner = controller;
  return {
    update: () => { if (!element.hasAttribute('hover-expand') && !element.hasAttribute('play-on-hover')) owner.release(element); },
    disconnect: () => {
      owner.release(element);
      owner.elements.delete(element);
      if (!owner.elements.size) owner.dispose();
    },
  };
}
