import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// The studio model has no runtime imports; run the same source used by the app.
const source = readFileSync(new URL('../src/studio-model.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { randomPosition, createPill, artifactProps } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const motionSource = readFileSync(new URL('../src/studio-motion.ts', import.meta.url), 'utf8');
const motionOutput = ts.transpileModule(motionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/from ['"]motion['"]/, `from '${import.meta.resolve('motion')}'`);
const { compileTransition } = await import(`data:text/javascript;base64,${Buffer.from(motionOutput).toString('base64')}`);

test('new pills prefer free word boundaries, then safely reuse occupied boundaries', () => {
  assert.equal(randomPosition(3, [0, 1, 3], () => 0), 2);
  assert.equal(randomPosition(3, [0, 1, 3], () => .99), 2);
  assert.equal(randomPosition(3, [0, 1, 2, 3], () => .99), 3);
  assert.equal(randomPosition(0, [0], () => .5), 0);
});

test('pills retain independent settings and support all three media types', () => {
  const pills = [1, 2, 3].map(number => createPill(`pill-${number}`, number, number));
  pills[1].width = 1.4;
  pills[1].fit = 'fit';
  const props = pills.map(pill => artifactProps(pill, true, false));
  assert.deepEqual(props.map(pill => pill.kind), ['image', 'gif', 'video']);
  assert.deepEqual(props.map(pill => pill.width), ['3.3em', '1.4em', '3.3em']);
  assert.deepEqual(props.map(pill => pill.fit), ['crop', 'fit', 'crop']);
});

test('independent animation targets and custom easing survive component export', () => {
  const pill = createPill('first', 1, 1);
  const untouched = createPill('second', 2, 2);
  const transition = { type: 'easing', duration: 1.2, ease: [.1, -.2, .8, 1.3] };
  Object.assign(pill, { transition, ...compileTransition(transition), expandedWidth: 2, expandedHeight: 2.5 });
  const props = artifactProps(pill, true, false);
  assert.equal(props.expandedWidth, '2em');
  assert.equal(props.expandedHeight, '2.5em');
  assert.equal(props.width, '3.3em');
  assert.equal(props.duration, '1200ms');
  assert.equal(props.easing, 'cubic-bezier(0.1, -0.2, 0.8, 1.3)');
  assert.equal(untouched.transition.type, 'easing');
  assert.equal(untouched.duration, 650);
});

test('time and physics springs produce portable CSS with settling time and overshoot', () => {
  const timed = compileTransition({ type: 'spring', visualDuration: .4, bounce: .4 });
  const physics = compileTransition({ type: 'spring', stiffness: 160, damping: 12, mass: 1 });
  for (const { duration, easing } of [timed, physics]) {
    assert.ok(Number.isFinite(duration) && duration > 400 && duration <= 20000);
    assert.match(easing, /^linear\(0, .*1\)$/);
    const values = easing.slice(7, -1).split(',').map(Number);
    assert.ok(values.every(Number.isFinite));
    assert.ok(values.some(value => value > 1), 'the bounce must reach the exported CSS');
  }
  assert.notEqual(timed.easing, physics.easing);
  const slow = compileTransition({ type: 'spring', visualDuration: .8, bounce: .4 });
  assert.ok(slow.duration > timed.duration);
  const pill = { ...createPill('spring', 1, 1), ...physics, hover: true, expanded: true, loop: true };
  const reduced = artifactProps(pill, true, true);
  assert.equal(reduced.hoverExpand, false);
  assert.equal(reduced.expanded, false);
  assert.equal(reduced.easing, physics.easing);
});
