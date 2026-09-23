import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import React, { useState } from 'react';
import { SplitAllocationRow } from '../components/SplitAllocationRow';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => true,
}));

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => {
      const gesture = {
        activeOffsetX: () => gesture,
        failOffsetY: () => gesture,
        onUpdate: () => gesture,
        onEnd: () => gesture,
      };
      return gesture;
    },
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/features/journal/entry/hooks/useCrossCurrencyRates', () => ({
  useCrossCurrencyRates: jest.fn(),
}));

const mockUseCrossCurrencyRates = jest.requireMock(
  '@/src/features/journal/entry/hooks/useCrossCurrencyRates',
).useCrossCurrencyRates as jest.Mock;

beforeEach(() => {
  mockUseCrossCurrencyRates.mockReturnValue({
    exchangeRate: null,
    sourceBaseRate: null,
    destBaseRate: null,
    isLoadingRate: false,
    rateError: null,
  });
});

const accounts: AccountFields[] = [
  {
    id: asAccountId('category-food'),
    name: 'Food',
    accountType: AccountType.EXPENSE,
    currencyCode: 'INR',
  } as AccountFields,
  {
    id: asAccountId('category-rent'),
    name: 'Rent',
    accountType: AccountType.EXPENSE,
    currencyCode: 'INR',
  } as AccountFields,
];

function renderRow(overrides: Partial<React.ComponentProps<typeof SplitAllocationRow>> = {}) {
  return render(
    <ArchiveVisibilityScopeProvider>
      <SplitAllocationRow
        allAccounts={accounts}
        allocationAccounts={accounts}
        canRemove
        currencyCode="INR"
        fallbackPrecision={2}
        emptyPrompt="Choose category"
        isExpanded
        label="Category"
        onCreateAccountRequest={jest.fn()}
        onRemove={jest.fn()}
        onSelectAccount={jest.fn()}
        onToggle={jest.fn()}
        onUpdateAmount={jest.fn()}
        onUpdateFxLine={jest.fn()}
        onUpdateSourceExchangeRate={jest.fn()}
        removeLabel="Remove split"
        sourceCurrency="INR"
        workplaceCurrency="INR"
        row={{
          id: 'row-1',
          accountId: asAccountId('category-food'),
          amount: '12.50',
          precision: 2,
        }}
        {...overrides}
      />
    </ArchiveVisibilityScopeProvider>,
  );
}

