import { isValidIconName, type IconName } from '@/src/components/core';
import { AppConfig, JOURNAL_DETAILS_DATE_PATTERN, type ColorKey } from '@/src/constants';
import {
  getValuationIssues,
  isJournalFullyValued,
  type JournalBalanceEvaluation,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import type { JournalBudgetImpact } from '@/src/services/budget/budgetReadService';
import { getOccurrenceOnOrAfter } from '@/src/services/forward-finance/recurrence/RecurrenceEngine';
import type { DisplayTransaction } from '@/src/types/domainReadModels';
import { AccountType, JournalDisplayType, JournalStatus, TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import type { PlainJournal, PlainPlannedPayment } from '@/src/types/plainDtos';
import { getAccountTypeColorKey } from '@/src/utils/accountCategory';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { formatDate, formatDateKeepingPattern } from '@/src/utils/dateUtils';
import type { ResolvedHourCycle } from '@/src/utils/hourCycle';
import { fromMinorUnits } from '@/src/utils/money';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';
import dayjs from 'dayjs';
import type { JournalHistoryEvent } from './journalHistoryPresentation';
import type { JournalSourceInfo } from './journalSourcePresentation';

export interface JournalSplitItemViewModel {
  id: string;
  accountId: AccountId;
  accountName: string;
  accountType?: AccountType;
  accountColor?: string;
  transactionType: TransactionType;
  amount: number;
  currencyCode: string;
  icon: IconName;
  tint: ColorKey;
  onPress: () => void;
  notes?: string;
  journalValue?: number;
  exchangeRate?: number;
  runningBalance?: number;
}

export interface JournalEntryGroup {
  label: string;
  items: JournalSplitItemViewModel[];
  total?: number;
}

export interface JournalEntriesPresentation {
  shape: 'one-to-one' | 'split';
  currencyCode: string;
  credits: JournalSplitItemViewModel[];
  debits: JournalSplitItemViewModel[];
  groups: JournalEntryGroup[];
  balanceItems: JournalSplitItemViewModel[];
  posted: boolean;
  balanced: boolean;
}

export interface JournalSummaryModel {
  description: string;
  statusLabel: string;
  statusVariant: 'income' | 'primary' | 'default';
  /** Undefined when some line could not be valued in the journal currency. */
  amount?: number;
  amountPrefix: '+' | '-' | '';
  amountColor: 'income' | 'expense' | 'text';
  currencyCode: string;
  dateLine: string;
}

export interface JournalPlannedModel {
  notice?: string;
  move?: { direction: 'in' | 'out'; amount: number; currencyCode: string; accountName: string };
  onPost: () => void;
  onSkip?: () => void;
  pending?: 'post' | 'skip';
}

export interface JournalBudgetModel {
  budgets: JournalBudgetImpact[];
  error: boolean;
  onRetry: () => void;
}

export interface JournalScheduleModel {
  name: string;
  recurrence: string;
  since: string;
  after: string;
  onPress: () => void;
  onRevert?: () => void;
}

export interface JournalSourceModel extends JournalSourceInfo {
  error: boolean;
  onRetry: () => void;
  onOpenSmsInbox?: () => void;
}

export interface JournalLink {
  label: string;
  onPress: () => void;
}

export interface JournalHistoryModel {
  events: JournalHistoryEvent[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  workplaceId: WorkplaceId;
  onOpenFullLog: () => void;
  /** Shown instead of events for journals written before the audit trail existed. */
  timestamps: { label: string; value: string }[];
  links: JournalLink[];
}

export function isBalanceAccount(item: { accountType?: AccountType }): boolean {
  return item.accountType === AccountType.ASSET || item.accountType === AccountType.LIABILITY;
}

export function buildJournalSplitItems(
  transactions: DisplayTransaction[],
  onAccountPress: (accountId: AccountId) => void,
  evaluation?: JournalBalanceEvaluation,
): JournalSplitItemViewModel[] {
  const lineValues = new Map(evaluation?.lineValues.map(line => [line.id, line]));
  return transactions.map(item => {
    const value = lineValues.get(item.id);
    return {
      id: item.id,
      accountId: item.accountId,
      accountName: item.accountName || AppConfig.strings.journalDetails.unknownAccount,
      accountType: item.accountType,
      accountColor: item.accountColor,
      transactionType: item.transactionType,
      amount: item.amount,
      currencyCode: item.currencyCode,
      icon: isValidIconName(item.icon) ? item.icon : getAccountFallbackIcon(item.accountType),
      tint: item.accountType ? getAccountTypeColorKey(item.accountType) : 'primary',
      onPress: () => onAccountPress(item.accountId),
      notes: item.notes || undefined,
      journalValue: value?.journalAmount,
      exchangeRate: value?.exchangeRate,
      runningBalance: Number.isFinite(item.runningBalance) ? item.runningBalance : undefined,
    };
  });
}

export function buildJournalEntries(
  items: JournalSplitItemViewModel[],
  currencyCode: string,
  status: string,
  evaluation?: JournalBalanceEvaluation,
): JournalEntriesPresentation {
  const strings = AppConfig.strings.journalDetails;
  const credits = items.filter(item => item.transactionType === TransactionType.CREDIT);
  const debits = items.filter(item => item.transactionType === TransactionType.DEBIT);
  const oneToOne =
    credits.length === 1 &&
    debits.length === 1 &&
    items.every(item => item.currencyCode.toUpperCase() === currencyCode.toUpperCase());
  // A side's total is only meaningful when every line on it, and the journal itself, was valued.
  const journalValued =
    !!evaluation && !getValuationIssues(evaluation).some(issue => !issue.lineId);
  const total = (sideItems: JournalSplitItemViewModel[], totalMinorUnits: number) =>
    evaluation && journalValued && sideItems.every(item => item.journalValue !== undefined)
      ? fromMinorUnits(totalMinorUnits, evaluation.journalPrecision)
      : undefined;
  const groups: JournalEntryGroup[] = [
    {
      label: strings.from,
      items: credits,
      total: total(credits, evaluation?.creditTotalMinorUnits ?? 0),
    },
    {
      label: strings.to,
      items: debits,
      total: total(debits, evaluation?.debitTotalMinorUnits ?? 0),
    },
  ].filter(group => group.items.length > 0);
  const posted = status === JournalStatus.POSTED;
  return {
    shape: oneToOne ? 'one-to-one' : 'split',
    currencyCode,
    credits,
    debits,
    groups,
    balanceItems: posted ? items.filter(isBalanceAccount) : [],
    posted,
    balanced: evaluation?.isBalanced === true,
  };
}

export function formatJournalDateLine({
  journalDate,
  status,
  displayType,
  entryCount,
  today,
  hourCycle,
}: {
  journalDate: number;
  status: JournalStatus;
  displayType: JournalDisplayType;
  entryCount: number;
  today: number;
  hourCycle: ResolvedHourCycle;
}): string {
  const strings = AppConfig.strings.journalDetails;
  const datePattern = JOURNAL_DETAILS_DATE_PATTERN;
  if (status === JournalStatus.PLANNED) {
    const days = dayjs(journalDate).startOf('day').diff(dayjs(today), 'day');
    return strings.due(
      dayjs(journalDate).format(datePattern),
      days === 0 ? strings.dueToday : days > 0 ? strings.inDays(days) : strings.overdue(-days),
    );
  }
  const dateTime = formatDateKeepingPattern(journalDate, datePattern, hourCycle, ' · ');
  return displayType === JournalDisplayType.MIXED
    ? `${dateTime} · ${strings.entries(entryCount)}`
    : `${strings.displayTypes[displayType]} · ${dateTime}`;
}

export function buildJournalSummary(
  journal: PlainJournal,
  context: {
    evaluation?: JournalBalanceEvaluation;
    entryCount: number;
    today: number;
    hourCycle: ResolvedHourCycle;
  },
): JournalSummaryModel {
  const strings = AppConfig.strings.journalDetails;
  const { evaluation } = context;
  const isIncome = journal.displayType === JournalDisplayType.INCOME;
  const isExpense = journal.displayType === JournalDisplayType.EXPENSE;
  return {
    description: journal.description || strings.noDescription,
    statusLabel: strings.statuses[journal.status],
    statusVariant:
      journal.status === JournalStatus.POSTED
        ? 'income'
        : journal.status === JournalStatus.PLANNED
          ? 'primary'
          : 'default',
    amount:
      evaluation && isJournalFullyValued(evaluation)
        ? fromMinorUnits(evaluation.debitTotalMinorUnits, evaluation.journalPrecision)
        : undefined,
    amountPrefix: isIncome ? '+' : isExpense ? '-' : '',
    amountColor: isIncome ? 'income' : isExpense ? 'expense' : 'text',
    currencyCode: journal.currencyCode,
    dateLine: formatJournalDateLine({
      journalDate: journal.journalDate,
      status: journal.status,
      displayType: journal.displayType,
      entryCount: context.entryCount,
      today: context.today,
      hourCycle: context.hourCycle,
    }),
  };
}

/** Planned copy names the account only when one leg clearly moves money in or out. */
export function plannedMove(
  entries: JournalEntriesPresentation,
  displayType: JournalDisplayType,
  valued: boolean,
): JournalPlannedModel['move'] {
  if (!valued || entries.credits.length !== 1 || entries.debits.length !== 1) return undefined;
  const incoming = displayType === JournalDisplayType.INCOME;
  const leg = incoming ? entries.debits[0] : entries.credits[0];
  return {
    direction: incoming ? 'in' : 'out',
    amount: leg.amount,
    currencyCode: leg.currencyCode,
    accountName: leg.accountName,
  };
}

/** Schedule cursor is today's pending occurrence, not the occurrence after a historical journal. */
export function nextJournalOccurrence(
  payment: PlainPlannedPayment,
  journalDate: number,
): number | undefined {
  const next = getOccurrenceOnOrAfter(
    payment.startDate,
    payment,
    dayjs(journalDate).add(1, 'day').startOf('day').valueOf(),
  );
  return Number.isFinite(next) && (payment.endDate === undefined || next <= payment.endDate)
    ? next
    : undefined;
}

export function buildJournalSchedule(
  payment: PlainPlannedPayment,
  journalDate: number,
  actions: { onPress: () => void; onRevert?: () => void },
): JournalScheduleModel {
  const strings = AppConfig.strings.journalDetails;
  const next = nextJournalOccurrence(payment, journalDate);
  return {
    name: payment.name,
    recurrence: formatRecurrence(payment),
    since: strings.since(formatDate(payment.startDate)),
    after:
      next === undefined
        ? strings.noNextOccurrence
        : `${formatDate(next)} · ${payment.isAutoPost ? strings.autoPost : strings.manualPost}`,
    ...actions,
  };
}

/** Built from the journal itself so legacy rows and events beyond the latest few stay reachable. */
export function buildReversalLinks(
  journal: Pick<PlainJournal, 'originalJournalId' | 'reversingJournalId'>,
  open: (journalId: JournalId) => void,
): JournalLink[] {
  const events = AppConfig.strings.journalDetails.events;
  return [
    { label: events['journal.reversal_created'], journalId: journal.originalJournalId },
    { label: events['journal.reversed'], journalId: journal.reversingJournalId },
  ].flatMap(({ label, journalId }) =>
    journalId ? [{ label, onPress: () => open(journalId) }] : [],
  );
}
