import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(`../client/src/${path}`, import.meta.url), 'utf8');
}

test('sidebar is a labelled, expandable navigation surface triggered from the navbar (#147, #194, #200)', () => {
  const sidebar = source('components/Sidebar.tsx');
  const header = source('components/Header.tsx');
  const actionsHook = source('hooks/useWhiteboardActions.ts');
  const app = source('App.tsx');

  assert.match(sidebar, /<aside\s+ref=\{sidebarRef\}\s+id="whiteboard-sidebar"/);
  assert.match(sidebar, /aria-label="Whiteboard controls"/);
  assert.match(sidebar, /document\.documentElement\.dataset\.sidebarOpen = String\(isOpen\)/);
  assert.match(sidebar, /el\.toggleAttribute\('inert', !isOpen\)/);
  assert.match(sidebar, /toggleButtonRef\?\.current\?\.focus\(\)/);
  assert.doesNotMatch(sidebar, /id="sidebar-open-btn"/);
  assert.doesNotMatch(sidebar, /id="sidebar-toggle-btn"/);

  assert.match(header, /<header[\s\S]*?id="whiteboard-header"/);
  assert.match(header, /sidebar:\s*sidebarAction/);
  assert.match(header, /ref=\{sidebarToggleRef\}[\s\S]*?id="sidebar-toggle-btn"/);
  assert.match(header, /aria-controls="whiteboard-sidebar"/);
  assert.match(header, /aria-expanded=\{isSidebarOpen\}/);
  assert.match(header, /aria-label=\{sidebarAction\.ariaLabel\}/);

  assert.match(actionsHook, /'sidebar'/);
  assert.match(actionsHook, /ariaLabel:\s*isSidebarOpen \? 'Collapse sidebar' : 'Expand sidebar'/);

  assert.match(app, /matchMedia\('\(min-width: 1024px\)'\)\.matches/);
  assert.match(app, /isSidebarOpen=\{isSidebarOpen\}/);
  assert.match(app, /sidebarToggleRef=\{sidebarToggleRef\}/);
  assert.match(app, /toggleButtonRef=\{sidebarToggleRef\}/);

  for (const group of ['Tools', 'Style', 'Board', 'Collaborate', 'View', 'Account']) {
    assert.ok(sidebar.includes(`title="${group}"`), `missing ${group} section`);
  }
});

test('chrome surfaces consume shared whiteboard action registry without DOM shims (#162, #200)', () => {
  const sidebar = source('components/Sidebar.tsx');
  const header = source('components/Header.tsx');
  const canvas = source('components/Canvas.tsx');
  const app = source('App.tsx');

  assert.doesNotMatch(
    sidebar,
    /document\.getElementById|clickHeaderControl|user-profile-btn|sign-in-prompt-btn|about-app-btn|shortcuts-btn/
  );
  assert.match(sidebar, /actions\.tools\.map/);
  assert.match(sidebar, /actions\.actions\.selectAll/);
  assert.match(sidebar, /actions\.actions\.account/);
  assert.match(sidebar, /actions\.actions\.about/);
  assert.match(sidebar, /id="sidebar-style-controls"/);

  assert.match(app, /useWhiteboardActions\(/);
  assert.match(app, /<AboutModal/);
  assert.match(header, /actions\.actions/);
  assert.match(canvas, /actions\.actions\.shortcuts/);
  assert.match(canvas, /actions\.handToggle/);
});

test('App removes bottom floating toolbar and duplicate navbar buttons (#200)', () => {
  const app = source('App.tsx');
  const header = source('components/Header.tsx');

  for (const surface of ['<Header', '<Sidebar', '<Canvas']) {
    assert.ok(app.includes(surface), `App missing ${surface}`);
  }
  assert.equal((app.match(/actions=\{whiteboardActions\}/g) ?? []).length, 3);
  assert.doesNotMatch(app, /<Toolbar\b|components\/Toolbar/);
  assert.equal(existsSync(new URL('../client/src/components/Toolbar.tsx', import.meta.url)), false);
  assert.doesNotMatch(app, /onJoinVoice=|onLeaveVoice=/);

  // Navbar no longer duplicates controls that live in Sidebar
  assert.doesNotMatch(
    header,
    /admin-panel-toggle-btn|about-app-btn|theme-toggle-btn|user-profile-btn|sign-in-prompt-btn|ai-chat-header-btn|ai-diagram-header-btn|share-room-modal-btn|mobile-header-menu-btn|room-selector-btn/
  );
  assert.match(header, /id="room-status-pill"/);
  assert.match(header, /id="share-go-live-btn"/);
  assert.match(header, /<AudioVisualizerBar/);

  assert.match(app, /board\?\.clientWidth \|\| window\.innerWidth/);
  assert.match(app, /board\?\.clientHeight \|\| window\.innerHeight/);
});

test('desktop sidebar docks the canvas and remaining floating chrome (#147, #200)', () => {
  const css = source('index.css');

  assert.match(css, /--wb-sidebar-width:/);
  assert.match(css, /html\[data-sidebar-open='true'\]/);
  assert.match(css, /#whiteboard-canvas-container/);
  assert.match(css, /#whiteboard-zoom-controls/);
  assert.doesNotMatch(css, /#whiteboard-floating-toolbar/);

  const canvas = source('components/Canvas.tsx');
  assert.match(canvas, /id="shortcuts-btn"/);
  assert.match(canvas, /wb-sidebar-centered/);

  const zoomControls = source('components/ZoomControls.tsx');
  const resetMatches = zoomControls.match(/onClick=\{onResetZoom\}/g) ?? [];
  assert.equal(resetMatches.length, 1, 'ZoomControls should expose exactly one reset control');
  assert.match(zoomControls, /getHandToggleMeta/);
});
