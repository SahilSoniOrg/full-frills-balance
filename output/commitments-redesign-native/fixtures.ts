import type { BudgetItem } from '@/src/features/budget/types';
import type { BudgetDetailViewModel } from '@/src/features/budget/hooks/useBudgetDetailViewModel';
import type { PlannedPaymentDetailsViewModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel';
import type {
  PlannedPaymentListData,
  PlannedPaymentObligation,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import type { EnrichedJournal } from '@/src/types/domainReadModels';
import type { JournalListItem } from '@/src/types/ui';
import type { PlainAccount, PlainBudget, PlainJournal } from '@/src/types/plainDtos';
import {
  asAccountId,
  asBudgetId,
  asJournalId,
  asPlannedPaymentId,
  asWorkplaceId,
  type JournalId,
  type PlannedPaymentId,
} from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';
import {
  AccountType,
  JournalDisplayType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionType,
} from '@/src/types/enums';
import { getThemeColors, ThemeIds } from '@/src/constants/design-tokens';
import type { BudgetUsage } from '@/src/services/budget/types';
import { buildPlannedPaymentListPresentation } from '@/src/features/planned-payments/hooks/plannedPaymentListPresentation';
import {
  sortBudgetItems,
  summarizeBudgetList,
} from '@/src/features/budget/helpers/budgetListPresentation';
import type { WorkplaceContextType } from '@/src/contexts/WorkplaceContext';
import {
  buildBudgetCumulativeSeries,
  type BudgetCumulativeTx,
} from '@/src/services/projections/buildBudgetCumulativeSeries';
import type {
  BudgetCategorySpending,
  BudgetCumulativeChart,
} from '@/src/services/budget/budgetCumulativeChartService';
import { journalsToTimelineRows } from '@/src/services/journal/journalTimelineRows';
import { buildTimelineGroupingOptions } from '@/src/features/journal/list/hooks/journalDayNetGrouping';

const date = (year: number, monthIndex: number, dayOfMonth: number, hour = 12) =>
  new Date(year, monthIndex, dayOfMonth, hour).getTime();
const day = (n: number) => date(2026, 9, n);
const categoryId = asAccountId('fixture-category-groceries');
const categoryId2 = asAccountId('fixture-category-dining');
const checkingId = asAccountId('fixture-account-checking');
const savingsId = asAccountId('fixture-account-savings');
const incomeId = asAccountId('fixture-account-salary');
const budgetId = asBudgetId('fixture-budget-groceries');
const paymentId = asPlannedPaymentId('fixture-payment-streamline');

const groceries: PlainAccount = {
  id: categoryId,
  name: 'Groceries',
  accountType: AccountType.EXPENSE,
  currencyCode: 'INR',
  icon: Icon.ShoppingCart,
};
const dining: PlainAccount = {
  id: categoryId2,
  name: 'Dining out',
  accountType: AccountType.EXPENSE,
  currencyCode: 'INR',
  icon: Icon.Tag,
};
const checking: PlainAccount = {
  id: checkingId,
  name: 'Everyday account',
  accountType: AccountType.ASSET,
  currencyCode: 'INR',
  icon: Icon.Bank,
};
const savings: PlainAccount = {
  id: savingsId,
  name: 'Savings',
  accountType: AccountType.ASSET,
  currencyCode: 'INR',
  icon: Icon.Bank,
};
const salary: PlainAccount = {
  id: incomeId,
  name: 'Salary',
  accountType: AccountType.INCOME,
  currencyCode: 'INR',
  icon: Icon.TrendingUp,
};

const budget: PlainBudget = {
  id: budgetId,
  name: 'Groceries',
  amount: 24000,
  currencyCode: 'INR',
  intervalType: 'MONTHLY',
  intervalN: 1,
  startDate: day(1),
  recurrenceDay: 1,
  createdAt: day(1),
  assetAccountIds: JSON.stringify([checkingId]),
  active: true,
};
const foodUsage: BudgetUsage = {
  spent: 14680,
  remaining: 9320,
  budgetAmount: 24000,
  usagePercent: 14680 / 24000,
};
const diningBudget: PlainBudget = {
  ...budget,
  id: asBudgetId('fixture-budget-dining'),
  name: 'Dining out',
  amount: 10000,
};
const overUsage: BudgetUsage = {
  spent: 11240,
  remaining: -1240,
  budgetAmount: 10000,
  usagePercent: 1.124,
};
const weeklyBudget: PlainBudget = {
  ...budget,
  id: asBudgetId('fixture-budget-weekly'),
  name: 'Coffee',
  amount: 1800,
  intervalType: 'WEEKLY',
};
const weeklyUsage: BudgetUsage = {
  spent: 980,
  remaining: 820,
  budgetAmount: 1800,
  usagePercent: 980 / 1800,
};
const budgetItems: BudgetItem[] = [
  { budget, usage: foodUsage, scopeAccounts: [groceries, dining], fundingAccounts: [checking] },
  { budget: diningBudget, usage: overUsage, scopeAccounts: [dining], fundingAccounts: [checking] },
  { budget: weeklyBudget, usage: weeklyUsage, scopeAccounts: [groceries], fundingAccounts: [] },
];
const sortedBudgetItems = sortBudgetItems(budgetItems, day(4));
const noOverBudgetItems = sortBudgetItems(
  budgetItems.map(item => {
    const spent = Math.min(item.usage.spent, item.usage.budgetAmount * 0.5);
    return {
      ...item,
      usage: {
        ...item.usage,
        spent,
        remaining: item.usage.budgetAmount - spent,
        usagePercent: item.usage.budgetAmount > 0 ? spent / item.usage.budgetAmount : 0,
      },
    };
  }),
  day(4),
);

const diningJournalId = asJournalId('fixture-journal-dining');
const groceriesJournalId = asJournalId('fixture-journal-groceries');
const refundJournalId = asJournalId('fixture-journal-groceries-refund');
const currentChartTransactions: BudgetCumulativeTx[] = [
  { transactionDate: date(2026, 9, 2), amount: 5200, transactionType: TransactionType.DEBIT },
  { transactionDate: date(2026, 9, 3), amount: 9680, transactionType: TransactionType.DEBIT },
  {
    transactionDate: date(2026, 9, 3) + 2 * 60 * 60 * 1000,
    amount: 200,
    transactionType: TransactionType.CREDIT,
  },
];
const currentBudgetCategories: BudgetCategorySpending[] = [
  { accountId: categoryId, spent: 9480, refunds: 200, entryCount: 2, hasUnvaluedEntries: false },
  { accountId: categoryId2, spent: 5200, refunds: 0, entryCount: 1, hasUnvaluedEntries: false },
];

function budgetChartFixture(
  periodStart: number,
  periodEnd: number,
  transactions: BudgetCumulativeTx[],
  categories: BudgetCategorySpending[],
  refunds: number,
  entryCount: number,
): BudgetCumulativeChart {
  const series = buildBudgetCumulativeSeries({
    transactions,
    periodStart,
    periodEnd,
    precision: 2,
  });
  return {
    ...series,
    hasUnvaluedEntries: false,
    categories,
    entryCount,
    refunds,
  };
}

const currentBudgetChart = budgetChartFixture(
  day(1),
  day(31),
  currentChartTransactions,
  currentBudgetCategories,
  200,
  3,
);
const previousPeriodStart = day(1) - 30 * 24 * 60 * 60 * 1000;
const previousPeriodEnd = day(1) - 1;
const previousBudgetChart = budgetChartFixture(
  previousPeriodStart,
  previousPeriodEnd,
  [
    {
      transactionDate: previousPeriodStart + 2 * 24 * 60 * 60 * 1000,
      amount: 19240,
      transactionType: TransactionType.DEBIT,
    },
  ],
  [{ accountId: categoryId, spent: 19240, refunds: 0, entryCount: 1, hasUnvaluedEntries: false }],
  0,
  1,
);
const emptyBudgetChart = budgetChartFixture(day(1), day(31), [], [], 0, 0);

const budgetActivityJournals: EnrichedJournal[] = [
  {
    id: diningJournalId,
    journalDate: date(2026, 9, 2, 12),
    description: 'Dinner out',
    currencyCode: 'INR',
    status: 'POSTED',
    totalAmount: 5200,
    transactionCount: 2,
    displayType: JournalDisplayType.EXPENSE,
    accounts: [
      {
        id: checkingId,
        name: checking.name,
        accountType: AccountType.ASSET,
        role: 'SOURCE',
        amount: 5200,
        currencyCode: 'INR',
      },
      {
        id: categoryId2,
        name: dining.name,
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 5200,
        currencyCode: 'INR',
      },
    ],
  },
  {
    id: groceriesJournalId,
    journalDate: date(2026, 9, 3, 12),
    description: 'Grocery market',
    currencyCode: 'INR',
    status: 'POSTED',
    totalAmount: 9680,
    transactionCount: 2,
    displayType: JournalDisplayType.EXPENSE,
    accounts: [
      {
        id: checkingId,
        name: checking.name,
        accountType: AccountType.ASSET,
        role: 'SOURCE',
        amount: 9680,
        currencyCode: 'INR',
      },
      {
        id: categoryId,
        name: groceries.name,
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 9680,
        currencyCode: 'INR',
      },
    ],
  },
  {
    id: refundJournalId,
    journalDate: date(2026, 9, 3, 14),
    description: 'Grocery refund',
    currencyCode: 'INR',
    status: 'POSTED',
    totalAmount: 200,
    transactionCount: 2,
    displayType: JournalDisplayType.INCOME,
    accounts: [
      {
        id: categoryId,
        name: groceries.name,
        accountType: AccountType.EXPENSE,
        role: 'SOURCE',
        amount: 200,
        currencyCode: 'INR',
      },
      {
        id: checkingId,
        name: checking.name,
        accountType: AccountType.ASSET,
        role: 'DESTINATION',
        amount: 200,
        currencyCode: 'INR',
      },
    ],
  },
];

const budgetActivityRows = journalsToTimelineRows(budgetActivityJournals);
const budgetActivityGrouping = buildTimelineGroupingOptions(
  budgetActivityRows,
  'INR',
  2,
  {},
  () => {},
);
const budgetActivityByDay = new Map<number, typeof budgetActivityRows>();
for (const row of budgetActivityGrouping.items) {
  const startOfDay = new Date(budgetActivityGrouping.getDate(row)).setHours(0, 0, 0, 0);
  const rows = budgetActivityByDay.get(startOfDay) ?? [];
  rows.push(row);
  budgetActivityByDay.set(startOfDay, rows);
}
const budgetActivityItems: JournalListItem[] = [...budgetActivityByDay.keys()]
  .sort((a, b) => b - a)
  .flatMap(startOfDay => {
    const rows = budgetActivityByDay.get(startOfDay)!;
    rows.sort((a, b) => budgetActivityGrouping.getDate(b) - budgetActivityGrouping.getDate(a));
    const stats = budgetActivityGrouping.getStats(rows);
    return [
      {
        id: `sep-${startOfDay}`,
        type: 'separator' as const,
        date: startOfDay,
        isCollapsed: false,
        onToggle: () => {},
        count: stats.count,
        netAmount: stats.netAmount,
        currencyCode: stats.currencyCode,
      },
      ...rows.map(row => budgetActivityGrouping.renderItem(row)),
    ];
  });

type PlannedPaymentFixtureInput = Omit<
  Partial<PlannedPaymentObligation>,
  'id' | 'name' | 'amount' | 'nextDueOccurrence'
> & {
  id: PlannedPaymentId;
  name: string;
  amount: number;
  nextDueOccurrence: number;
};

const plannedPayment = ({
  id,
  name,
  amount,
  nextDueOccurrence,
  ...overrides
}: PlannedPaymentFixtureInput): PlannedPaymentObligation => ({
  id,
  name,
  description: 'Monthly subscription',
  amount,
  currencyCode: overrides.currencyCode ?? 'INR',
  fromAccountId: overrides.fromAccountId ?? checkingId,
  toAccountId: overrides.toAccountId ?? categoryId,
  intervalN: 1,
  intervalType: PlannedPaymentInterval.MONTHLY,
  startDate: day(1),
  endDate: undefined,
  nextOccurrence: nextDueOccurrence,
  nextDueOccurrence,
  outstandingJournalId: overrides.outstandingJournalId,
  status: overrides.status ?? PlannedPaymentStatus.ACTIVE,
  isAutoPost: overrides.isAutoPost ?? false,
  flowDirection: overrides.flowDirection ?? 'outflow',
  fromAccount: overrides.fromAccount ?? checking,
  toAccount: overrides.toAccount ?? groceries,
});

const obligations: PlannedPaymentObligation[] = [
  plannedPayment({
    id: paymentId,
    name: 'Streamline Pro',
    amount: 1299,
    nextDueOccurrence: day(1),
    outstandingJournalId: 'fixture-outstanding-streamline',
    isAutoPost: true,
  }),
  plannedPayment({
    id: asPlannedPaymentId('fixture-payment-rent'),
    name: 'Apartment rent',
    amount: 22000,
    nextDueOccurrence: day(5),
    fromAccount: savings,
    toAccount: groceries,
  }),
  plannedPayment({
    id: asPlannedPaymentId('fixture-payment-internet'),
    name: 'Home internet',
    amount: 1499,
    nextDueOccurrence: day(12),
  }),
  plannedPayment({
    id: asPlannedPaymentId('fixture-payment-salary'),
    name: 'Monthly salary',
    amount: 185000,
    nextDueOccurrence: day(25),
    fromAccount: salary,
    toAccount: checking,
    flowDirection: 'inflow',
  }),
  plannedPayment({
    id: asPlannedPaymentId('fixture-payment-paused'),
    name: 'Cloud storage',
    amount: 249,
    nextDueOccurrence: day(8),
    status: PlannedPaymentStatus.PAUSED,
  }),
];

const plannedListData: PlannedPaymentListData = { items: obligations, savedOccurrences: [] };
const plannedListPresentation = buildPlannedPaymentListPresentation(plannedListData, 'INR', day(4));
export const harnessWorkplace: WorkplaceContextType = {
  workplaceId: asWorkplaceId('fixture-workplace'),
  defaultCurrencyCode: 'INR',
  setWorkplaceId: async () => {},
  deleteWorkplace: async () => ({ status: 'committed', warnings: [] }),
};

export const BudgetFixtures = {
  budgetList: {
    items: sortedBudgetItems,
    summary: summarizeBudgetList(sortedBudgetItems, 'INR', day(4)),
    isLoading: false,
    error: null,
    onRetry: () => {},
    onItemPress: () => {},
    onCreate: () => {},
  },
  plannedList: {
    listData: plannedListPresentation,
    isLoading: false,
    error: null,
    onRetry: () => {},
    onItemPress: () => {},
    onCreate: () => {},
  },
  budgetListNoOver: {
    items: noOverBudgetItems,
    summary: summarizeBudgetList(noOverBudgetItems, 'INR', day(4)),
    isLoading: false,
    error: null,
    onRetry: () => {},
    onItemPress: () => {},
    onCreate: () => {},
  },
};

export const plannedFixtureCount = obligations.length;

export const budgetDetailFixture: BudgetDetailViewModel = {
  budget,
  usage: foodUsage,
  items: budgetActivityItems,
  isLoading: false,
  isMissing: false,
  isLoadingActivity: false,
  isLoadingMore: false,
  periodRange: { startDate: day(1), endDate: day(31) },
  scopeAccounts: [groceries, dining],
  fundingAccounts: [checking],
  isLoadingScope: false,
  isLoadingFunding: false,
  targetMonth: '2026-10',
  nextMonth: () => {},
  prevMonth: () => {},
  resetToToday: () => {},
  isCurrentMonth: true,
  chartData: currentBudgetChart,
  previousChartData: previousBudgetChart,
  previousComparisonSpent: 19240,
  isLoadingInsights: false,
  onRetryInsights: () => {},
  previousUsage: { spent: 19240, remaining: 4760, budgetAmount: 24000, usagePercent: 0.802 },
  previousPeriodRange: { startDate: day(1) - 30 * 86400000, endDate: day(1) - 86400000 },
  expenseAccounts: [groceries, dining],
  activityCategory: null,
  onFilterCategory: () => {},
  onAddExpense: () => {},
  periodLabel: 'October 2026',
  handleDelete: () => {},
  handleEdit: () => {},
  selectedIds: new Set<JournalId>(),
  isSelectionModeActive: false,
  onLongPressItem: () => {},
  selectionChrome: { exitSelectionMode: () => {}, selectAll: () => {}, clearItems: () => {} },
};

export const budgetDetailNothingSpentFixture: BudgetDetailViewModel = {
  ...budgetDetailFixture,
  usage: { ...foodUsage, spent: 0, remaining: foodUsage.budgetAmount, usagePercent: 0 },
  items: [],
  chartData: emptyBudgetChart,
};

const overLimitAmount = 14000;
export const budgetDetailOverLimitFixture: BudgetDetailViewModel = {
  ...budgetDetailFixture,
  budget: { ...budget, amount: overLimitAmount },
  usage: {
    ...foodUsage,
    budgetAmount: overLimitAmount,
    remaining: overLimitAmount - foodUsage.spent,
    usagePercent: foodUsage.spent / overLimitAmount,
  },
  previousUsage: {
    spent: 19240,
    remaining: overLimitAmount - 19240,
    budgetAmount: overLimitAmount,
    usagePercent: 19240 / overLimitAmount,
  },
};

export const budgetDetailMissingFxFixture: BudgetDetailViewModel = {
  ...budgetDetailFixture,
  usage: {
    ...foodUsage,
    hasUnvaluedEntries: true,
    unvaluedEntryCount: 2,
    unvaluedCurrencyCounts: [{ currencyCode: 'USD', count: 2 }],
  },
};

const paidPaymentJournalId = asJournalId('fixture-planned-history-paid');
const skippedPaymentJournalId = asJournalId('fixture-planned-history-skipped');
const reversedPaymentJournalId = asJournalId('fixture-planned-history-reversed');
const lastRecordedPayment: PlainJournal = {
  id: paidPaymentJournalId,
  journalDate: date(2026, 8, 3),
  description: 'Streamline Pro monthly payment',
  currencyCode: 'INR',
  status: JournalStatus.POSTED,
  plannedPaymentId: paymentId,
  totalAmount: 1499,
  transactionCount: 2,
  displayType: JournalDisplayType.EXPENSE,
};

function plannedHistoryEntry(
  id: JournalId,
  journalDate: number,
  status: JournalStatus,
  totalAmount: number,
  description: string,
): EnrichedJournal {
  return {
    id,
    journalDate,
    description,
    currencyCode: 'INR',
    status,
    totalAmount,
    transactionCount: 2,
    displayType: JournalDisplayType.EXPENSE,
    plannedPaymentId: paymentId,
    accounts: [
      {
        id: checkingId,
        name: checking.name,
        accountType: AccountType.ASSET,
        role: 'SOURCE',
        amount: totalAmount,
        currencyCode: 'INR',
        icon: checking.icon,
        color: 'asset',
      },
      {
        id: categoryId,
        name: groceries.name,
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: totalAmount,
        currencyCode: 'INR',
        icon: groceries.icon,
        color: 'expense',
      },
    ],
  };
}

const plannedPaymentHistory: EnrichedJournal[] = [
  plannedHistoryEntry(
    paidPaymentJournalId,
    date(2026, 8, 3),
    JournalStatus.POSTED,
    1499,
    'Streamline Pro paid at edited amount',
  ),
  plannedHistoryEntry(
    skippedPaymentJournalId,
    date(2026, 7, 3),
    JournalStatus.SKIPPED,
    1299,
    'Streamline Pro payment skipped',
  ),
  plannedHistoryEntry(
    reversedPaymentJournalId,
    date(2026, 6, 3),
    JournalStatus.REVERSED,
    1299,
    'Streamline Pro payment reversed',
  ),
];

export const plannedDetailFixture: PlannedPaymentDetailsViewModel = {
  theme: getThemeColors(ThemeIds.DEEP_SPACE, 'dark'),
  isLoading: false,
  isMissing: false,
  onBack: () => {},
  title: 'Streamline Pro',
  amount: 1299,
  currencyCode: 'INR',
  nameText: 'Streamline Pro',
  status: PlannedPaymentStatus.ACTIVE,
  statusText: 'Active',
  statusVariant: 'success',
  typeLabel: 'Money out',
  typeColorKey: 'expense',
  iconName: Icon.ArrowDown,
  displayType: JournalDisplayType.EXPENSE,
  intervalLabel: 'Monthly on the 3rd',
  nextOccurrenceText: 'Saturday, Oct 3',
  isAutoPost: true,
  description: 'Team plan renews each month.',
  startDateText: 'Oct 3, 2025',
  endDateText: 'No end date',
  dueLabel: 'Overdue by 2 days',
  dueColor: 'error',
  nextOccurrenceDate: day(3),
  showcasedOccurrenceDate: day(3),
  firstRecordedDate: date(2025, 9, 3),
  occurrenceAmount: { amount: 1499, currencyCode: 'INR' },
  outstandingJournalId: asJournalId('fixture-outstanding-streamline'),
  nextOccurrences: [
    { date: date(2026, 10, 3), amount: 1299, currencyCode: 'INR' },
    { date: date(2026, 11, 3), amount: 1299, currencyCode: 'INR' },
    { date: date(2027, 0, 3), amount: 1299, currencyCode: 'INR' },
  ],
  activitySummary: {
    recordedCount: 9,
    skippedCount: 1,
    reversedCount: 1,
    pendingCount: 1,
    pausedCount: 0,
    overdueCount: 1,
    recordedTotals: [{ amount: 11691, currencyCode: 'INR' }],
    lastRecorded: lastRecordedPayment,
  },
  isLoadingActivity: false,
  isLoadingHistory: false,
  pendingAction: null,
  actionError: null,
  fromAccount: checking,
  toAccount: groceries,
  fromAccountColorKey: 'asset',
  toAccountColorKey: 'expense',
  history: plannedPaymentHistory,
  reversalJournalIds: new Set([reversedPaymentJournalId]),
  hasMore: false,
  rawAmount: 1299,
  rawName: 'Streamline Pro',
  onPost: () => {},
  onSkip: () => {},
  onToggleStatus: () => {},
  onOpenJournal: () => {},
  onOpenAccount: () => {},
  selectedIds: new Set<JournalId>(),
  isSelectionModeActive: false,
  onLongPressItem: () => {},
  toggleSelection: () => {},
  selectAll: () => {},
  clearItems: () => {},
  exitSelectionMode: () => {},
  onShareSelected: () => {},
};

export const plannedDetailPausedFixture: PlannedPaymentDetailsViewModel = {
  ...plannedDetailFixture,
  status: PlannedPaymentStatus.PAUSED,
  statusText: 'Paused',
  pausedSinceDate: day(2),
  onPost: undefined,
  outstandingJournalId: undefined,
  nextOccurrenceDate: undefined,
  showcasedOccurrenceDate: undefined,
  nextOccurrences: [],
  activitySummary: {
    recordedCount: 9,
    skippedCount: 1,
    reversedCount: 1,
    pendingCount: 0,
    pausedCount: 1,
    overdueCount: 0,
    recordedTotals: [{ amount: 11691, currencyCode: 'INR' }],
    lastRecorded: lastRecordedPayment,
  },
};

export const plannedDetailEndedFixture: PlannedPaymentDetailsViewModel = {
  ...plannedDetailFixture,
  status: PlannedPaymentStatus.COMPLETED,
  statusText: 'Completed',
  onPost: undefined,
  outstandingJournalId: undefined,
  nextOccurrenceDate: undefined,
  showcasedOccurrenceDate: undefined,
  nextOccurrences: [],
  activitySummary: {
    recordedCount: 9,
    skippedCount: 1,
    reversedCount: 1,
    pendingCount: 0,
    pausedCount: 0,
    overdueCount: 0,
    recordedTotals: [{ amount: 11691, currencyCode: 'INR' }],
    lastRecorded: lastRecordedPayment,
  },
};
