import { attachSelectionActions, buildListSelectionChrome } from '../buildSelectionChrome';
import { Icon } from '@/src/types/domainIcons';

describe('buildSelectionChrome', () => {
  it('builds SelectionOverlayProps from selection state and handlers', () => {
    const exitSelectionMode = jest.fn();
    const selectAll = jest.fn();
    const clearItems = jest.fn();
    const onShareSelected = jest.fn();
    const actions = [{ name: Icon.Delete, label: 'Delete', onPress: jest.fn() }];

    const chrome = buildListSelectionChrome({
      selectedIds: new Set(['a']),
      selectableIds: ['a', 'b'],
      itemTypeLabel: 'account',
      exitSelectionMode,
      selectAll,
      clearItems,
      onShareSelected,
      amountSummary: {
        label: 'Assets',
        amounts: [{ amount: 100, currencyCode: 'USD' }],
      },
      actions,
    });

    expect(chrome.state).toEqual({
      selectedCount: 1,
      selectedSelectableCount: 1,
      selectableCount: 2,
      checked: 'mixed',
    });
    expect(chrome.itemTypeLabel).toBe('account');
    expect(chrome.exitSelectionMode).toBe(exitSelectionMode);
    expect(chrome.selectAll).toBe(selectAll);
    expect(chrome.clearItems).toBe(clearItems);
    expect(chrome.onShareSelected).toBe(onShareSelected);
    expect(chrome.actions).toBe(actions);
  });

  it('attaches actions only when base selection chrome is defined', () => {
    const actions = [{ name: Icon.Edit, label: 'Rename', onPress: jest.fn() }];
    expect(attachSelectionActions(undefined, actions)).toBeUndefined();

    const base = buildListSelectionChrome({
      selectedIds: new Set(['1']),
      selectableIds: ['1'],
      itemTypeLabel: 'transaction',
      exitSelectionMode: jest.fn(),
      selectAll: jest.fn(),
      clearItems: jest.fn(),
    });
    expect('actions' in base).toBe(false);

    const attached = attachSelectionActions(base, actions);
    expect(attached).toEqual({ ...base, actions });
  });
});
