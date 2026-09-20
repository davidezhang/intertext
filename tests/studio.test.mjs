import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// The studio model has no runtime imports; run the same source used by the app.
const source = readFileSync(new URL('../src/studio-model.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { randomPosition, createPill, artifactProps } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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
