import { AppConfig } from '@/src/constants';
import { AccountId, JournalId } from '@/src/types/ids';
import { TabType } from '@/src/types/domainJournal';
import type {
  PostingPlanValidationIssue,
  TransactionDomainIssue,
} from '@/src/types/domainTransaction';
import type { SplitValidationError } from '@/src/services/journal/splitJournalHelpers';
import type {
  JournalEntryRouteEditorMode,
  JournalEntrySimpleType,
  TransactionIntentSeed,
  TransactionIntentSeedSourceContext,
} from '@/src/types/journalEntryRoute';
export type {
  JournalEntryRouteEditorMode,
  JournalEntrySimpleType,
  TransactionIntentSeed,
  TransactionIntentSeedSourceContext,
} from '@/src/types/journalEntryRoute';

export type JournalEntryScreenMode = 'basic' | 'allocation' | 'expert' | 'batch';

export type JournalEntryRouteParams = {
  mode?: JournalEntryRouteEditorMode;
  type?: JournalEntrySimpleType;
  guidedAutopilot?: boolean;
  journalId?: JournalId;
  copyFromJournalId?: JournalId;
  sourceAccountId?: AccountId;
  destinationAccountId?: AccountId;
  amount?: string;
  currencyCode?: string;
  description?: string;
  notes?: string;
  smsId?: string;
  smsRecordId?: string;
  initialDate?: string;
  launchSource?: string;
};

type ExpoSearchParams = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export function parseJournalEntryRouteParams(params: ExpoSearchParams): JournalEntryRouteParams {
  const modeRaw = firstString(params.mode);
  const mode =
    modeRaw === 'simple' || modeRaw === 'advanced' || modeRaw === 'bulk' || modeRaw === 'split'
      ? modeRaw
      : undefined;

  const typeRaw = firstString(params.type);
  const type =
    typeRaw === 'expense' || typeRaw === 'income' || typeRaw === 'transfer' ? typeRaw : undefined;

  const guidedAutopilotRaw = firstString(params.guidedAutopilot);
  const guidedAutopilot =
    guidedAutopilotRaw === 'true' || guidedAutopilotRaw === '1' ? true : undefined;
  const currencyCode = firstString(params.currencyCode)?.trim().toUpperCase();

  const sourceAccountId =
    (firstString(params.sourceAccountId) as AccountId | undefined) ||
    (firstString(params.sourceId) as AccountId | undefined);

  const destinationAccountId =
    (firstString(params.destinationAccountId) as AccountId | undefined) ||
    (firstString(params.destinationId) as AccountId | undefined);

  return {
    mode,
    type,
    ...(guidedAutopilot ? { guidedAutopilot: true } : {}),
    journalId: firstString(params.journalId) as JournalId | undefined,
    ...(firstString(params.copyJournalId)
      ? { copyFromJournalId: firstString(params.copyJournalId) as JournalId }
      : {}),
    sourceAccountId,
    destinationAccountId,
    amount: firstString(params.amount),
    ...(currencyCode && /^[A-Z]{3}$/.test(currencyCode) ? { currencyCode } : {}),
    description: firstString(params.description),
    notes: firstString(params.notes),
    smsId: firstString(params.smsId),
    smsRecordId: firstString(params.smsRecordId),
    initialDate: firstString(params.initialDate),
    launchSource: firstString(params.source),
  };
}

export function resolveJournalEntryScreenMode(
  routeMode?: JournalEntryRouteEditorMode,
): JournalEntryScreenMode {
  if (routeMode === 'simple') return 'basic';
  if (routeMode === 'advanced') return 'expert';
  if (routeMode === 'split') return 'allocation';
  if (routeMode === 'bulk') return 'batch';
  return 'basic';
}

export function resolveJournalEntryHeaderTitle(input: {
  isEdit: boolean;
  isCopy?: boolean;
}): string {
  if (input.isEdit) return AppConfig.strings.transactionFlow.headers.edit;
  if (input.isCopy) return AppConfig.strings.transactionFlow.headers.copy;
  return AppConfig.strings.transactionFlow.headers.new;
}

export function resolveSimpleTypeAccentColor(
  type: TabType,
  theme: { expense: string; income: string; transfer: string },
): string {
  if (type === 'expense') return theme.expense;
  if (type === 'income') return theme.income;
  return theme.transfer;
}

export function resolveJournalEntrySubmitLabel(input: {
  activeMode: JournalEntryScreenMode;
  simpleType: string;
  isEdit: boolean;
  isSubmitting: boolean;
}): string {
  if (input.activeMode === 'allocation') {
    return input.isSubmitting
      ? AppConfig.strings.transactionFlow.saving
      : AppConfig.strings.transactionFlow.splitEntry.save;
  }
  if (input.activeMode === 'basic') {
    return input.isSubmitting
      ? AppConfig.strings.transactionFlow.saving
      : input.isEdit
        ? AppConfig.strings.common.saveChanges
        : AppConfig.strings.transactionFlow.save(input.simpleType);
  }

  if (input.isSubmitting) {
    return input.isEdit
      ? AppConfig.strings.advancedEntry.updating
      : AppConfig.strings.advancedEntry.creating;
  }

  return input.isEdit
    ? AppConfig.strings.advancedEntry.updateJournal
    : AppConfig.strings.advancedEntry.createJournal;
}

