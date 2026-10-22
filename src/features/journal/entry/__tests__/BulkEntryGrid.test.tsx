import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import { Keyboard, TextInput, View } from 'react-native';
import { Spacing } from '@/src/constants/design-tokens';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { NO_FX_OVERRIDE } from '@/src/domain/accounting/fxPair';
import type { BulkJournalRow, BulkJournalRowActions } from '../types/bulkJournal';
import { BulkEntryGrid } from '../components/BulkEntryGrid';
import type { ReactNode } from 'react';

beforeEach(() => {
  jest.spyOn(Keyboard, 'addListener').mockReturnValue({
    remove: jest.fn(),
  } as unknown as ReturnType<typeof Keyboard.addListener>);
});
afterEach(() => jest.restoreAllMocks());

const mockScrollToOffset = jest.fn();

jest.mock('@shopify/flash-list', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');

  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListFooterComponent,
      ref,
      ...props
    }: {
      ref?: import('react').Ref<unknown>;
      testID?: string;
      onScroll?: unknown;
      onContentSizeChange?: unknown;
      data: BulkJournalRow[];
      renderItem: (info: { item: BulkJournalRow; index: number }) => ReactNode;
      ListHeaderComponent?: ReactNode;
      ListFooterComponent?: ReactNode;
    }) => {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: mockScrollToOffset }));
      return (
        <View {...props}>
          {ListHeaderComponent}
          {data.map((item, index) => renderItem({ item, index }))}
          {ListFooterComponent}
        </View>
      );
    },
  };
});

jest.mock('@/src/components/core', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native') as typeof import('react-native');
  const TextContent = ({ children }: { children?: ReactNode }) =>
    React.createElement(Text, null, children);

  return {
    AppButton: TextContent,
    AppIcon: () => null,
    AppText: TextContent,
    Icon: { Info: 'info' },
  };
});

jest.mock('../components/BulkEntryRow', () => ({
  BulkEntryRow: () => null,
}));

jest.mock('@/src/components/filters/DateTimePickerModal', () => ({
  DateTimePickerModal: () => null,
}));

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      border: '#000000',
      error: '#ff0000',
      surfaceSecondary: '#ffffff',
      success: '#00ff00',
      textTertiary: '#666666',
    },
  }),
}));

const accounts: AccountFields[] = [
  {
    id: asAccountId('source'),
    name: 'Source',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  } as AccountFields,
  {
    id: asAccountId('destination'),
    name: 'Destination',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  } as AccountFields,
];

const rowActions: BulkJournalRowActions = {
  setDescription: jest.fn(),
  setNotes: jest.fn(),
  setPlannedMode: jest.fn(),
  setAmount: jest.fn(),
  setJournalDate: jest.fn(),
  setTransactionType: jest.fn(),
  setSourceAccount: jest.fn(),
  setDestinationAccount: jest.fn(),
  setConvertedAmount: jest.fn(),
  setManualBaseRate: jest.fn(),
  applySuggestion: jest.fn(),
};

function makeRow(overrides: Partial<BulkJournalRow> = {}): BulkJournalRow {
  return {
    id: 'row-1',
    description: 'Coffee',
    notes: '',
    transactionType: 'transfer',
    amount: '4.50',
    sourceId: asAccountId('source'),
    destinationId: asAccountId('destination'),
    journalDate: 1_700_000_000_000,
    exchangeRate: '',
    isCrossCurrency: false,
    convertedAmount: 0,
    isLoadingRate: false,
    pair: {
      baseCurrency: 'USD',
      isCrossCurrency: false,
      needsBaseRate: false,
      sourceBaseRate: null,
      destBaseRate: null,
      pairRate: null,
      sourceAmount: 0,
      convertedAmount: null,
      status: 'idle',
      isLoading: false,
      rateError: null,
      needsManualRates: false,
      manualSourceBaseRate: '',
      manualDestBaseRate: '',
      override: NO_FX_OVERRIDE,
      ...overrides.pair,
    },
    ...overrides,
  };
}

function renderGrid(rows: BulkJournalRow[], addRow = jest.fn()) {
  return render(
    <BulkEntryGrid
      rows={rows}
      submitError={null}
      accounts={accounts}
      workplaceCurrency="USD"
      workplaceId={asWorkplaceId('workplace')}
      addRow={addRow}
      removeRow={jest.fn()}
      clearRows={jest.fn()}
      rowActions={rowActions}
      swapRowAccounts={jest.fn()}
      refreshRowRate={jest.fn()}
      isAtMaxRows={false}
    />,
  );
}

describe('BulkEntryGrid validation summary', () => {
  it('does not render All valid for a partially edited invalid row', () => {
    renderGrid([
      makeRow({
        destinationId: asAccountId(''),
        validationError: 'Destination account is required',
      }),
    ]);

    expect(screen.getByText('1 need attention')).toBeTruthy();
    expect(screen.queryByText('All valid')).toBeNull();
  });

  it('renders All valid for a fully valid row', () => {
    renderGrid([makeRow()]);

    expect(screen.getByText('All valid')).toBeTruthy();
    expect(screen.queryByText('need attention')).toBeNull();
    expect(screen.queryByText(AppConfig.strings.transactionFlow.bulkEntryHint)).toBeNull();
  });
});

