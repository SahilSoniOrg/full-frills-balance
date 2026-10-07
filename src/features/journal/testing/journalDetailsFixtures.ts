import { Icon } from '@/src/types/domainIcons';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, asJournalId, asWorkplaceId } from '@/src/types/ids';
import { evaluateJournalBalance } from '@/src/domain/accounting/journalBalanceEvaluator';
import { buildJournalEntries, type JournalSplitItemViewModel } from '../journalDetailsPresentation';
import type { JournalDetailsSections } from '../hooks/useJournalDetailsViewModel';

export function journalDetailLeg(
  id: string,
  accountType = AccountType.ASSET,
  credit = true,
): JournalSplitItemViewModel {
  return {
    id,
    accountId: asAccountId(id),
    accountName: id,
    accountType,
    transactionType: credit ? TransactionType.CREDIT : TransactionType.DEBIT,
    amount: 52,
    currencyCode: 'INR',
    icon: Icon.Wallet,
    tint: 'asset',
    onPress: () => {},
    runningBalance: 18412.5,
    journalValue: 52,
    exchangeRate: 1,
  };
}

export function journalDetailEvaluation(items: JournalSplitItemViewModel[]) {
  return evaluateJournalBalance({
    journalCurrency: 'INR',
    precisionByCurrency: new Map([
      ['INR', 2],
      ['USD', 2],
    ]),
    lines: items.map(item => ({
      id: item.id,
      accountId: item.accountId,
      accountCurrency: item.currencyCode,
      amount: item.amount,
      exchangeRate: item.exchangeRate,
      transactionType: item.transactionType,
    })),
  });
}

export function journalDetailsFixture(
  overrides: Partial<JournalDetailsSections> = {},
): JournalDetailsSections {
  const splitItems = [
    journalDetailLeg('Federal Fi'),
    journalDetailLeg('Food & Drinks', AccountType.EXPENSE, false),
  ];
  const evaluation = journalDetailEvaluation(splitItems);
  return {
    journalId: asJournalId('8f2a19c4-test'),
    summary: {
      description: 'Coffee',
      statusLabel: 'Posted',
      statusVariant: 'income',
      amount: 52,
      amountPrefix: '-',
      amountColor: 'expense',
      currencyCode: 'INR',
      dateLine: 'Expense · Mon, Oct 5 · 08:39',
    },
    note: 'Oat flat white before the standup with Rohan',
    entries: buildJournalEntries(splitItems, 'INR', 'POSTED', evaluation),
    balanceEvaluation: evaluation,
    budget: { budgets: [], error: false, onRetry: () => {} },
    source: { error: false, onRetry: () => {} },
    history: {
      events: [],
      loading: false,
      error: false,
      onRetry: () => {},
      workplaceId: asWorkplaceId('workplace-test'),
      onOpenFullLog: () => {},
      timestamps: [
        { label: 'Created', value: 'Oct 5, 2026, 08:39' },
        { label: 'Last updated', value: 'Oct 5, 2026, 10:02' },
      ],
      links: [],
    },
    ...overrides,
  };
}
