import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('desktop AI chat offset and canvas-centered CSS tokens exist (#218)', () => {
  const css = readFileSync(new URL('../client/src/index.css', import.meta.url), 'utf8');
  assert.match(css, /--wb-ai-chat-offset:/);
  assert.match(css, /\.wb-right-chat-aware\b/);
  assert.match(css, /\.wb-canvas-centered\b/);
  assert.match(css, /\.wb-bottom-blame-aware\b/);
});

test('right-edge HUD controls and BlameModeLegend wire layout-aware classes (#218)', () => {
  const app = readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /id="blame-mode-toggle-btn"[\s\S]*?wb-bottom-blame-aware[\s\S]*?wb-right-chat-aware/);
  assert.match(app, /id="system-notifications"[\s\S]*?sm:top-20[\s\S]*?wb-right-chat-aware/);

  const shortcutsBtn = readFileSync(
    new URL('../client/src/components/ui/ShortcutsLauncherButton.tsx', import.meta.url),
    'utf8'
  );
  assert.match(shortcutsBtn, /wb-bottom-chat-aware[\s\S]*?wb-right-chat-aware/);

  const legend = readFileSync(
    new URL('../client/src/components/ui/BlameModeLegend.tsx', import.meta.url),
    'utf8'
  );
  assert.match(legend, /wb-canvas-centered/);
  assert.match(legend, /wb-bottom-chat-aware/);
});
