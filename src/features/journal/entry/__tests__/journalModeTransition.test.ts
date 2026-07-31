import {
  isGuidedDisabledForMode,
  modeOwnsEditorLines,
} from '@/src/features/journal/entry/journalModeTransition';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { AccountId, EMPTY_ACCOUNT_ID, JournalEntryLine, TransactionId } from '@/src/types/domain';

function line(
  id: string,
  transactionType: TransactionType,
  overrides: Partial<JournalEntryLine> = {},
): JournalEntryLine {
  return {
    id: id as TransactionId,
    accountId: EMPTY_ACCOUNT_ID,
    accountName: '',
    accountType: AccountType.ASSET,
    amount: '',
    transactionType,
    notes: '',
    exchangeRate: '',
    ...overrides,
  };
}

function filledLine(id: string, transactionType: TransactionType): JournalEntryLine {
  return line(id, transactionType, { accountId: `acc-${id}` as AccountId, amount: '10' });
}

const threeSubstantiveLines = [
  filledLine('1', TransactionType.CREDIT),
  filledLine('2', TransactionType.DEBIT),
  filledLine('3', TransactionType.DEBIT),
];

describe('modeOwnsEditorLines', () => {
  it('is true for the modes that edit editor.lines directly', () => {
    expect(modeOwnsEditorLines('guided')).toBe(true);
    expect(modeOwnsEditorLines('advanced')).toBe(true);
  });

  it('is false for the modes that keep their own draft', () => {
    expect(modeOwnsEditorLines('split')).toBe(false);
    expect(modeOwnsEditorLines('bulk')).toBe(false);
  });
});

describe('isGuidedDisabledForMode', () => {
  it('blocks Guided when the current mode owns the over-long lines', () => {
    expect(isGuidedDisabledForMode('advanced', threeSubstantiveLines)).toBe(true);
    expect(isGuidedDisabledForMode('guided', threeSubstantiveLines)).toBe(true);
  });

  it('does not block Guided from Split or Bulk, where editor.lines are stale', () => {
    expect(isGuidedDisabledForMode('split', threeSubstantiveLines)).toBe(false);
    expect(isGuidedDisabledForMode('bulk', threeSubstantiveLines)).toBe(false);
  });

  it('does not block Guided when a lines-owning mode is within the two-leg limit', () => {
    const twoLegs = [
      filledLine('1', TransactionType.CREDIT),
      filledLine('2', TransactionType.DEBIT),
    ];
    expect(isGuidedDisabledForMode('advanced', twoLegs)).toBe(false);
  });
});
