import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CanvasElement } from '../client/src/types';
import {
  boardSignature,
  isSoloBoardUpdate,
  mergeSoloBoards,
  type SoloBoard,
} from '../client/src/utils/soloSync';

function element(id: string, updatedAt: number, x = 0): CanvasElement {
  return {
    id,
    type: 'shape',
    x,
    y: 0,
    width: 10,
    height: 10,
    color: '#000000',
    userId: 'user_a',
    updatedAt,
  } as unknown as CanvasElement;
}

function board(elements: CanvasElement[]): SoloBoard {
  return Object.fromEntries(elements.map((item) => [item.id, item]));
}

test('unique solo edits from two tabs are both preserved (#82)', () => {
  const local = board([element('a', 1), element('b', 2)]);
  const remote = board([element('a', 1), element('c', 3)]);

  const merged = mergeSoloBoards(local, remote);

  assert.deepEqual(Object.keys(merged.board).sort(), ['a', 'b', 'c']);
  assert.equal(merged.conflictedIds.length, 0);
  assert.equal(merged.changed, true);
});

test('same-element edits keep the newest update without a save echo (#82)', () => {
  const local = board([element('a', 5, 1)]);
  const remote = board([element('a', 9, 2)]);

  const merged = mergeSoloBoards(local, remote);

  assert.equal((merged.board.a as { x: number }).x, 2);
  assert.deepEqual(merged.conflictedIds, ['a']);
  // The merged board equals the remote board, so this tab must not rebroadcast.
  assert.equal(merged.changed, false);
});

test('equal timestamps converge regardless of tab order (#82)', () => {
  const olderValue = element('a', 7, 1);
  const newerValue = element('a', 7, 2);

  const forward = mergeSoloBoards(board([olderValue]), board([newerValue]));
  const reverse = mergeSoloBoards(board([newerValue]), board([olderValue]));

  assert.equal(boardSignature(forward.board), boardSignature(reverse.board));
});

test('cross-tab update messages are validated (#82)', () => {
  assert.equal(
    isSoloBoardUpdate({
      type: 'solo-board-saved',
      key: 'guest_1',
      sourceId: 'tab_1',
      revision: 'r1',
    }),
    true
  );
  assert.equal(isSoloBoardUpdate({ type: 'other', key: 'guest_1' }), false);
  assert.equal(isSoloBoardUpdate(null), false);
});

test('solo saving is coordinated across tabs in useSocket (#82)', () => {
  const source = readFileSync(
    new URL('../client/src/hooks/useSocket.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /createSoloBoardSync\(/);
  assert.match(source, /cancelPendingSoloSave\(\)/);
  assert.match(source, /soloSyncRef\.current\?\.publish\(\)/);
  assert.match(source, /mergeSoloBoards\(local, remote \?\? \{\}\)/);
  assert.match(source, /void persistSoloBoard\(currentUserId, elements\)/);
});
