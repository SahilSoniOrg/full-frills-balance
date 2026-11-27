import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import { JournalEntryLine } from '@/src/types/domainJournal';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import type { PostingPlan, TransactionResolverAccount } from '@/src/types/domainTransaction';
import { validatePostingPlan } from '@/src/services/transaction/transactionComposerDomain';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { MAX_BULK_JOURNAL_ROWS } from '@/src/constants/ledger-constants';
import type { CreateJournalData, JournalRepaymentAllocation } from '@/src/types/journalWrite';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { analytics } from '@/src/services/analytics';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { workplaceService } from '@/src/services/WorkplaceService';
import { currencyReadService } from '@/src/services/currency-read-service';
import {
  JournalBalanceError,
  resolveCurrencyPrecisions,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { logger } from '@/src/services/observability/logger';
import { assembleCreateJournalData, validateJournalEntryStructure } from '../journalSaveHelpers';
import {
  type PlannedJournalMode,
  type SubmitJournalResult,
  withPlannedStatus,
} from './journalDomainTypes';
import type Journal from '@/src/data/models/Journal';
import type { AuditEventMetadata } from '@/src/types/auditEvents';

export type JournalSaveHost = {
  clearSuggestionsCache: (workplaceId?: WorkplaceId) => void;
  createJournal: (
    data: CreateJournalData,
    workplaceId: WorkplaceId,
    smsRecord?: InboxRecordSnapshot | null,
  ) => Promise<Journal>;
  updateJournal: (
    journalId: JournalId,
    data: CreateJournalData,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ) => Promise<Journal>;
  saveJournalEntry: (params: {
    lines: JournalEntryLine[];
    description: string;
    notes?: string;
    journalDate: string | number;
    journalTime?: string;
    journalId?: JournalId;
    newJournalCurrencyCode?: string;
    smsId?: string;
    smsRecordId?: string;
    mode?: 'simple' | 'advanced' | 'import';
    launchSource?: string;
    planned?: PlannedJournalMode;
    repaymentAllocation?: JournalRepaymentAllocation;
    workplaceId: WorkplaceId;
  }) => Promise<SubmitJournalResult>;
};

export async function postPostingPlan(
  host: JournalSaveHost,
  params: {
    plan: PostingPlan;
    journalId?: JournalId;
    newJournalCurrencyCode?: string;
    smsId?: string;
    smsRecordId?: string;
    mode?: 'simple' | 'advanced' | 'import';
    launchSource?: string;
    planned?: PlannedJournalMode;
    repaymentAllocation?: JournalRepaymentAllocation;
    workplaceId: WorkplaceId;
  },
): Promise<SubmitJournalResult> {
  const accountIds = [...new Set(params.plan.lines.map(line => line.accountId))];
  const accounts = await accountQueryRepository.findAllByIds(params.workplaceId, accountIds);
  const resolverAccounts: TransactionResolverAccount[] = accounts.map(account => ({
    id: account.id,
    name: account.name,
    accountType: account.accountType,
    currencyCode: account.currencyCode,
  }));
  const existingJournal = params.journalId
    ? await journalQueryRepository.find(params.workplaceId, params.journalId)
    : null;
  if (params.journalId && !existingJournal) {
    return { success: false, error: 'Journal not found' };
  }
  const expectedCurrency =
    existingJournal?.currencyCode ??
    params.newJournalCurrencyCode ??
    (await workplaceService.getCurrency(params.workplaceId));
  if (params.plan.currencyCode.trim().toUpperCase() !== expectedCurrency.trim().toUpperCase()) {
    return {
      success: false,
      error: `Posting plan currency must match the journal currency (${expectedCurrency})`,
    };
  }

  const precisionByCurrency = await resolveCurrencyPrecisions(
    [expectedCurrency, ...resolverAccounts.map(account => account.currencyCode)],
    code => currencyReadService.getPrecision(code),
  );

  const validation = validatePostingPlan(params.plan, resolverAccounts, { precisionByCurrency });
  if (!validation.valid) {
    return { success: false, error: validation.issues[0]?.message || 'Invalid posting plan' };
  }

  return host.saveJournalEntry({
    lines: params.plan.lines,
    description: params.plan.description,
    notes: params.plan.notes,
    journalDate: params.plan.date,
    journalId: params.journalId,
    newJournalCurrencyCode: params.newJournalCurrencyCode,
    smsId: params.smsId,
    smsRecordId: params.smsRecordId,
    mode: params.mode,
    launchSource: params.launchSource,
    planned: params.planned,
    repaymentAllocation: params.repaymentAllocation,
    workplaceId: params.workplaceId,
  });
}

export async function saveJournalEntry(
  host: JournalSaveHost,
  params: {
    lines: JournalEntryLine[];
    description: string;
    notes?: string;
    journalDate: string | number;
    journalTime?: string;
    journalId?: JournalId;
    newJournalCurrencyCode?: string;
    smsId?: string;
    smsRecordId?: string;
    mode?: 'simple' | 'advanced' | 'import';
    /** Where the entry screen was opened from, e.g. `widget`; analytics only. */
    launchSource?: string;
    /** Ignored unless the date is still in the future. */
    planned?: PlannedJournalMode;
    repaymentAllocation?: JournalRepaymentAllocation;
    workplaceId: WorkplaceId;
  },
): Promise<SubmitJournalResult> {
  const {
    journalId,
    mode = 'advanced',
    workplaceId,
    newJournalCurrencyCode,
    launchSource,
    planned,
    repaymentAllocation,
    ...entryParams
  } = params;

  try {
    const existingJournal = journalId
      ? await journalQueryRepository.find(workplaceId, journalId)
      : null;
    if (journalId && !existingJournal) {
      return { success: false, error: 'Journal not found' };
    }

    const effectiveCurrencyCode =
      existingJournal?.currencyCode ??
      newJournalCurrencyCode ??
      (await workplaceService.getCurrency(workplaceId));
    const assembled = await assembleCreateJournalData({
      ...entryParams,
      journalId,
      workplaceId,
      currencyCode: effectiveCurrencyCode,
    });
    if (!assembled.success) {
      return assembled;
    }

    const { journalData } = assembled;
    const currencyCode = journalData.currencyCode;

    const plannedData = withPlannedStatus(journalData, planned);
    if (
      plannedData.status === JournalStatus.PLANNED &&
      repaymentAllocation &&
      (repaymentAllocation.allocationMode === 'pick' ||
        (repaymentAllocation.allocationMode == null && repaymentAllocation.allocations.length > 0))
    ) {
      return {
        success: false,
        error:
          'Select specific repayment items after posting this planned entry. Planned repayments use FIFO.',
      };
    }
    const writeData = {
      ...plannedData,
      ...(plannedData.status !== JournalStatus.PLANNED && repaymentAllocation !== undefined
        ? { repaymentAllocation }
        : {}),
    };

    if (journalId) {
      const updatedJournal = await host.updateJournal(journalId, writeData, workplaceId);
      analytics.trackFeatureUsage('journal', 'update', {
        mode,
        currency: currencyCode,
        count: journalData.transactions?.length || 0,
      });
      return { success: true, action: 'updated', journalId: updatedJournal.id };
    }

    const smsRecord = params.smsRecordId
      ? await transactionInboxRepository.find(workplaceId, params.smsRecordId)
      : null;
    const createdJournal = await host.createJournal(writeData, workplaceId, smsRecord);
    analytics.trackFeatureUsage('journal', 'create', {
      mode,
      currency: currencyCode,
      count: journalData.transactions.length || 0,
      source: launchSource ?? (params.smsRecordId ? 'sms' : 'manual'),
    });
    analytics.trackConversion('transaction_created');
    return { success: true, action: 'created', journalId: createdJournal.id };
  } catch (error) {
    logger.error('Failed to save journal entry:', error);
    if (error instanceof JournalBalanceError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save transaction',
    };
  }
}

export async function saveBulkJournalEntries(
  host: JournalSaveHost,
  entries: {
    lines: JournalEntryLine[];
    description: string;
    notes?: string;
    journalDate: number;
    planned?: PlannedJournalMode;
    workplaceId: WorkplaceId;
  }[],
): Promise<{
  success: boolean;
  error?: string;
  summaries: { description: string; amount: number; currency: string }[];
}> {
  if (entries.length === 0) {
    return { success: false, error: 'No entries to save', summaries: [] };
  }
  if (entries.length > MAX_BULK_JOURNAL_ROWS) {
    return {
      success: false,
      error: `You can post at most ${MAX_BULK_JOURNAL_ROWS} entries at once.`,
      summaries: [],
    };
  }

  const workplaceId = entries[0].workplaceId;

  for (const entry of entries) {
    const structureError = validateJournalEntryStructure({
      lines: entry.lines,
      description: entry.description,
    });
    if (structureError) {
      return { ...structureError, summaries: [] };
    }
  }

  const preparedItems: {
    data: CreateJournalData;
    description: string;
    amount: number;
    currency: string;
  }[] = [];

  let currencyCode: string;
  try {
    currencyCode = await workplaceService.getCurrency(workplaceId);

    for (const entry of entries) {
      const assembled = await assembleCreateJournalData({
        lines: entry.lines,
        description: entry.description,
        notes: entry.notes,
        journalDate: entry.journalDate,
        workplaceId,
        currencyCode,
      });
      if (!assembled.success) {
        return { ...assembled, summaries: [] };
      }

      const sourceLine =
        entry.lines.find(line => line.transactionType === TransactionType.CREDIT) ?? entry.lines[0];
      preparedItems.push({
        data: withPlannedStatus(assembled.journalData, entry.planned),
        description: entry.description,
        amount: parseFloat(sourceLine.amount),
        currency: sourceLine.accountCurrency || currencyCode,
      });
    }
  } catch (error) {
    logger.error('Failed to prepare bulk journals:', error);
    if (error instanceof JournalBalanceError) {
      return { success: false, error: error.message, summaries: [] };
    }
    return { success: false, error: 'Failed to prepare journal entries', summaries: [] };
  }

  try {
    await journalPersistenceService.putMany(
      preparedItems.map(item => item.data),
      workplaceId,
    );

    preparedItems.forEach(() => analytics.trackConversion('transaction_created'));

    analytics.trackFeatureUsage('journal', 'bulk_create', {
      count: preparedItems.length,
      currency: currencyCode,
    });

    host.clearSuggestionsCache(workplaceId);
    return {
      success: true,
      summaries: preparedItems.map(p => ({
        description: p.description,
        amount: p.amount,
        currency: p.currency,
      })),
    };
  } catch (error) {
    logger.error('Failed to batch save bulk journals:', error);
    if (error instanceof JournalBalanceError) {
      return { success: false, error: error.message, summaries: [] };
    }
    return { success: false, error: 'Failed to save journal entries atomically', summaries: [] };
  }
}