describe('BulkEntryGrid add row', () => {
  it('adds a row when TextInput.State lacks currentlyFocusedInput (react-native-web)', () => {
    const original = TextInput.State.currentlyFocusedInput;
    (TextInput.State as { currentlyFocusedInput?: unknown }).currentlyFocusedInput = undefined;
    try {
      const addRow = jest.fn();
      renderGrid([makeRow()], addRow);
      fireEvent.press(screen.getByText('+ Add Entry Row'));
      expect(addRow).toHaveBeenCalledTimes(1);
    } finally {
      TextInput.State.currentlyFocusedInput = original;
    }
  });
});

describe('BulkEntryGrid keyboard visibility', () => {
  let inputY: number;
  let viewportHeight: number;
  let rowY: number;
  let rowHeight: number;
  let keyboardVisible: boolean;
  let keyboardShown: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    mockScrollToOffset.mockClear();
    inputY = 460;
    rowY = 440;
    rowHeight = 200;
    viewportHeight = 300;
    keyboardVisible = true;
    const input = {
      measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) =>
        callback(0, inputY, 200, 40),
    } as TextInput;
    jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (
      this: View,
      callback,
    ) {
      if (this.props.testID?.startsWith('bulk-entry-row-')) {
        callback(0, rowY, 400, rowHeight);
      } else {
        callback(0, 100, 400, viewportHeight);
      }
    });
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(input);
    jest.spyOn(Keyboard, 'isVisible').mockImplementation(() => keyboardVisible);
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({
      screenX: 0,
      screenY: 450,
      width: 400,
      height: 350,
    });
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      if (event === 'keyboardDidShow') keyboardShown = () => listener({} as never);
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function renderKeyboardGrid() {
    renderGrid([makeRow(), makeRow({ id: 'row-2' }), makeRow({ id: 'row-3' })]);
  }

  function flushScroll() {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  }

  it('reveals the whole lower card after the keyboard opens, accounting for the fixed footer', () => {
    keyboardVisible = false;
    renderKeyboardGrid();
    fireEvent(screen.getByTestId('bulk-entry-row-row-3'), 'focus');
    flushScroll();
    expect(mockScrollToOffset).not.toHaveBeenCalled();
    keyboardVisible = true;
    act(() => keyboardShown());
    flushScroll();
    expect(mockScrollToOffset).toHaveBeenLastCalledWith({
      offset: 240 + Spacing.md,
      animated: true,
    });
  });

  it('reveals another input when focus changes with the keyboard already open', () => {
    renderKeyboardGrid();
    fireEvent.scroll(screen.getByTestId('bulk-entry-list'), {
      nativeEvent: { contentOffset: { y: 600 } },
    });
    fireEvent(screen.getByTestId('bulk-entry-row-row-3'), 'focus');
    flushScroll();
    expect(mockScrollToOffset).toHaveBeenLastCalledWith({
      offset: 840 + Spacing.md,
      animated: true,
    });
  });

  it('remeasures when the viewport shrinks after focus', () => {
    viewportHeight = 600;
    inputY = 200;
    rowY = 180;
    renderKeyboardGrid();
    fireEvent(screen.getByTestId('bulk-entry-row-row-3'), 'focus');
    flushScroll();
    expect(mockScrollToOffset).not.toHaveBeenCalled();
    viewportHeight = 200;
    fireEvent(screen.getByTestId('bulk-entry-viewport'), 'layout');
    flushScroll();
    expect(mockScrollToOffset).toHaveBeenLastCalledWith({
      offset: 80 - Spacing.md,
      animated: true,
    });
  });

  it('leaves an already visible card in place', () => {
    inputY = 180;
    rowY = 160;
    renderKeyboardGrid();
    fireEvent(screen.getByTestId('bulk-entry-row-row-3'), 'focus');
    flushScroll();
    expect(mockScrollToOffset).not.toHaveBeenCalled();
  });

  it('lifts the card through its closed account selector even when the input is already visible', () => {
    inputY = 200;
    rowY = 180;
    rowHeight = 260;
    renderKeyboardGrid();
    fireEvent(screen.getByTestId('bulk-entry-row-row-3'), 'focus');
    flushScroll();
    expect(mockScrollToOffset).toHaveBeenLastCalledWith({
      offset: 40 + Spacing.md,
      animated: true,
    });
  });

  it('keeps a lower field visible when the card is taller than the viewport', () => {
    rowHeight = 600;
    inputY = 800;
    renderKeyboardGrid();
    fireEvent(screen.getByTestId('bulk-entry-row-row-3'), 'focus');
    flushScroll();
    expect(mockScrollToOffset).toHaveBeenLastCalledWith({
      offset: 640 + Spacing.md,
      animated: true,
    });
  });
});
