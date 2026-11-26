import { SelectionActionBar } from '../SelectionActionBar';
import { SelectionDock, SelectionHeader } from '../SelectionOverlay';
import { SelectionSummary } from '../SelectionSummary';
import { getLayoutPath } from '@/src/testing/layoutAssertions';
import { Icon } from '@/src/types/domainIcons';
import { fireEvent, render } from '@/src/testing/render';
import { StyleSheet, View } from 'react-native';
import { getSelectionState } from '@/src/hooks/selectionState';
import { triggerPressHaptic } from '@/src/design-system/haptics';

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
jest.mock('@/src/design-system/haptics', () => ({
  ...jest.requireActual('@/src/design-system/haptics'),
  triggerPressHaptic: jest.fn(),
}));

jest.mock('react-native/Libraries/Animated/NativeAnimatedModule', () => {
  const { NativeModules } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: {
      ...NativeModules.NativeAnimatedModule,
      connectAnimatedNodeToShadowNodeFamily: jest.fn(),
    },
  };
});

it('preserves action slots across counts and prevents actions when no items are selected', () => {
  const onMerge = jest.fn();
  const bar = (selectedCount: number, disabled: boolean) => (
    <SelectionActionBar
      selectedCount={selectedCount}
      actions={[{ name: Icon.Merge, label: 'Merge', onPress: onMerge, disabled }]}
    />
  );
  const view = render(bar(0, false));
  const original = getLayoutPath(view.getByLabelText('Merge'));
  fireEvent.press(view.getByLabelText('Merge'));
  expect(onMerge).not.toHaveBeenCalled();
  const animation = view.UNSAFE_getAllByType(View).find(node => node.props.from);
  expect(animation?.props.from).toMatchObject({ translateY: 0 });

  view.rerender(bar(1, true));
  expect(getLayoutPath(view.getByLabelText('Merge'))).toEqual(original);
  fireEvent.press(view.getByLabelText('Merge'));
  expect(onMerge).not.toHaveBeenCalled();

  view.rerender(bar(3, false));
  expect(getLayoutPath(view.getByLabelText('Merge'))).toEqual(original);
  fireEvent.press(view.getByLabelText('Merge'));
  expect(onMerge).toHaveBeenCalledTimes(1);
});

it('shows the total selected count when a selection includes hidden items', () => {
  const onSelectAll = jest.fn();
  const onDeselectAll = jest.fn();
  const onClear = jest.fn();
  const summary = (ids: string[]) => (
    <SelectionSummary
      itemTypeLabel="transaction"
      onClear={onClear}
      onSelectAll={onSelectAll}
      onDeselectAll={onDeselectAll}
      selection={getSelectionState(new Set(ids), ['visible'])}
    />
  );
  const view = render(summary(['hidden']));

  expect(view.getByText('1 transaction selected')).toBeTruthy();
  const toggle = view.getByRole('checkbox', { name: 'Toggle all' });
  expect(toggle.props.accessibilityState.checked).toBe(false);
  fireEvent.press(toggle);
  expect(onSelectAll).toHaveBeenCalledTimes(1);
  expect(onDeselectAll).not.toHaveBeenCalled();

  view.rerender(summary(['visible']));
  expect(view.getByText('1 of 1 transaction selected')).toBeTruthy();
  const checkedToggle = view.getByRole('checkbox', { name: 'Toggle all' });
  expect(checkedToggle.props.accessibilityState.checked).toBe(true);
  fireEvent.press(checkedToggle);
  expect(onDeselectAll).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByLabelText('Exit selection'));
  expect(onClear).toHaveBeenCalledTimes(1);
});

