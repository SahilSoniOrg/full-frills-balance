import { parseJournalEntryRouteParams } from './journalEntryPresentation';
import type {
  JournalEntryRouteEditorMode,
  JournalEntryRouteParams,
  JournalEntrySimpleType,
} from './journalEntryPresentation';
import type { AccountId, JournalId } from '@/src/types/ids';

export type TransactionIntentSeedSourceContext = {
  launchSource?: string;
  smsId?: string;
  smsRecordId?: string;
  smsSender?: string;
  rawSmsBody?: string;
};

/**
 * Transitional, route-safe input for a transaction composer launch.
 *
 * `editorMode` and `journalId` exist only while the journal-entry route is
 * being migrated. New callers should provide one seed instead of assembling
 * query parameters or using the legacy aliases.
 */
export type TransactionIntentSeed = {
  editorMode?: JournalEntryRouteEditorMode;
  type?: JournalEntrySimpleType;
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

function compactContext(
  context: TransactionIntentSeedSourceContext,
): TransactionIntentSeedSourceContext {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined && value !== ''),
  ) as TransactionIntentSeedSourceContext;
}

function compactSeed(seed: TransactionIntentSeed): TransactionIntentSeed {
  return Object.fromEntries(
    Object.entries(seed).filter(([, value]) => value !== undefined && value !== ''),
  ) as TransactionIntentSeed;
}

/** Converts the canonical seed into the existing journal-entry query shape. */
export function toLegacyJournalEntryQueryParams(
  seed: TransactionIntentSeed,
): LegacyJournalEntryQueryParams {
  return compactParams({
    mode: seed.editorMode,
    type: seed.type,
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

/** Converts the normalized legacy parser output into the canonical seed. */
export function toTransactionIntentSeed(route: JournalEntryRouteParams): TransactionIntentSeed {
  const sourceContext = compactContext({
    launchSource: route.launchSource,
    smsId: route.smsId,
    smsRecordId: route.smsRecordId,
    smsSender: route.smsSender,
    rawSmsBody: route.rawSmsBody,
  });

  const hasSourceContext = Object.keys(sourceContext).length > 0;

  return compactSeed({
    editorMode: route.mode,
    type: route.type,
    journalId: route.journalId,
    sourceAccountId: route.sourceAccountId,
    destinationAccountId: route.destinationAccountId,
    amount: route.amount,
    description: route.description,
    notes: route.notes,
    date: route.initialDate,
    ...(hasSourceContext
      ? {
          sourceContext: {
            ...sourceContext,
          },
        }
      : {}),
  });
}

/**
 * Parses all currently supported route aliases before creating a seed.
 * This is the compatibility boundary for deep links and old launchers.
 */
export function parseTransactionIntentSeed(
  params: Record<string, string | string[] | undefined>,
): TransactionIntentSeed {
  return toTransactionIntentSeed(parseJournalEntryRouteParams(params));
}
