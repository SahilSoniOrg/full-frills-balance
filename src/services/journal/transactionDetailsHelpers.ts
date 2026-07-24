import { ColorKey } from '@/src/constants';
import { JournalDisplayType } from '@/src/types/domain';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';

export type JournalDetailsStatus = 'POSTED' | 'PLANNED' | 'DRAFT' | 'SKIPPED' | string;

export interface JournalDetailsInfo {
  id?: string;
  version?: number;
  description: string;
  notes?: string | null;
  date: number;
  status: JournalDetailsStatus;
  currency: string;
  displayType: string;
  totalAmount: number;
  plannedPaymentId?: string | null;
  journalDate: number;
}

export function resolveJournalDetailsInfo(input: {
  journal?: {
    id: string;
    description?: string;
    notes?: string | null;
    journalDate: number;
    status: JournalDetailsStatus;
    currencyCode: string;
    displayType: string;
    totalAmount?: number | null;
    plannedPaymentId?: string | null;
  } | null;
  journalVersion?: number;
  routePreview?: {
    title?: string;
    amount?: string;
    date?: string;
    currencyCode?: string;
    displayType?: string;
  };
  fallbackCurrency: string;
  fallbackNow: number;
}): JournalDetailsInfo | null {
  if (input.journal) {
    return {
      id: input.journal.id,
      version: input.journalVersion,
      description: input.journal.description || '',
      notes: input.journal.notes,
      date: input.journal.journalDate,
      status: input.journal.status,
      currency: input.journal.currencyCode,
      displayType: input.journal.displayType,
      totalAmount: input.journal.totalAmount || 0,
      plannedPaymentId: input.journal.plannedPaymentId,
      journalDate: input.journal.journalDate,
    };
  }

  const { routePreview } = input;
  if (routePreview?.title || routePreview?.amount) {
    return {
      description: routePreview.title || 'Loading...',
      date: routePreview.date ? Number(routePreview.date) : input.fallbackNow,
      status: 'DRAFT',
      currency: routePreview.currencyCode || input.fallbackCurrency,
      displayType: routePreview.displayType || 'EXPENSE',
      totalAmount: routePreview.amount ? Number(routePreview.amount) : 0,
      plannedPaymentId: null,
      journalDate: routePreview.date ? Number(routePreview.date) : input.fallbackNow,
    };
  }

  return null;
}

export function resolveTransactionAmountPresentation(input: {
  journalInfo: JournalDetailsInfo | null;
  paramTypeColor?: string;
  journalLoaded: boolean;
}): { amountText: string; amountColor: ColorKey; isExpense: boolean } {
  const journalDisplayType = input.journalInfo?.displayType as JournalDisplayType | undefined;
  const isIncome = journalDisplayType === JournalDisplayType.INCOME;
  const isExpense = journalDisplayType === JournalDisplayType.EXPENSE;

  let amountColor: ColorKey;
  if (input.paramTypeColor && !input.journalLoaded) {
    amountColor = (input.paramTypeColor as ColorKey) || 'primary';
  } else {
    amountColor = isIncome ? 'income' : isExpense ? 'error' : 'primary';
  }

  const amountPrefix = isIncome ? '+' : isExpense ? '-' : '';
  const amountText = input.journalInfo
    ? `${amountPrefix}${CurrencyFormatter.format(input.journalInfo.totalAmount, input.journalInfo.currency)}`
    : '';

  return { amountText, amountColor, isExpense };
}

export type JournalStatusChipVariant = 'income' | 'expense' | 'primary' | 'default';

export function resolveJournalStatusChipVariant(
  journalInfo: Pick<JournalDetailsInfo, 'status'> | null,
): JournalStatusChipVariant {
  if (!journalInfo) return 'default';
  if (journalInfo.status === 'POSTED') return 'income';
  if (journalInfo.status === 'PLANNED') return 'primary';
  if (journalInfo.status === 'DRAFT') return 'default';
  return 'default';
}

export interface TransactionSplitLinePresentation {
  transactionTypeLabel: string;
  amountText: string;
  amountColor: ColorKey;
  iconColor: ColorKey;
  iconBackground: ColorKey;
}

export function mapDisplayTransactionSplitPresentation(item: {
  transactionType: string;
  amount: number;
  currencyCode: string;
}): TransactionSplitLinePresentation {
  const isDebit = item.transactionType === 'DEBIT';
  const isPositiveSentiment = isDebit;
  const color: ColorKey = isPositiveSentiment ? 'income' : 'error';
  const flowLabel = isDebit ? 'To' : 'From';

  return {
    transactionTypeLabel: `${flowLabel} • ${item.transactionType}`,
    amountText: `${isDebit ? '+' : '-'}${CurrencyFormatter.format(item.amount, item.currencyCode)}`,
    amountColor: color,
    iconColor: color,
    iconBackground: color,
  };
}

export interface SmsJournalInfoDisplay {
  sender?: string;
  rawBody?: string;
  amountText?: string;
  referenceNumber?: string;
  accountSource?: string;
  parseReason?: string;
  smsDate?: string;
  inboxRecordId?: string;
}

export function mapSmsJournalMetadataDisplay(input: {
  originalSmsSender?: string | null;
  originalSmsBody?: string | null;
  metadataJson?: string | null;
  inboxRecord?: {
    referenceNumber?: string;
    parseReason?: string;
    parsedAccountSource?: string;
    inputDate?: number;
    id?: string;
  } | null;
}): SmsJournalInfoDisplay {
  const parsedMetadata = input.metadataJson ? JSON.parse(input.metadataJson) : {};
  return {
    sender: input.originalSmsSender || undefined,
    rawBody: input.originalSmsBody || undefined,
    amountText:
      typeof parsedMetadata.parsedAmount === 'number'
        ? CurrencyFormatter.format(
            parsedMetadata.parsedAmount,
            parsedMetadata.parsedCurrencyCode || undefined,
          )
        : undefined,
    referenceNumber: parsedMetadata.referenceNumber || input.inboxRecord?.referenceNumber,
    accountSource: parsedMetadata.accountSource || input.inboxRecord?.parsedAccountSource,
    parseReason: input.inboxRecord?.parseReason,
    smsDate: input.inboxRecord?.inputDate
      ? formatDate(input.inboxRecord.inputDate, { includeTime: true })
      : undefined,
    inboxRecordId: input.inboxRecord?.id,
  };
}

export function resolveRevertPlannedActionLabels(status: JournalDetailsStatus): {
  actionLabel: string;
  statusLabel: string;
  revertButtonLabel: string;
} {
  const isSkipped = status === 'SKIPPED';
  return {
    actionLabel: isSkipped ? 'Unskip' : 'Unpost',
    statusLabel: isSkipped ? 'skipped' : 'posted',
    revertButtonLabel: isSkipped ? 'Unskip (Revert to Scheduled)' : 'Unpost (Revert to Scheduled)',
  };
}
