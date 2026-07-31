import {
  isGuidedDisabledForMode,
  modeOwnsEditorLines,
  resolveJournalModeTransition,
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

const twoLegLines = [
  filledLine('1', TransactionType.CREDIT),
  filledLine('2', TransactionType.DEBIT),
];

const threeSubstantiveLines = [...twoLegLines, filledLine('3', TransactionType.DEBIT)];

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
    expect(isGuidedDisabledForMode('advanced', twoLegLines)).toBe(false);
  });
});

describe('resolveJournalModeTransition', () => {
  it('blocks Guided when the lines it would inherit exceed two legs', () => {
    const transition = resolveJournalModeTransition({
      from: 'advanced',
      to: 'guided',
      lines: threeSubstantiveLines,
    });

    expect(transition).toEqual({ status: 'blocked' });
  });

  it('lets Guided through from Split even though editor.lines are stale', () => {
    const transition = resolveJournalModeTransition({
      from: 'split',
      to: 'guided',
      lines: threeSubstantiveLines,
    });

    expect(transition.status).toBe('applied');
    expect(transition.status === 'applied' && transition.nextMode).toBe('guided');
  });

  it('lands on Advanced when the lines cannot collapse into two guided legs', () => {
    const creditOnly = [
      filledLine('1', TransactionType.CREDIT),
      filledLine('2', TransactionType.CREDIT),
    ];

    const transition = resolveJournalModeTransition({
      from: 'advanced',
      to: 'guided',
      lines: creditOnly,
    });

    expect(transition).toEqual({ status: 'applied', nextMode: 'advanced', nextLines: creditOnly });
  });

  it('normalizes to a credit-then-debit pair when entering Guided', () => {
    const transition = resolveJournalModeTransition({
      from: 'advanced',
      to: 'guided',
      lines: [filledLine('1', TransactionType.DEBIT), filledLine('2', TransactionType.CREDIT)],
    });

    expect(transition.status).toBe('applied');
    if (transition.status !== 'applied') return;
    expect(transition.nextMode).toBe('guided');
    expect(transition.nextLines.map(l => l.transactionType)).toEqual([
      TransactionType.CREDIT,
      TransactionType.DEBIT,
    ]);
  });

  it('carries lines across between the two modes that own them', () => {
    const transition = resolveJournalModeTransition({
      from: 'guided',
      to: 'advanced',
      lines: twoLegLines,
    });

    expect(transition).toEqual({
      status: 'applied',
      nextMode: 'advanced',
      nextLines: twoLegLines,
    });
  });

  it('scaffolds fresh lines when leaving a draft mode', () => {
    const transition = resolveJournalModeTransition({
      from: 'bulk',
      to: 'advanced',
      lines: threeSubstantiveLines,
    });

    expect(transition.status).toBe('applied');
    if (transition.status !== 'applied') return;
    expect(transition.nextLines).toHaveLength(2);
    expect(transition.nextLines.every(l => l.accountId === EMPTY_ACCOUNT_ID)).toBe(true);
  });
});
