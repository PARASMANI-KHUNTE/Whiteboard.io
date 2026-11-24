import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shouldKeepSoloMigrationAfterConnectError } from '../client/src/utils/soloMigration';

test('transient connect error keeps a migration for the active room (#80)', () => {
  assert.equal(shouldKeepSoloMigrationAfterConnectError({ roomId: 'ROOM-1' }, 'ROOM-1'), true);
  assert.equal(shouldKeepSoloMigrationAfterConnectError({ roomId: 'ROOM-1' }, 'ROOM-2'), false);
  assert.equal(shouldKeepSoloMigrationAfterConnectError(null, 'ROOM-1'), false);
  assert.equal(shouldKeepSoloMigrationAfterConnectError({ roomId: 'ROOM-1' }, null), false);
});

test('connect_error uses the room-aware decision instead of clearing blindly (#80)', () => {
  const source = readFileSync(
    new URL('../client/src/hooks/useSocket.ts', import.meta.url),
    'utf8'
  );
  const start = source.indexOf("socket.on('connect_error'");
  assert.notEqual(start, -1);
  const handler = source.slice(start, start + 600);

  assert.match(
    handler,
    /shouldKeepSoloMigrationAfterConnectError\(soloMigrationRef\.current, roomId\)/
  );
});

test('switching rooms still discards a stale solo migration (#80)', () => {
  const source = readFileSync(
    new URL('../client/src/hooks/useSocket.ts', import.meta.url),
    'utf8'
  );
  const start = source.indexOf('const switchRoom = useCallback');
  assert.notEqual(start, -1);
  const end = source.indexOf('\n  }, [', start);
  assert.notEqual(end, -1);
  assert.match(source.slice(start, end), /soloMigrationRef\.current = null/);
});
