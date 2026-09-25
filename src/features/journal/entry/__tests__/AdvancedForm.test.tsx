import { AppConfig } from '@/src/constants';
import { AccountType, TransactionType } from '@/src/types/enums';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { render, screen } from '@/src/utils/test-utils';
import React from 'react';
import { AdvancedForm } from '../components/AdvancedForm';
import type { AdvancedJournalFormController } from '../hooks/useAdvancedJournalForm';
import { resolveFxPair } from '../fxPair';

jest.mock('../components/SplitAllocationRow', () => ({
  SplitAllocationRow: ({ label, row }: { label: string; row: { id: string } }) => {
    const { Text } = require('react-native');
    return <Text>{`${label}:${row.id}`}</Text>;
  },
}));

function controller(
  overrides: Partial<AdvancedJournalFormController> = {},
): AdvancedJournalFormController {
  const line = {
    id: '1' as AdvancedJournalFormController['fromLines'][number]['id'],
    accountId: EMPTY_ACCOUNT_ID,
    accountName: '',
    accountType: AccountType.ASSET,
    amount: '',
    transactionType: TransactionType.CREDIT,
    notes: '',
    exchangeRate: '',
  };
  const fx = {
    pair: resolveFxPair({ sourceCurrency: 'USD', destCurrency: 'USD', baseCurrency: 'USD' }),
    inputAmount: '',
    inputCurrency: 'USD',
    inputPrecision: 2,
    rowPrecision: 2,
  };
  return {
    fromLines: [line],
    toLines: [{ ...line, id: '2' as typeof line.id, transactionType: TransactionType.DEBIT }],
    rowFx: { '1': fx, '2': fx },
    accounts: [],
    fromTotal: 0,
    toTotal: 0,
    remaining: 0,
    isBalanced: true,
    canEqualize: false,
    canDistribute: false,
    workplaceCurrency: 'USD',
    addFromLine: jest.fn(),
    addToLine: jest.fn(),
    removeLine: jest.fn(),
    canRemoveFrom: false,
    canRemoveTo: false,
    selectAccount: jest.fn(),
    updateAmount: jest.fn(),
    updateNotes: jest.fn(),
    updateConvertedAmount: jest.fn(),
    resetRate: jest.fn(),
    equalizeToLines: jest.fn(),
    distributeToLines: jest.fn(),
    moveLine: jest.fn(),
    ...overrides,
  };
}

describe('AdvancedForm', () => {
  it('renders From and To sides', () => {
    render(<AdvancedForm {...controller()} onCreateAccountRequestForRow={jest.fn()} />);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree).toContain(AppConfig.strings.advancedEntry.intro);
    expect(tree).toContain(AppConfig.strings.advancedEntry.fromTitle);
    expect(tree).toContain(AppConfig.strings.advancedEntry.toTitle);
  });
});
