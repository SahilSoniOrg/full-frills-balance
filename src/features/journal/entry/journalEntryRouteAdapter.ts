import { parseJournalEntryRouteParams } from './journalEntryPresentation';
import type { JournalEntryRouteParams } from './journalEntryPresentation';
import type {
  TransactionIntentSeed,
  TransactionIntentSeedSourceContext,
} from '@/src/types/journalEntryRoute';

export type {
  LegacyJournalEntryQueryParams,
  JournalEntryRouteEditorMode,
  JournalEntrySimpleType,
  TransactionIntentSeed,
  TransactionIntentSeedSourceContext,
} from '@/src/types/journalEntryRoute';
export { toLegacyJournalEntryQueryParams } from '@/src/types/journalEntryRoute';

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
    guidedAutopilot: route.guidedAutopilot,
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