export type JournalEntryValidationIssue = TransactionDomainIssue | PostingPlanValidationIssue;

type SplitValidation = { valid: true } | { valid: false; error: SplitValidationError };

export function isJournalEntrySubmitDisabled(input: {
  activeMode: JournalEntryScreenMode;
  validationIssues: readonly JournalEntryValidationIssue[];
  splitValidation?: SplitValidation;
}): boolean {
  return (
    input.validationIssues.length > 0 ||
    (input.activeMode === 'allocation' && input.splitValidation?.valid === false)
  );
}

function resolveValidationIssueHint(
  issue: JournalEntryValidationIssue,
  simpleType?: TabType,
): string | null {
  const strings = AppConfig.strings.transactionFlow.validation;

  switch (issue.code) {
    case 'missing_amount':
      return strings.missingAmount;
    case 'invalid_amount':
      return strings.invalidAmount;
    case 'missing_source_account':
      return simpleType
        ? strings.missingSourceAccountByType[simpleType]
        : strings.missingSourceAccount;
    case 'missing_destination_account':
      return simpleType
        ? strings.missingDestinationAccountByType[simpleType]
        : strings.missingDestinationAccount;
    case 'missing_allocation_account':
      return strings.missingAllocationAccount;
    case 'invalid_allocation_amount':
      return strings.invalidAllocationAmount;
    case 'allocation_sum_mismatch':
      return strings.allocationSumMismatch;
    case 'missing_description':
      return strings.missingDescription;
    case 'missing_date':
    case 'invalid_date':
      return strings.invalidDate;
    case 'missing_currency':
      return strings.missingCurrency;
    case 'too_few_lines':
      return strings.tooFewLines;
    case 'missing_account':
      return strings.missingAccount;
    case 'unknown_account':
      return strings.unknownAccount;
    case 'duplicate_line_id':
      return strings.duplicateLine;
    case 'missing_debit':
      return strings.missingDebit;
    case 'missing_credit':
      return strings.missingCredit;
    case 'missing_exchange_rate':
      return strings.missingExchangeRate;
    case 'invalid_exchange_rate':
      return strings.invalidExchangeRate;
    case 'account_metadata_mismatch':
      return strings.accountMetadataMismatch;
    case 'unbalanced':
      return strings.unbalanced;
    default:
      return null;
  }
}

function resolveSplitValidationHint(error: SplitValidationError): string {
  return AppConfig.strings.transactionFlow.splitEntry.validation[error];
}

/** Resolves the first actionable explanation for a disabled submit action. */
export function resolveJournalEntryValidationHint(input: {
  activeMode: JournalEntryScreenMode;
  simpleType?: TabType;
  validationIssues: readonly JournalEntryValidationIssue[];
  splitValidation?: SplitValidation;
}): string | null {
  if (input.activeMode === 'batch') return null;

  if (input.activeMode === 'allocation') {
    if (input.splitValidation?.valid === false) {
      return resolveSplitValidationHint(input.splitValidation.error);
    }
  }

  for (const issue of input.validationIssues) {
    const hint = resolveValidationIssueHint(
      issue,
      input.activeMode === 'basic' ? input.simpleType : undefined,
    );
    if (hint) return hint;
  }

  return null;
}

export type AllocationStatusTone = 'neutral' | 'even' | 'over';

/** Shared remaining copy for split and advanced. `emptyLabel` is null when the status should hide. */
export function resolveAllocationStatus(input: {
  hasAmount: boolean;
  balanced: boolean;
  remaining: number;
  formattedAmount: string;
  emptyLabel: string | null;
}): { label: string | null; tone: AllocationStatusTone } {
  const strings = AppConfig.strings.transactionFlow.splitEntry;
  if (!input.hasAmount) return { label: input.emptyLabel, tone: 'neutral' };
  if (input.balanced) return { label: strings.remainingZero, tone: 'even' };
  if (input.remaining > 0) {
    return { label: strings.remainingPositive(input.formattedAmount), tone: 'neutral' };
  }
  return { label: strings.remainingNegative(input.formattedAmount), tone: 'over' };
}

export function allocationStatusColor(
  tone: AllocationStatusTone,
  theme: { error: string; primary: string; textSecondary: string },
): string {
  if (tone === 'over') return theme.error;
  if (tone === 'even') return theme.primary;
  return theme.textSecondary;
}

function pickDefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ''),
  ) as Partial<T>;
}

/** Converts the normalized legacy parser output into the canonical seed. */
export function toTransactionIntentSeed(route: JournalEntryRouteParams): TransactionIntentSeed {
  const sourceContext = pickDefined({
    launchSource: route.launchSource,
    smsId: route.smsId,
    smsRecordId: route.smsRecordId,
  }) as TransactionIntentSeedSourceContext;

  const hasSourceContext = Object.keys(sourceContext).length > 0;

  return pickDefined({
    editorMode: route.mode,
    type: route.type,
    guidedAutopilot: route.guidedAutopilot,
    journalId: route.journalId,
    copyFromJournalId: route.copyFromJournalId,
    sourceAccountId: route.sourceAccountId,
    destinationAccountId: route.destinationAccountId,
    amount: route.amount,
    currencyCode: route.currencyCode,
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
  }) as TransactionIntentSeed;
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
