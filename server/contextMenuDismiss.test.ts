import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldCloseContextMenuOnScroll } from '../client/src/utils/contextMenuDismiss';

test('shouldCloseContextMenuOnScroll ignores scrolls originating on the menu element (#92)', () => {
  const menu = {
    contains(other: unknown) {
      return other === menu;
    },
  };

  assert.equal(shouldCloseContextMenuOnScroll(menu, menu), false);
});

test('shouldCloseContextMenuOnScroll ignores scrolls originating inside menu children (#92)', () => {
  const childItem = { id: 'item-1' };
  const menu = {
    contains(other: unknown) {
      return other === childItem;
    },
  };

  assert.equal(shouldCloseContextMenuOnScroll(menu, childItem), false);
});

test('shouldCloseContextMenuOnScroll closes when scrolling outside elements (#92)', () => {
  const outsideElement = { id: 'canvas-container' };
  const menu = {
    contains(_other: unknown) {
      return false;
    },
  };

  assert.equal(shouldCloseContextMenuOnScroll(menu, outsideElement), true);
  assert.equal(shouldCloseContextMenuOnScroll(menu, null), true);
  assert.equal(shouldCloseContextMenuOnScroll(null, outsideElement), true);
});
