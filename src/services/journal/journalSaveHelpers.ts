import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { CreateJournalData } from '@/src/data/repositories/journal/journalWriteModule';
import { database } from '@/src/data/database/Database';
import { checkJournal } from '@/src/utils/accounting/BalanceEffects';
import { validateDistinctAccounts } from '@/src/services/accounting/JournalValidation';
import { workplaceService } from '@/src/services/WorkplaceService';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { JournalEntryLine, WorkplaceId } from '@/src/types/domain';
import { sanitizeAmount } from '@/src/utils/validation';

export type JournalSaveLineInput = {
  lines: JournalEntryLine[];
  description: string;
  notes?: string;
  journalDate: string | number;
  journalTime?: string;
  smsId?: string;
  smsRecordId?: string;
  smsSender?: string;
  rawSmsBody?: string;
  workplaceId: WorkplaceId;
};

export type JournalSaveValidationError = { success: false; error: string };
export type JournalSaveAssembled = { success: true; journalData: CreateJournalData };

/**
 * Shared structural validation for single + bulk journal saves.
 * Does not check balance (callers may need currency/domain lines first).
 */
export function validateJournalEntryStructure(params: {
  lines: JournalEntryLine[];
  description: string;
}): JournalSaveValidationError | null {
  const finalDescription = params.description.trim();
  if (!finalDescription) {
    return { success: false, error: 'Description is required' };
  }

  if (params.lines.length < 2) {
    return { success: false, error: 'A journal entry must have at least 2 lines' };
  }

  if (params.lines.some(l => !l.accountId)) {
    return { success: false, error: 'All lines must have an account' };
  }

  const distinctValidation = validateDistinctAccounts(params.lines.map(l => l.accountId));
  if (!distinctValidation.isValid) {
    return { success: false, error: 'A journal entry must involve at least 2 distinct accounts' };
  }

  return null;
}

export function resolveJournalTimestamp(
  journalDate: string | number,
  journalTime?: string,
): { ok: true; timestamp: number } | { ok: false; error: string } {
  let combinedTimestamp: number;
  if (typeof journalDate === 'number') {
    combinedTimestamp = journalDate;
  } else {
    const time = journalTime || '00:00';
    const timeWithSeconds = time.split(':').length === 2 ? `${time}:00` : time;
    combinedTimestamp = new Date(`${journalDate}T${timeWithSeconds}`).getTime();
  }

  if (Number.isNaN(combinedTimestamp)) {
    return { ok: false, error: 'Invalid date or time' };
  }

  return { ok: true, timestamp: combinedTimestamp };
}

export function validateJournalEntryBalance(
  lines: JournalEntryLine[],
): JournalSaveValidationError | null {
  const domainLines = lines.map(line => ({
    amount: sanitizeAmount(line.amount) || 0,
    type: line.transactionType,
    exchangeRate: line.exchangeRate ? parseFloat(line.exchangeRate) : 1,
    accountCurrency: line.accountCurrency,
  }));

  const balanceValidation = checkJournal(domainLines);
  if (!balanceValidation.isValid) {
    return {
      success: false,
      error: `Journal is not balanced. Discrepancy: ${balanceValidation.imbalance}`,
    };
  }

  return null;
}

export function mapLinesToCreateTransactions(
  lines: JournalEntryLine[],
): CreateJournalData['transactions'] {
  return lines.map(l => ({
    accountId: l.accountId,
    amount: sanitizeAmount(l.amount) || 0,
    transactionType: l.transactionType,
    notes: l.notes && typeof l.notes === 'string' && l.notes.trim() ? l.notes.trim() : undefined,
    exchangeRate: l.exchangeRate ? parseFloat(l.exchangeRate) : undefined,
    currencyCode: l.accountCurrency,
  }));
}

async function resolveSmsMetadataJson(
  smsRecordId: string | undefined,
  workplaceId: WorkplaceId,
): Promise<string | undefined> {
  if (!smsRecordId) return undefined;
  try {
    const inboxRecord = await database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .find(smsRecordId);
    if (inboxRecord.workplaceId !== workplaceId) {
      return undefined;
    }
    return JSON.stringify({
      smsFingerprint: inboxRecord.inputFingerprint,
      parsedAmount: inboxRecord.parsedAmount ?? null,
      parsedCurrencyCode: inboxRecord.parsedCurrencyCode ?? null,
      parsedMerchant: inboxRecord.parsedMerchant ?? null,
      referenceNumber: inboxRecord.referenceNumber
        ? normalizeSmsReferenceNumber(inboxRecord.referenceNumber)
        : null,
      accountSource: inboxRecord.parsedAccountSource ?? null,
    });
  } catch {
    return undefined;
  }
}

/**
 * Validate structure + balance and assemble CreateJournalData for a single entry.
 * Used by saveJournalEntry and saveBulkJournalEntries.
 */
export async function assembleCreateJournalData(
  params: JournalSaveLineInput & { currencyCode?: string },
): Promise<JournalSaveValidationError | JournalSaveAssembled> {
  const structureError = validateJournalEntryStructure({
    lines: params.lines,
    description: params.description,
  });
  if (structureError) return structureError;

  const timestampResult = resolveJournalTimestamp(params.journalDate, params.journalTime);
  if (!timestampResult.ok) {
    return { success: false, error: timestampResult.error };
  }

  const balanceError = validateJournalEntryBalance(params.lines);
  if (balanceError) return balanceError;

  const currencyCode =
    params.currencyCode ?? (await workplaceService.getCurrency(params.workplaceId));

  const smsMetadataJson = await resolveSmsMetadataJson(params.smsRecordId, params.workplaceId);
  const metadata =
    params.smsId || params.smsSender || params.rawSmsBody
      ? {
          importSource: params.smsId ? 'sms' : 'manual',
          originalSmsId: params.smsId,
          originalSmsSender: params.smsSender,
          originalSmsBody: params.rawSmsBody,
          metadataJson: smsMetadataJson,
        }
      : undefined;

  const journalData: CreateJournalData = {
    journalDate: timestampResult.timestamp,
    description: params.description.trim(),
    notes: params.notes?.trim() || undefined,
    currencyCode,
    metadata,
    transactions: mapLinesToCreateTransactions(params.lines),
  };

  return { success: true, journalData };
}
