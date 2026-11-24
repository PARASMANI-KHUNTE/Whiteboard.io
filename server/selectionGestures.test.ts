import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasMultiSelectModifier,
  toggleSelection,
} from '../client/src/utils/selection';

function componentSource(name: string): string {
  return readFileSync(new URL(`../client/src/components/${name}`, import.meta.url), 'utf8');
}

test('modifier clicks toggle exactly one id per call (#86)', () => {
  const initial = new Set(['a', 'b']);
  const added = toggleSelection(initial, 'c', true);

  assert.deepEqual([...added], ['a', 'b', 'c']);
  assert.deepEqual([...initial], ['a', 'b'], 'the previous selection is not mutated');

  const removed = toggleSelection(added, 'c', true);
  assert.deepEqual([...removed], ['a', 'b']);
  assert.deepEqual([...toggleSelection(removed, 'a', true)], ['b']);
});

test('plain clicks keep a selected group and collapse onto unselected items (#86)', () => {
  assert.deepEqual([...toggleSelection(new Set(['a', 'b']), 'b')], ['a', 'b']);
  assert.deepEqual([...toggleSelection(new Set(['a', 'b']), 'c')], ['c']);
  assert.deepEqual([...toggleSelection(new Set(), 'a')], ['a']);
});

test('shift, ctrl and meta all request multi-select (#86)', () => {
  assert.equal(hasMultiSelectModifier({ shiftKey: true }), true);
  assert.equal(hasMultiSelectModifier({ ctrlKey: true }), true);
  assert.equal(hasMultiSelectModifier({ metaKey: true }), true);
  assert.equal(hasMultiSelectModifier({}), false);
});

test('interactive items select on down/touch, never on click or focus (#86)', () => {
  const components = [
    'ShapeItem.tsx',
    'StickyNoteItem.tsx',
    'IconItem.tsx',
    'TextItem.tsx',
    'WireItem.tsx',
  ];

  for (const name of components) {
    const source = componentSource(name);
    assert.doesNotMatch(
      source,
      /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*onSelect\?\./,
      `${name} must not toggle selection again on click`
    );
  }

  const text = componentSource('TextItem.tsx');
  assert.doesNotMatch(
    text,
    /onFocus=\{\(\) => \{[\s\S]{0,120}?onSelect\?\./,
    'textarea focus must not select'
  );
  assert.doesNotMatch(
    text,
    /onClick=\{\(\) => \{\s*onSelect\?\./,
    'textarea wrapper must not select'
  );
  assert.match(
    text,
    /onMouseDown=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*onSelect\?\.\(hasMultiSelectModifier\(e\)\)/,
    'the textarea itself must be the single mouse selection event'
  );
});
