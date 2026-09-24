import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { resolveFxPair } from '@/src/features/journal/entry/fxPair';
import type { SplitRowFx } from '@/src/features/journal/entry/modes/split/splitJournalState';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import React from 'react';
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

const sameCurrencyFx: SplitRowFx = {
  pair: resolveFxPair({ sourceCurrency: 'INR', destCurrency: 'INR', baseCurrency: 'INR' }),
  inputAmount: '12.50',
  inputCurrency: 'INR',
  inputPrecision: 2,
  rowPrecision: 2,
};

function foreignFx(destBaseRate: number | null, inputAmount: string): SplitRowFx {
  return {
    pair: resolveFxPair({
      sourceCurrency: 'USD',
      destCurrency: 'INR',
      baseCurrency: 'USD',
      fetched: { sourceBaseRate: 1, destBaseRate, isLoading: false, error: null },
      sourceAmount: Number.parseFloat(inputAmount) || 0,
    }),
    inputAmount,
    inputCurrency: 'USD',
    inputPrecision: 2,
    rowPrecision: 2,
  };
}

function renderRow(overrides: Partial<React.ComponentProps<typeof SplitAllocationRow>> = {}) {
  return render(
    <ArchiveVisibilityScopeProvider>
      <SplitAllocationRow
        allAccounts={accounts}
        allocationAccounts={accounts}
        canRemove
        emptyPrompt="Choose category"
        fx={sameCurrencyFx}
        isExpanded
        label="Category"
        onChangeAmount={jest.fn()}
        onConvertedAmountChange={jest.fn()}
        onCreateAccountRequest={jest.fn()}
        onRemove={jest.fn()}
        onResetToApiRate={jest.fn()}
        onSelectAccount={jest.fn()}
        onToggle={jest.fn()}
        removeLabel="Remove split"
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
  it('keeps row-specific picker, amount, and test-id behavior together', () => {
    const onSelectAccount = jest.fn();
    const onChangeAmount = jest.fn();
    renderRow({ onSelectAccount, onChangeAmount });

    expect(screen.getByTestId('split-allocation-row-row-1')).toBeTruthy();
    expect(screen.getByTestId('split-category-picker-row-1-source-node')).toBeTruthy();
    expect(screen.getByTestId('split-amount-input-row-1')).toBeTruthy();
    expect(screen.queryByTestId('split-fx-row-1-card')).toBeNull();
    expect(screen.getByTestId('account-picker-option-category-food')).toHaveProp(
      'accessibilityState',
      { selected: true },
    );

    act(() => {
      fireEvent.press(screen.getByTestId('account-picker-option-category-rent'));
      fireEvent.changeText(screen.getByTestId('split-amount-input-row-1'), '20.00');
    });

    expect(onSelectAccount).toHaveBeenCalledWith(asAccountId('category-rent'));
    expect(onChangeAmount).toHaveBeenCalledWith('20.00');
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

  it('attaches the FX card above a foreign row and forwards its edits', () => {
    const onChangeAmount = jest.fn();
    const onConvertedAmountChange = jest.fn();
    const onResetToApiRate = jest.fn();
    renderRow({
      fx: foreignFx(1 / 83, '50.00'),
      onChangeAmount,
      onConvertedAmountChange,
      onResetToApiRate,
      row: {
        id: 'foreign-row',
        accountId: asAccountId('category-food'),
        accountCurrency: 'INR',
        amount: '4150.00',
        exchangeRate: String(1 / 83),
        precision: 2,
      },
    });

    expect(screen.getByTestId('split-fx-foreign-row-card')).toBeTruthy();
    expect(screen.getByTestId('split-amount-input-foreign-row')).toHaveProp('value', '50.00');
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
      fireEvent.press(screen.getByTestId('split-fx-foreign-row-reset-fx-rate-button'));
    });

    expect(onChangeAmount).toHaveBeenCalledWith('60');
    expect(onConvertedAmountChange).toHaveBeenLastCalledWith('5000');
    expect(onResetToApiRate).toHaveBeenCalledTimes(1);
  });

  it('leaves the converted side empty until a rate is known', () => {
    renderRow({
      fx: foreignFx(null, '50.00'),
      row: {
        id: 'unrated-row',
        accountId: asAccountId('category-food'),
        accountCurrency: 'INR',
        amount: '50.00',
        exchangeRate: '',
        precision: 2,
      },
    });

    expect(screen.getByTestId('split-fx-unrated-row-converted-amount-input')).toHaveProp(
      'value',
      '',
    );
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
