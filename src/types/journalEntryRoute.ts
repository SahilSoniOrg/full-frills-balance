import type { AccountId, JournalId } from '@/src/types/ids';

export type JournalEntryRouteEditorMode = 'simple' | 'advanced' | 'bulk' | 'split';
export type JournalEntrySimpleType = 'expense' | 'income' | 'transfer';

export type TransactionIntentSeedSourceContext = {
  launchSource?: string;
  smsId?: string;
  smsRecordId?: string;
  smsSender?: string;
  rawSmsBody?: string;
};

export type TransactionIntentSeed = {
  editorMode?: JournalEntryRouteEditorMode;
  type?: JournalEntrySimpleType;
  guidedAutopilot?: boolean;
  journalId?: JournalId;
  sourceAccountId?: AccountId;
  destinationAccountId?: AccountId;
  amount?: string;
  description?: string;
  notes?: string;
  date?: string;
  sourceContext?: TransactionIntentSeedSourceContext;
};

export type LegacyJournalEntryQueryParams = {
  mode?: JournalEntryRouteEditorMode;
  type?: JournalEntrySimpleType;
  guidedAutopilot?: string;
  journalId?: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  amount?: string;
  description?: string;
  notes?: string;
  smsId?: string;
  smsRecordId?: string;
  smsSender?: string;
  rawSmsBody?: string;
  initialDate?: string;
  source?: string;
};

function compactParams(params: LegacyJournalEntryQueryParams): LegacyJournalEntryQueryParams {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  ) as LegacyJournalEntryQueryParams;
}

export function toLegacyJournalEntryQueryParams(
  seed: TransactionIntentSeed,
): LegacyJournalEntryQueryParams {
  return compactParams({
    mode: seed.editorMode,
    type: seed.type,
    guidedAutopilot: seed.guidedAutopilot ? 'true' : undefined,
    journalId: seed.journalId,
    sourceAccountId: seed.sourceAccountId,
    destinationAccountId: seed.destinationAccountId,
    amount: seed.amount,
    description: seed.description,
    notes: seed.notes,
    initialDate: seed.date,
    source: seed.sourceContext?.launchSource,
    smsId: seed.sourceContext?.smsId,
    smsRecordId: seed.sourceContext?.smsRecordId,
    smsSender: seed.sourceContext?.smsSender,
    rawSmsBody: seed.sourceContext?.rawSmsBody,
  });
}
