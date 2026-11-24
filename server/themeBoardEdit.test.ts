import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shouldRecolorBoardOnThemeToggle } from '../client/src/utils/themeBoardEdit';

function callbackBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = useCallback(() => {`);
  assert.notEqual(start, -1, `${name} callback not found`);
  const end = source.indexOf('\n  }, [', start);
  assert.notEqual(end, -1, `${name} callback end not found`);
  return source.slice(start, end);
}

test('theme recoloring is limited to users who can write (#79)', () => {
  assert.equal(shouldRecolorBoardOnThemeToggle(false), false);
  assert.equal(shouldRecolorBoardOnThemeToggle(true), true);
});

test('viewers toggle the display theme without emitting element events (#79)', () => {
  const source = readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  const body = callbackBody(source, 'handleToggleTheme');

  const guard = body.indexOf('if (shouldRecolorBoardOnThemeToggle(canWrite)) {');
  const emit = body.indexOf('emitElementsBatchCreate(updatedElements)');
  const toggle = body.indexOf('toggleTheme()');

  assert.notEqual(guard, -1, 'theme recoloring must be permission-guarded');
  assert.notEqual(emit, -1, 'editors still recolor board elements');
  assert.equal(emit > guard, true, 'element emission must be inside the write guard');
  assert.equal(toggle > emit, true, 'display theme toggle must still happen for viewers');

  const callbackStart = source.indexOf('const handleToggleTheme');
  const callbackSection = source.slice(callbackStart, callbackStart + 6000);
  assert.match(callbackSection, /canWrite, emitElementsBatchCreate/);
});
