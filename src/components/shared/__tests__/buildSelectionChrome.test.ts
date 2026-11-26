import { Icon } from '@/src/components/core';
import { attachSelectionActions, buildListSelectionChrome } from '../buildSelectionChrome';

describe('buildListSelectionChrome', () => {
  it('builds SelectionOverlayProps from selection state and handlers', () => {
    const exitSelectionMode = jest.fn();
    const selectAll = jest.fn();
    const clearItems = jest.fn();
    const onShare = jest.fn();
    const actions = [
      {
        name: Icon.Share,
        label: 'Share',
        onPress: onShare,
        isPrimary: true,
      },
    ];

    const chrome = buildListSelectionChrome({
      selectedIds: new Set(['a', 'b']),
      selectableIds: ['a', 'b', 'c'],
      itemTypeLabel: 'transaction',
      exitSelectionMode,
      selectAll,
      clearItems,
      actions,
    });

    expect(chrome.state.selectedCount).toBe(2);
    expect(chrome.state.selectableCount).toBe(3);
    expect(chrome.itemTypeLabel).toBe('transaction');
    expect(chrome.exitSelectionMode).toBe(exitSelectionMode);
    expect(chrome.selectAll).toBe(selectAll);
    expect(chrome.clearItems).toBe(clearItems);
    expect(chrome.actions).toBe(actions);
  });

  it('builds chrome without actions when none are supplied', () => {
    const chrome = buildListSelectionChrome({
      selectedIds: new Set(['a']),
      selectableIds: ['a', 'b'],
      itemTypeLabel: 'account',
      exitSelectionMode: jest.fn(),
      selectAll: jest.fn(),
      clearItems: jest.fn(),
    });
    expect(chrome.actions).toBeUndefined();
  });

  it('attachSelectionActions merges actions onto a base chrome', () => {
    const actions = [
      {
        name: Icon.Delete,
        label: 'Delete',
        onPress: jest.fn(),
      },
    ];
    expect(attachSelectionActions(undefined, actions)).toBeUndefined();

    const base = buildListSelectionChrome({
      selectedIds: new Set(['a']),
      selectableIds: ['a'],
      itemTypeLabel: 'payment',
      exitSelectionMode: jest.fn(),
      selectAll: jest.fn(),
      clearItems: jest.fn(),
    });

    const attached = attachSelectionActions(base, actions);
    expect(attached?.actions).toBe(actions);
    expect(attached?.state.selectedCount).toBe(1);
  });
});
