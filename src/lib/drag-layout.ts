/** Pure geometry and motion helpers, shared by the pointer interaction and tests. */
export type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Axis = { value: number; velocity: number };

export function containsPoint(box: Box, point: Point, padding = 0) {
  return point.x >= box.left - padding && point.x <= box.right + padding && point.y >= box.top - padding && point.y <= box.bottom + padding;
}

/** The live pill's layout slot owns its area, so reflow cannot flip its own target. */
export function findInsertion(words: Box[], point: Point, slot: Box, current: number) {
  if (containsPoint(slot, point, 10)) return current;
  if (!words.length) return 0;
  let index = current;
  let best = Infinity;
  words.forEach((box, word) => {
    const verticalDistance = Math.max(box.top - point.y, point.y - box.bottom, 0) * 3;
    for (const [x, boundary] of [[box.left, word], [box.right, word + 1]]) {
      const distance = Math.hypot(point.x - x, verticalDistance);
      if (distance < best) { best = distance; index = boundary; }
    }
  });
  return index;
}

/** Exact critically damped solution: independent of frame rate, retaining velocity. */
export function stepSpring(axis: Axis, seconds: number, response = .32): Axis {
  const omega = 2 * Math.PI / response;
  const decay = Math.exp(-omega * seconds);
  const coefficient = axis.velocity + omega * axis.value;
  return {
    value: (axis.value + coefficient * seconds) * decay,
    velocity: (axis.velocity - omega * coefficient * seconds) * decay,
  };
}

export function isSettled(axis: Axis) {
  return Math.abs(axis.value) < .1 && Math.abs(axis.velocity) < 2;
}
