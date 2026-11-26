import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Header exposes interactive room-status-pill button and mobile participant counter (#220)', () => {
  const header = readFileSync(new URL('../client/src/components/Header.tsx', import.meta.url), 'utf8');
  assert.match(header, /<button[\s\S]*?id="room-status-pill"/);
  assert.match(header, /isSoloMode \? shareGoLiveAction\.handler : shareAction\.handler/);
  assert.match(header, /id="mobile-participants-btn"/);
  assert.match(header, /onClick=\{adminAction\.handler\}/);
});
