import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SelectionIndicator, SelectionCheckmark } from '../SelectionIndicator';
import { SelectionTileList } from '../SelectionTileList';
import { SelectionPickerSheet } from '@/src/components/filters/SelectionPickerSheet';
import { SelectableGrid } from '@/src/features/setup/components/SelectableGrid';
import { PlannedPaymentHistoryCard } from '@/src/features/planned-payments/components/PlannedPaymentHistoryCard';
import { JournalEntryModePickerModal } from '@/src/features/journal/entry/components/JournalEntryModePickerModal';
import { JOURNAL_ENTRY_MODE_OPTIONS } from '@/src/features/journal/entry/journalEntryMode';
import { Icon } from '@/src/types/domainIcons';
import { Row } from '@/src/design-system';
import { getLayoutPath } from '@/src/testing/layoutAssertions';
import { fireEvent, render } from '@/src/utils/test-utils';

jest.mock('@/src/components/overlays/ModalSurface', () => ({
  ModalSurface: ({ children, visible }: { children: ReactNode; visible: boolean }) =>
    visible ? children : null,
}));

describe('selection layout invariants', () => {
  it('keeps indicators the same size for unchecked, checked and mixed states', () => {
    const view = render(<SelectionIndicator selected={false} />);
    const root = () => view.UNSAFE_getByType(SelectionIndicator).findAllByType(View)[0];
    const original = getLayoutPath(root());
    for (const selected of [true, 'mixed', false] as const) {
      view.rerender(<SelectionIndicator selected={selected} />);
      expect(getLayoutPath(root())).toEqual(original);
      expect(root().props.accessibilityElementsHidden).toBe(true);
      expect(root().props.pointerEvents).toBe('none');
    }
  });

  it('retains an empty checkmark slot instead of collapsing it', () => {
    const view = render(<SelectionCheckmark selected={false} />);
    const root = () => view.UNSAFE_getByType(SelectionCheckmark).findAllByType(View)[0];
    const original = getLayoutPath(root());
    view.rerender(<SelectionCheckmark selected />);
    expect(getLayoutPath(root())).toEqual(original);
  });

  it('keeps picker label geometry stable when the selection changes', () => {
    const props = {
      visible: true,
      title: 'Choose a currency',
      options: [
        { id: 'USD', label: 'US Dollar' },
        { id: 'INR', label: 'Indian Rupee' },
      ],
      onClose: jest.fn(),
      onSelect: jest.fn(),
    };
    const view = render(<SelectionPickerSheet {...props} selectedValue="USD" />);
    const original = getLayoutPath(view.getByText('Indian Rupee'));
    view.rerender(<SelectionPickerSheet {...props} selectedValue="INR" />);
    expect(getLayoutPath(view.getByText('Indian Rupee'))).toEqual(original);
    expect(view.getByRole('button', { selected: true }).props.accessibilityState.selected).toBe(
      true,
    );
    fireEvent.press(view.getByText('US Dollar'));
    expect(props.onSelect).toHaveBeenCalledWith('USD');
  });

  it('keeps horizontal account tile text stable when selected', () => {
    const items = [{ id: 'cash', label: 'Cash account', color: '#35785A' }];
    const view = render(<SelectionTileList items={items} selectedId="" onSelect={jest.fn()} />);
    const original = getLayoutPath(view.getByText('Cash account'));
    view.rerender(<SelectionTileList items={items} selectedId="cash" onSelect={jest.fn()} />);
    expect(getLayoutPath(view.getByText('Cash account'))).toEqual(original);
  });

  it('keeps setup grid text geometry stable while toggling an item', () => {
    const props = {
      title: 'Categories',
      subtitle: 'Choose categories',
      items: [{ id: 'food', name: 'Food', icon: Icon.Wallet }],
      onToggle: jest.fn(),
      onContinue: jest.fn(),
      onBack: jest.fn(),
      isCompleting: false,
      disableAnimation: true,
    };
    const view = render(<SelectableGrid {...props} selectedIds={[]} />);
    const original = getLayoutPath(view.getByText('Food'));
    view.rerender(<SelectableGrid {...props} selectedIds={['food']} />);
    expect(getLayoutPath(view.getByText('Food'))).toEqual(original);
    expect(view.getByRole('checkbox').props.accessibilityState.checked).toBe(true);
  });

  it('uses the same leading footprint for planned-payment history and its checkbox', () => {
    const props = {
      testID: 'history-row',
      journalAmount: 30,
      currencyCode: 'USD',
      journalDate: new Date(2026, 8, 30),
      journalTitle: 'Rent',
      plannedTitle: 'Rent',
      plannedAmount: 30,
      plannedCurrencyCode: 'USD',
      presentation: {
        label: 'Paid',
        subtitle: 'Recorded',
        color: 'success' as const,
        dotIcon: Icon.Check,
        isSkipped: false,
      },
    };
    const view = render(<PlannedPaymentHistoryCard {...props} />);
    const footprint = () => {
      const node = view.UNSAFE_getByType(Row).children[0];
      if (typeof node === 'string') throw new Error('Expected a leading view');
      const style = StyleSheet.flatten(node.props.style) ?? {};
      return [style.width ?? node.props.size, style.height ?? node.props.size];
    };
    const original = footprint();
    view.rerender(<PlannedPaymentHistoryCard {...props} isSelectionModeActive isSelected />);
    expect(footprint()).toEqual(original);
  });

  it('does not reflow the entry mode label or recommendation when the active mode changes', () => {
    const props = {
      visible: true,
      onClose: jest.fn(),
      onSelectMode: jest.fn(),
      onHelpMode: jest.fn(),
    };
    const view = render(<JournalEntryModePickerModal {...props} activeMode="basic" />);
    const label = JOURNAL_ENTRY_MODE_OPTIONS[0].label;
    const original = getLayoutPath(view.getByText(label));
    view.rerender(<JournalEntryModePickerModal {...props} activeMode="expert" />);
    expect(getLayoutPath(view.getByText(label))).toEqual(original);
    expect(view.getByText('Most common')).toBeTruthy();
  });
});
