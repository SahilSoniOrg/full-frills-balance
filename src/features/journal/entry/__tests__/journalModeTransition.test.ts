import {
  AccountId,
  AccountType,
  EMPTY_ACCOUNT_ID,
  JournalEntryLine,
  TransactionId,
  TransactionType,
} from '@/src/types/domain';
import {
  isGuidedDisabledForMode,
  JournalModeTransitionInput,
  modeOwnsEditorLines,
  resolveJournalModeTransition,
} from '@/src/features/journal/entry/journalModeTransition';

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

/** Resolves a transition that is expected to apply, narrowed for assertions. */
function applied(input: JournalModeTransitionInput) {
  const transition = resolveJournalModeTransition(input);
  if (transition.status !== 'applied') {
    throw new Error(`Expected transition to ${input.to} to apply, got ${transition.status}`);
  }
  return transition;
}

describe('resolveJournalModeTransition', () => {
  it('blocks Guided when the lines it would inherit exceed two legs', () => {
    const transition = resolveJournalModeTransition({
      from: 'advanced',
      to: 'guided',
      lines: threeSubstantiveLines,
      snapshots: {},
    });

    expect(transition).toEqual({ status: 'blocked' });
  });

  it('lets Guided through from Split even though editor.lines are stale', () => {
    const transition = applied({
      from: 'split',
      to: 'guided',
      lines: threeSubstantiveLines,
      snapshots: {},
    });

    expect(transition.nextMode).toBe('guided');
  });

  it('lands on Advanced when the lines cannot collapse into two guided legs', () => {
    const creditOnly = [
      filledLine('1', TransactionType.CREDIT),
      filledLine('2', TransactionType.CREDIT),
    ];

    const transition = applied({
      from: 'advanced',
      to: 'guided',
      lines: creditOnly,
      snapshots: {},
    });

    expect(transition.nextMode).toBe('advanced');
    expect(transition.nextLines).toEqual(creditOnly);
  });

  it('normalizes to a credit-then-debit pair when entering Guided', () => {
    const transition = applied({
      from: 'advanced',
      to: 'guided',
      lines: [filledLine('1', TransactionType.DEBIT), filledLine('2', TransactionType.CREDIT)],
      snapshots: {},
    });

    expect(transition.nextMode).toBe('guided');
    expect(transition.nextLines.map(l => l.transactionType)).toEqual([
      TransactionType.CREDIT,
      TransactionType.DEBIT,
    ]);
  });

  it('carries lines across between the two modes that own them', () => {
    const transition = applied({
      from: 'guided',
      to: 'advanced',
      lines: twoLegLines,
      snapshots: {},
    });

    expect(transition.nextMode).toBe('advanced');
    expect(transition.nextLines).toBe(twoLegLines);
  });

  it('parks a clean scaffold when entering a draft mode', () => {
    const transition = applied({
      from: 'advanced',
      to: 'split',
      lines: threeSubstantiveLines,
      snapshots: {},
    });

    expect(transition.nextLines).toHaveLength(2);
    expect(transition.nextLines.every(l => l.accountId === EMPTY_ACCOUNT_ID)).toBe(true);
    expect(transition.snapshots.advanced).toBe(threeSubstantiveLines);
  });

  it('restores the advanced work parked before the Split detour', () => {
    const intoSplit = applied({
      from: 'advanced',
      to: 'split',
      lines: threeSubstantiveLines,
      snapshots: {},
    });

    const backToAdvanced = applied({
      from: 'split',
      to: 'advanced',
      lines: intoSplit.nextLines,
      snapshots: intoSplit.snapshots,
    });

    expect(backToAdvanced.nextLines).toBe(threeSubstantiveLines);
  });

  it('restores the guided lines parked before the Bulk detour', () => {
    const intoBulk = applied({
      from: 'guided',
      to: 'bulk',
      lines: twoLegLines,
      snapshots: {},
    });

    const backToGuided = applied({
      from: 'bulk',
      to: 'guided',
      lines: intoBulk.nextLines,
      snapshots: intoBulk.snapshots,
    });

    expect(backToGuided.nextMode).toBe('guided');
    expect(backToGuided.nextLines.map(l => l.accountId)).toEqual(twoLegLines.map(l => l.accountId));
  });

  it('falls back to the other lines-owning mode when the target has no snapshot', () => {
    const intoBulk = applied({
      from: 'advanced',
      to: 'bulk',
      lines: twoLegLines,
      snapshots: {},
    });

    const intoGuided = applied({
      from: 'bulk',
      to: 'guided',
      lines: intoBulk.nextLines,
      snapshots: intoBulk.snapshots,
    });

    expect(intoGuided.nextMode).toBe('guided');
    expect(intoGuided.nextLines.map(l => l.accountId)).toEqual(twoLegLines.map(l => l.accountId));
  });

  it('scaffolds when leaving a draft mode with nothing parked', () => {
    const transition = applied({
      from: 'bulk',
      to: 'advanced',
      lines: threeSubstantiveLines,
      snapshots: {},
    });

    expect(transition.nextLines).toHaveLength(2);
    expect(transition.nextLines.every(l => l.accountId === EMPTY_ACCOUNT_ID)).toBe(true);
  });

  it('leaves lines and snapshots untouched when the mode does not change', () => {
    const transition = applied({
      from: 'advanced',
      to: 'advanced',
      lines: threeSubstantiveLines,
      snapshots: {},
    });

    expect(transition.nextLines).toBe(threeSubstantiveLines);
    expect(transition.snapshots).toEqual({});
  });
});