describe('SplitAllocationRow', () => {
  it('does not fetch rates while opening an existing allocation with saved rates', () => {
    const onUpdateFxLine = jest.fn();
    renderRow({
      currencyCode: 'EUR',
      isEditing: true,
      sourceCurrency: 'EUR',
      sourceExchangeRate: 1.1,
      workplaceCurrency: 'USD',
      row: {
        id: 'saved-row',
        accountId: asAccountId('missing-account'),
        accountCurrency: 'USD',
        amount: '11.00',
        exchangeRate: '1',
        precision: 2,
      },
      onUpdateFxLine,
    });

    expect(mockUseCrossCurrencyRates).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, workplaceCurrency: 'USD' }),
    );
    expect(onUpdateFxLine).not.toHaveBeenCalled();
  });

  it('does not loop while bootstrapping a missing foreign rate through a parent update', () => {
    mockUseCrossCurrencyRates.mockReturnValue({
      exchangeRate: 0.01,
      sourceBaseRate: 1,
      destBaseRate: 100,
      isLoadingRate: false,
      rateError: null,
    });

    const persistFxLine = jest.fn();

    function Harness() {
      const [row, setRow] = useState({
        id: 'foreign-bootstrap',
        accountId: asAccountId('category-food'),
        accountCurrency: 'INR',
        amount: '8.00',
        exchangeRate: '',
        precision: 2,
      });

      return (
        <ArchiveVisibilityScopeProvider>
          <SplitAllocationRow
            allAccounts={accounts}
            allocationAccounts={accounts}
            canRemove={false}
            currencyCode="USD"
            fallbackPrecision={2}
            emptyPrompt="Choose category"
            isExpanded={false}
            label="Category"
            onCreateAccountRequest={jest.fn()}
            onRemove={jest.fn()}
            onSelectAccount={jest.fn()}
            onToggle={jest.fn()}
            onUpdateAmount={jest.fn()}
            onUpdateFxLine={patch => {
              persistFxLine(patch);
              setRow(current => ({ ...current, ...patch }));
            }}
            onUpdateSourceExchangeRate={jest.fn()}
            removeLabel="Remove split"
            sourceCurrency="USD"
            workplaceCurrency="USD"
            row={row}
          />
        </ArchiveVisibilityScopeProvider>
      );
    }

    const { rerender } = render(<Harness />);
    expect(persistFxLine).toHaveBeenCalledTimes(1);

    rerender(<Harness />);

    expect(screen.getByTestId('split-fx-foreign-bootstrap-card')).toBeTruthy();
    expect(persistFxLine).toHaveBeenCalledTimes(1);
  });

  it('shows a parent-applied equal split after an initial zero foreign amount', () => {
    mockUseCrossCurrencyRates.mockReturnValue({
      exchangeRate: 100,
      sourceBaseRate: 1,
      destBaseRate: 0.01,
      isLoadingRate: false,
      rateError: null,
    });

    const onUpdateFxLine = jest.fn();
    const result = renderRow({
      currencyCode: 'USD',
      row: {
        id: 'foreign-equal-split',
        accountId: asAccountId('category-food'),
        accountCurrency: 'INR',
        amount: '0.00',
        exchangeRate: '',
        precision: 2,
      },
      sourceCurrency: 'USD',
      workplaceCurrency: 'USD',
      onUpdateFxLine,
    });

    result.rerender(
      <ArchiveVisibilityScopeProvider>
        <SplitAllocationRow
          allAccounts={accounts}
          allocationAccounts={accounts}
          canRemove={false}
          currencyCode="USD"
          fallbackPrecision={2}
          emptyPrompt="Choose category"
          isExpanded={false}
          label="Category"
          onCreateAccountRequest={jest.fn()}
          onRemove={jest.fn()}
          onSelectAccount={jest.fn()}
          onToggle={jest.fn()}
          onUpdateAmount={jest.fn()}
          onUpdateFxLine={onUpdateFxLine}
          onUpdateSourceExchangeRate={jest.fn()}
          removeLabel="Remove split"
          row={{
            id: 'foreign-equal-split',
            accountId: asAccountId('category-food'),
            accountCurrency: 'INR',
            amount: '800.00',
            exchangeRate: '',
            precision: 2,
          }}
          sourceCurrency="USD"
          workplaceCurrency="USD"
        />
      </ArchiveVisibilityScopeProvider>,
    );

    expect(screen.getByTestId('split-amount-input-foreign-equal-split')).toHaveProp(
      'value',
      '800.00',
    );
    expect(onUpdateFxLine).toHaveBeenCalledWith({
      amount: '80000.00',
      exchangeRate: '0.010000',
    });
  });

  it('publishes the fetched source rate before a zero foreign split is equalized', () => {
    mockUseCrossCurrencyRates.mockReturnValue({
      exchangeRate: 0.0104,
      sourceBaseRate: 0.0104,
      destBaseRate: 1,
      isLoadingRate: false,
      rateError: null,
    });

    const usdAccounts = [
      {
        ...accounts[0],
        currencyCode: 'USD',
      },
    ];
    const onUpdateSourceExchangeRate = jest.fn();

    renderRow({
      allAccounts: usdAccounts,
      allocationAccounts: usdAccounts,
      currencyCode: 'INR',
      onUpdateSourceExchangeRate,
      row: {
        id: 'foreign-zero-source-rate',
        accountId: asAccountId('category-food'),
        accountCurrency: 'USD',
        amount: '0.00',
        exchangeRate: '',
        precision: 2,
      },
      sourceCurrency: 'INR',
      workplaceCurrency: 'USD',
    });

    expect(onUpdateSourceExchangeRate).toHaveBeenCalledWith('0.010400');
  });

  it('persists a refreshed API rate even when the base amount is unchanged', () => {
    mockUseCrossCurrencyRates.mockReturnValue({
      exchangeRate: 0.01,
      sourceBaseRate: 1,
      destBaseRate: 100,
      isLoadingRate: false,
      rateError: null,
    });

    const persistFxLine = jest.fn();

    function Harness() {
      const [row, setRow] = useState({
        id: 'foreign-reset',
        accountId: asAccountId('category-food'),
        accountCurrency: 'INR',
        amount: '8.00',
        exchangeRate: '',
        precision: 2,
      });

      return (
        <ArchiveVisibilityScopeProvider>
          <SplitAllocationRow
            allAccounts={accounts}
            allocationAccounts={accounts}
            canRemove={false}
            currencyCode="USD"
            fallbackPrecision={2}
            emptyPrompt="Choose category"
            isExpanded={false}
            label="Category"
            onCreateAccountRequest={jest.fn()}
            onRemove={jest.fn()}
            onSelectAccount={jest.fn()}
            onToggle={jest.fn()}
            onUpdateAmount={jest.fn()}
            onUpdateFxLine={patch => {
              persistFxLine(patch);
              setRow(current => ({ ...current, ...patch }));
            }}
            onUpdateSourceExchangeRate={jest.fn()}
            removeLabel="Remove split"
            sourceCurrency="USD"
            workplaceCurrency="USD"
            row={row}
          />
        </ArchiveVisibilityScopeProvider>
      );
    }

    render(<Harness />);
    expect(persistFxLine).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.press(screen.getByTestId('split-fx-foreign-reset-reset-rate-button'));
    });

    expect(persistFxLine).toHaveBeenCalledTimes(3);
    expect(persistFxLine).toHaveBeenLastCalledWith({
      amount: '0.08',
      exchangeRate: '100.000000',
    });
  });

  it('keeps row-specific picker, amount, and test-id behavior together', () => {
    const onSelectAccount = jest.fn();
    const onUpdateAmount = jest.fn();
    renderRow({ onSelectAccount, onUpdateAmount });

    expect(screen.getByTestId('split-allocation-row-row-1')).toBeTruthy();
    expect(screen.getByTestId('split-category-picker-row-1-source-node')).toBeTruthy();
    expect(screen.getByTestId('split-amount-input-row-1')).toBeTruthy();
    expect(screen.getByTestId('account-picker-option-category-food')).toHaveProp(
      'accessibilityState',
      { selected: true },
    );

    act(() => {
      fireEvent.press(screen.getByTestId('account-picker-option-category-rent'));
      fireEvent.changeText(screen.getByTestId('split-amount-input-row-1'), '20.00');
    });

    expect(onSelectAccount).toHaveBeenCalledWith(asAccountId('category-rent'));
    expect(onUpdateAmount).toHaveBeenCalledWith('20.00');
  });

  it('preserves archived selected accounts and routes creation to the allocation role', () => {
    const archived = { ...accounts[0], archivedAt: new Date() } as AccountFields;
    const onCreateAccountRequest = jest.fn();
    renderRow({
      allAccounts: [archived, accounts[1]],
      allocationAccounts: [archived, accounts[1]],
      onCreateAccountRequest,
      row: {
        id: 'row-archived',
        accountId: archived.id,
        amount: '1.00',
        precision: 2,
      },
      isExpanded: true,
    });

    expect(screen.getByTestId('account-picker-option-category-food')).toBeTruthy();
    act(() => {
      fireEvent.press(screen.getByTestId('header-create-account-button'));
    });
    expect(onCreateAccountRequest).toHaveBeenCalledWith('destination', { suggestedName: '' });
  });

  it('attaches an editable FX leg above a foreign split row', () => {
    const onUpdateFxLine = jest.fn();
    mockUseCrossCurrencyRates.mockReturnValue({
      exchangeRate: 83,
      sourceBaseRate: 1,
      destBaseRate: 1 / 83,
      isLoadingRate: false,
      rateError: null,
    });

    renderRow({
      onUpdateFxLine,
      row: {
        id: 'foreign-row',
        accountId: asAccountId('category-food'),
        accountCurrency: 'INR',
        amount: '4150.00',
        exchangeRate: String(1 / 83),
        precision: 2,
      },
      sourceCurrency: 'USD',
      workplaceCurrency: 'USD',
    });

    expect(screen.getByTestId('split-fx-foreign-row-card')).toBeTruthy();
    expect(screen.getByTestId('split-fx-foreign-row-converted-amount-input')).toHaveProp(
      'value',
      '4150.00',
    );

    act(() => {
      fireEvent.changeText(screen.getByTestId('split-amount-input-foreign-row'), '60');
      fireEvent.changeText(
        screen.getByTestId('split-fx-foreign-row-converted-amount-input'),
        '5000',
      );
    });

    expect(onUpdateFxLine).toHaveBeenLastCalledWith({
      amount: '5000.00',
      exchangeRate: '0.010000',
    });
  });

  it('leaves the converted side empty until a missing rate is entered', () => {
    const onUpdateFxLine = jest.fn();

    renderRow({
      onUpdateFxLine,
      row: {
        id: 'unrated-row',
        accountId: asAccountId('category-food'),
        accountCurrency: 'INR',
        amount: '50.00',
        exchangeRate: '',
        precision: 2,
      },
      sourceCurrency: 'USD',
      workplaceCurrency: 'USD',
    });

    expect(screen.getByTestId('split-fx-unrated-row-converted-amount-input')).toHaveProp(
      'value',
      '',
    );

    act(() => {
      fireEvent.changeText(
        screen.getByTestId('split-fx-unrated-row-converted-amount-input'),
        '4150',
      );
    });

    expect(onUpdateFxLine).toHaveBeenCalledWith({
      amount: '4150.00',
      exchangeRate: '0.012048',
    });
  });

  it('exposes delete through accessibility when removal is allowed', () => {
    const onRemove = jest.fn();
    renderRow({ onRemove });

    act(() => {
      fireEvent(screen.getByTestId('split-allocation-row-row-1'), 'accessibilityAction', {
        nativeEvent: { actionName: 'delete' },
      });
    });

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
