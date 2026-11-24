import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(`../client/src/${path}`, import.meta.url), 'utf8');
}

test('sidebar is a labelled, expandable navigation surface (#147)', () => {
  const sidebar = source('components/Sidebar.tsx');

  assert.match(sidebar, /<aside\s+ref=\{sidebarRef\}\s+id="whiteboard-sidebar"/);
  assert.match(sidebar, /aria-label="Whiteboard controls"/);
  assert.match(sidebar, /aria-controls="whiteboard-sidebar"/);
  assert.match(sidebar, /aria-expanded=\{isOpen\}/);
  assert.match(sidebar, /aria-label=\{isOpen \? 'Collapse sidebar' : 'Expand sidebar'\}/);
  assert.match(sidebar, /toggleRef\.current\?\.focus\(\)/);
  assert.match(sidebar, /document\.documentElement\.dataset\.sidebarOpen = String\(isOpen\)/);

  for (const group of ['Tools', 'Board', 'Collaborate', 'View', 'Account']) {
    assert.ok(sidebar.includes(`title="${group}"`), `missing ${group} section`);
  }
});

test('sidebar actions reuse existing controls instead of duplicating logic (#147)', () => {
  const sidebar = source('components/Sidebar.tsx');

  for (const id of [
    'about-app-btn',
  ]) {
    assert.ok(sidebar.includes(id), `sidebar must reuse #${id}`);
  }
  assert.doesNotMatch(sidebar, /user-profile-btn|sign-in-prompt-btn/);
  assert.match(sidebar, /onOpenProfile/);
  assert.match(sidebar, /onOpenAuth/);

  assert.match(sidebar, /onClick=\{\(\) => runAction\(onOpenShortcuts\)\}/);
  assert.doesNotMatch(sidebar, /clickHeaderControl\('shortcuts-btn'\)/);
  assert.match(sidebar, /onSelectTool\(tool\)/);
  assert.match(sidebar, /disabled=\{needsWrite && !canWrite\}/);
  assert.match(sidebar, /getVoiceConnectionMeta\(isVoiceConnected\)/);
  assert.match(sidebar, /getVoiceMuteMeta\(isMuted\)/);
  assert.match(sidebar, /getAiDiagramActionMeta\(canWrite\)/);
  assert.match(sidebar, /getAiChatActionMeta\(isAiChatOpen\)/);
  assert.match(sidebar, /getThemeToggleMeta\(theme\)/);
});

test('App mounts the sidebar with all grouped actions wired (#147)', () => {
  const app = source('App.tsx');

  assert.match(app, /<Sidebar/);
  for (const prop of [
    'currentTool={currentTool}',
    'canWrite={canWrite}',
    'onSelectTool={setCurrentTool}',
    'onToggleTheme={handleToggleTheme}',
    'onOpenShare=',
    'onOpenAi={openAiDiagram}',
    'onToggleAiChat={toggleAiChat}',
    'onToggleVoice={handleToggleVoice}',
    'onOpenShortcuts=',
  ]) {
    assert.ok(app.includes(prop), `Sidebar missing ${prop}`);
  }
  assert.doesNotMatch(app, /onJoinVoice=|onLeaveVoice=/);

  assert.match(app, /board\?\.clientWidth \|\| window\.innerWidth/);
  assert.match(app, /board\?\.clientHeight \|\| window\.innerHeight/);
});

test('desktop sidebar docks the canvas and floating chrome (#147)', () => {
  const css = source('index.css');

  assert.match(css, /--wb-sidebar-width:/);
  assert.match(css, /html\[data-sidebar-open='true'\]/);
  assert.match(css, /#whiteboard-canvas-container/);
  assert.match(css, /#whiteboard-floating-toolbar/);
  assert.match(css, /#whiteboard-zoom-controls/);

  const canvas = source('components/Canvas.tsx');
  assert.match(canvas, /id="shortcuts-btn"/);
  assert.match(canvas, /wb-sidebar-centered/);

  const zoomControls = source('components/ZoomControls.tsx');
  const resetMatches = zoomControls.match(/onClick=\{onResetZoom\}/g) ?? [];
  assert.equal(resetMatches.length, 1, 'ZoomControls should expose exactly one reset control');
  assert.match(zoomControls, /getHandToggleMeta/);
  assert.doesNotMatch(source('components/Toolbar.tsx'), /id="tool-hand"/);
});
