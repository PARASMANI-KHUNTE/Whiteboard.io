import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FloatingToolDock and EmptyCanvasGuide are wired into App when appropriate (#221)', () => {
  const app = readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<FloatingToolDock/);
  assert.match(app, /visible=\{!isSidebarOpen && !isBlockingOverlayOpen\}/);
  assert.match(app, /<EmptyCanvasGuide/);
  assert.match(app, /Object\.keys\(elements\)\.length === 0/);

  const dock = readFileSync(
    new URL('../client/src/components/ui/FloatingToolDock.tsx', import.meta.url),
    'utf8'
  );
  assert.match(dock, /id="floating-tool-dock"/);
  assert.match(dock, /wb-canvas-centered/);
  assert.match(dock, /wb-bottom-chat-aware/);

  const guide = readFileSync(
    new URL('../client/src/components/ui/EmptyCanvasGuide.tsx', import.meta.url),
    'utf8'
  );
  assert.match(guide, /id="empty-canvas-guide"/);
  assert.match(guide, /pointer-events-none/);
  assert.match(guide, /empty-guide-ai-btn/);
});