it('renders the selection summary and its actions together', () => {
  const onShare = jest.fn();
  const chrome = {
    state: getSelectionState(new Set(['1', '2']), ['1', '2', '3']),
    exitSelectionMode: jest.fn(),
    selectAll: jest.fn(),
    clearItems: jest.fn(),
    amountSummary: {
      label: 'Signed total',
      signed: true as const,
      amounts: [
        { amount: -120.5, currencyCode: 'USD' },
        { amount: 45, currencyCode: 'EUR' },
      ],
    },
    itemTypeLabel: 'transaction',
    actions: [
      {
        name: Icon.Share,
        label: 'Share',
        onPress: onShare,
        accessibilityLabel: 'Share selected items',
      },
    ],
  };
  const view = render(
    <>
      <SelectionHeader {...chrome} />
      <SelectionDock {...chrome} />
    </>,
  );

  expect(view.getByText(/− .*120\.50/)).toBeTruthy();
  expect(view.getByText(/\+ .*45[.,]00/)).toBeTruthy();
  expect(view.getByText('2 of 3 transactions · Signed total')).toBeTruthy();
  expect(view.getByText('All')).toBeTruthy();
  expect(view.getByText('Share')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Share selected items'));
  expect(onShare).toHaveBeenCalledTimes(1);
});

it('formats non-ratio meta as count + item label without double selected', () => {
  const view = render(
    <SelectionSummary
      selection={getSelectionState(new Set(['hidden']), ['visible'])}
      amountSummary={{
        label: 'Signed total',
        signed: true,
        amounts: [{ amount: -50, currencyCode: 'USD' }],
      }}
      itemTypeLabel="transaction"
      onClear={jest.fn()}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );

  expect(view.getByText('1 transaction · Signed total · 1 left')).toBeTruthy();
  expect(view.queryByText(/selected transaction/)).toBeNull();
});

it('renders mixed account-type totals as labeled sections', () => {
  const view = render(
    <SelectionSummary
      selection={getSelectionState(new Set(['a', 'l']), ['a', 'l', 'x'])}
      amountSummary={{
        label: 'Direct balances',
        sections: [
          {
            label: 'Assets',
            colorKey: 'asset',
            amounts: [{ amount: 200, currencyCode: 'USD' }],
          },
          {
            label: 'Liabilities',
            colorKey: 'liability',
            amounts: [
              { amount: 80, currencyCode: 'USD' },
              { amount: 40, currencyCode: 'EUR' },
            ],
          },
        ],
      }}
      itemTypeLabel="account"
      onClear={jest.fn()}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );

  expect(view.getByText('Assets')).toBeTruthy();
  expect(view.getByText('Liabilities')).toBeTruthy();
  expect(view.getByText(/200\.00/)).toBeTruthy();
  expect(view.getByText(/80\.00/)).toBeTruthy();
  expect(view.getByText(/40[.,]00/)).toBeTruthy();
  expect(view.getByText('2 of 3 accounts · Direct balances')).toBeTruthy();
});

it('distinguishes a partial amount from an unavailable total and omits partial averages', () => {
  const summary = (amounts: { amount: number; currencyCode: string }[]) => (
    <SelectionSummary
      selection={getSelectionState(new Set(['1', '2']), ['1', '2'])}
      amountSummary={{ label: 'Signed total', signed: true, amounts, incomplete: true }}
      itemTypeLabel="transaction"
      onClear={jest.fn()}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />
  );
  const view = render(summary([{ amount: -60, currencyCode: 'USD' }]));
  expect(view.getByText('2 of 2 transactions · Signed total (partial)')).toBeTruthy();
  expect(view.queryByText(/Avg/)).toBeNull();
  expect(view.getByLabelText('Signed total (partial)')).toBeTruthy();
  expect(view.getByText(/− .*60\.00/)).toBeTruthy();
  expect(view.getByText('Clear')).toBeTruthy();

  view.rerender(summary([]));
  expect(view.getByText('Total unavailable')).toBeTruthy();
  expect(view.getByText('2 of 2 transactions selected')).toBeTruthy();
  expect(view.queryByText(/60\.00/)).toBeNull();
});

it('preserves negative sign in unsigned averages, omits averages when items are excluded, and shows partial badges across all layouts', () => {
  const onClear = jest.fn();
  const view = render(
    <SelectionSummary
      selection={getSelectionState(new Set(['1', '2']), ['1', '2', '3'])}
      amountSummary={{
        label: 'Assets',
        amounts: [{ amount: -200, currencyCode: 'USD' }],
        includedCount: 2,
      }}
      itemTypeLabel="account"
      onClear={onClear}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );
  expect(view.getByText('2 of 3 accounts · Assets · Avg -$100.00')).toBeTruthy();

  // Excluded items (e.g. transfer or skipped occurrence) must not distort the average.
  view.rerender(
    <SelectionSummary
      selection={getSelectionState(new Set(['1', '2']), ['1', '2'])}
      amountSummary={{
        label: 'Signed total',
        signed: true,
        amounts: [{ amount: -200, currencyCode: 'USD' }],
        includedCount: 1,
      }}
      itemTypeLabel="transaction"
      onClear={onClear}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );
  expect(view.getByText('2 of 2 transactions · Signed total · All selected')).toBeTruthy();
  expect(view.queryByText(/Avg/)).toBeNull();

  // Partial warning icon renders on multi-currency and multi-section summaries too.
  view.rerender(
    <SelectionSummary
      selection={getSelectionState(new Set(['1', '2']), ['1', '2', '3'])}
      amountSummary={{
        label: 'Signed total',
        signed: true,
        incomplete: true,
        amounts: [
          { amount: -100, currencyCode: 'USD' },
          { amount: 50, currencyCode: 'EUR' },
        ],
      }}
      itemTypeLabel="transaction"
      onClear={onClear}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );
  expect(view.getByLabelText('Signed total (partial)')).toBeTruthy();

  view.rerender(
    <SelectionSummary
      selection={getSelectionState(new Set(['a', 'l']), ['a', 'l', 'x'])}
      amountSummary={{
        label: 'Direct balances',
        incomplete: true,
        sections: [
          { label: 'Assets', colorKey: 'asset', amounts: [{ amount: 200, currencyCode: 'USD' }] },
          {
            label: 'Liabilities',
            colorKey: 'liability',
            amounts: [{ amount: 80, currencyCode: 'USD' }],
          },
        ],
      }}
      itemTypeLabel="account"
      onClear={onClear}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );
  expect(view.getByLabelText('Direct balances (partial)')).toBeTruthy();

  // Exit selection triggers haptic exactly once.
  jest.mocked(triggerPressHaptic).mockClear();
  fireEvent.press(view.getByLabelText('Exit selection'));
  expect(onClear).toHaveBeenCalledTimes(1);
  expect(triggerPressHaptic).toHaveBeenCalledTimes(1);
  expect(triggerPressHaptic).toHaveBeenCalledWith('selection');
});

it('pluralizes irregular item labels and guides the user when zero items are selected', () => {
  const categoryLabel = { singular: 'category', plural: 'categories' };
  const view = render(
    <SelectionSummary
      selection={getSelectionState(new Set(['1', '2']), ['1', '2', '3'])}
      itemTypeLabel={categoryLabel}
      onClear={jest.fn()}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );

  expect(view.getByText('2 of 3 categories selected')).toBeTruthy();
  const liveRegion = view
    .UNSAFE_getAllByType(View)
    .find(node => node.props.accessibilityLiveRegion === 'polite');
  expect(liveRegion).toBeTruthy();

  view.rerender(
    <SelectionSummary
      selection={getSelectionState(new Set<string>(), ['1', '2', '3'])}
      itemTypeLabel={categoryLabel}
      onClear={jest.fn()}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );
  expect(view.getByText('0 of 3 categories selected')).toBeTruthy();
  expect(view.getByText('Tap items to select')).toBeTruthy();

  view.rerender(
    <SelectionSummary
      selection={getSelectionState(new Set(['1']), ['1'])}
      itemTypeLabel={categoryLabel}
      onClear={jest.fn()}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );
  expect(view.getByText('1 of 1 category selected')).toBeTruthy();
});

it('closes the overflow action sheet when selectedCount drops to zero and shows disabled hints', () => {
  const actions = [
    { name: Icon.Edit, label: 'Rename', isPrimary: true, onPress: jest.fn() },
    { name: Icon.Share, label: 'Share', isPrimary: true, onPress: jest.fn() },
    {
      name: Icon.Delete,
      label: 'Delete',
      variant: 'error' as const,
      isPrimary: true,
      onPress: jest.fn(),
    },
    {
      name: Icon.Merge,
      label: 'Merge',
      disabled: true,
      disabledHint: 'Select 2 or more',
      onPress: jest.fn(),
    },
  ];
  const view = render(<SelectionActionBar selectedCount={1} actions={actions} />);

  fireEvent.press(view.getByLabelText('More bulk actions'));
  expect(view.getByText('Actions (1 selected)')).toBeTruthy();
  expect(view.getByText('Select 2 or more')).toBeTruthy();

  view.rerender(<SelectionActionBar selectedCount={0} actions={actions} />);
  expect(view.queryByText('Actions (0 selected)')).toBeNull();

  view.rerender(<SelectionActionBar selectedCount={1} actions={actions} />);
  expect(view.queryByText('Actions (1 selected)')).toBeNull();

  fireEvent.press(view.getByLabelText('More bulk actions'));
  expect(view.getByText('Actions (1 selected)')).toBeTruthy();
});

it('rounds signed averages to currency precision before deriving sign so tiny totals do not render minus-zero', () => {
  const view = render(
    <SelectionSummary
      selection={getSelectionState(new Set(['1', '2', '3']), ['1', '2', '3'])}
      amountSummary={{
        label: 'Signed total',
        signed: true,
        amounts: [{ amount: -0.01, currencyCode: 'USD' }],
      }}
      itemTypeLabel="transaction"
      onClear={jest.fn()}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );

  expect(
    view.getByText('3 of 3 transactions · Signed total · Avg $0.00 · All selected'),
  ).toBeTruthy();
  expect(view.queryByText(/Avg −/)).toBeNull();

  view.rerender(
    <SelectionSummary
      selection={getSelectionState(new Set(['1', '2', '3']), ['1', '2', '3'])}
      amountSummary={{
        label: 'Signed total',
        signed: true,
        amounts: [{ amount: -0.02, currencyCode: 'USD' }],
      }}
      itemTypeLabel="transaction"
      onClear={jest.fn()}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );

  expect(
    view.getByText('3 of 3 transactions · Signed total · Avg − $0.01 · All selected'),
  ).toBeTruthy();
});

it('reserves layout space for the action dock and bounds tall amount breakdowns', () => {
  const bar = render(
    <SelectionActionBar
      selectedCount={2}
      actions={[{ name: Icon.Share, label: 'Share', onPress: jest.fn() }]}
    />,
  );
  const animatedWrapper = bar.UNSAFE_getAllByType(View).find(node => node.props.from);
  expect(StyleSheet.flatten(animatedWrapper?.props.style)?.position).not.toBe('absolute');

  const multiSection = render(
    <SelectionSummary
      selection={getSelectionState(new Set(['a', 'l']), ['a', 'l'])}
      amountSummary={{
        label: 'Direct balances',
        sections: [
          {
            label: 'Assets',
            colorKey: 'asset',
            amounts: [
              { amount: 100, currencyCode: 'USD' },
              { amount: 200, currencyCode: 'EUR' },
            ],
          },
          {
            label: 'Liabilities',
            colorKey: 'liability',
            amounts: [
              { amount: 50, currencyCode: 'USD' },
              { amount: 75, currencyCode: 'GBP' },
            ],
          },
        ],
      }}
      itemTypeLabel="account"
      onClear={jest.fn()}
      onSelectAll={jest.fn()}
      onDeselectAll={jest.fn()}
    />,
  );
  const breakdown = multiSection.getByTestId('selection-summary-breakdown');
  expect(StyleSheet.flatten(breakdown.props.style)?.maxHeight).toBeLessThanOrEqual(144);
  expect(breakdown.props.nestedScrollEnabled).toBe(true);
});
