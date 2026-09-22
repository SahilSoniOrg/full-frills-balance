import { AppConfig, Size, Typography } from '@/src/constants';
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
} from '@/src/types/journalEntryRoute';
export type {
  JournalEntryRouteEditorMode,
  JournalEntrySimpleType,
} from '@/src/types/journalEntryRoute';

/** Internal composer views. Legacy route names are translated at the adapter boundary below. */
export type JournalEntryScreenMode = 'basic' | 'allocation' | 'expert' | 'batch';

export type JournalEntryRouteParams = {
  mode?: JournalEntryRouteEditorMode;
  type?: JournalEntrySimpleType;
  guidedAutopilot?: boolean;
  journalId?: JournalId;
  sourceAccountId?: AccountId;
  destinationAccountId?: AccountId;
  amount?: string;
  description?: string;
  notes?: string;
  smsId?: string;
  smsRecordId?: string;
  smsSender?: string;
  rawSmsBody?: string;
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
    sourceAccountId,
    destinationAccountId,
    amount: firstString(params.amount),
    description: firstString(params.description),
    notes: firstString(params.notes),
    smsId: firstString(params.smsId),
    smsRecordId: firstString(params.smsRecordId),
    smsSender: firstString(params.smsSender),
    rawSmsBody: firstString(params.rawSmsBody),
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

export function resolveJournalEntryHeaderTitle(input: { isEdit: boolean }): string {
  if (input.isEdit) return AppConfig.strings.transactionFlow.headers.edit;
  return AppConfig.strings.transactionFlow.headers.new;
}

export function resolveSimpleTypeAccentColor(
  type: TabType,
  theme: { expense: string; income: string; primary: string },
): string {
  if (type === 'expense') return theme.expense;
  if (type === 'income') return theme.income;
  return theme.primary;
}

export function resolveExchangeRatePresentation(input: {
  sourceCurrency?: string;
  destinationCurrency?: string;
  exchangeRate: number;
}): {
  sourceCurrency?: string;
  destinationCurrency?: string;
  exchangeRate: number;
} {
  if (input.exchangeRate >= 1 || input.exchangeRate <= 0) return input;

  return {
    sourceCurrency: input.destinationCurrency,
    destinationCurrency: input.sourceCurrency,
    exchangeRate: 1 / input.exchangeRate,
  };
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

export function isJournalEntrySubmitDisabled(input: {
  activeMode: JournalEntryScreenMode;
  isPlanValid: boolean;
  isSplitValid?: boolean;
}): boolean {
  if (input.activeMode === 'allocation') {
    return !input.isSplitValid || !input.isPlanValid;
  }
  if (input.activeMode === 'basic') {
    return !input.isPlanValid;
  }
  return !input.isPlanValid;
}

export type JournalEntryValidationIssue = TransactionDomainIssue | PostingPlanValidationIssue;

type SplitValidation = { valid: true } | { valid: false; error: SplitValidationError };

function resolveValidationIssueHint(issue: JournalEntryValidationIssue): string | null {
  const strings = AppConfig.strings.transactionFlow.validation;

  switch (issue.code) {
    case 'missing_amount':
      return strings.missingAmount;
    case 'invalid_amount':
      return strings.invalidAmount;
    case 'missing_source_account':
      return strings.missingSourceAccount;
    case 'missing_destination_account':
      return strings.missingDestinationAccount;
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
    const hint = resolveValidationIssueHint(issue);
    if (hint) return hint;
  }

  return null;
}

export function resolveSimpleAmountTypography(amountLength: number): {
  amountFontSize: number;
  currencyFontSize: number;
  currencyLineHeight: number;
  inputHeight: number;
} {
  if (amountLength > 11) {
    return {
      amountFontSize: Typography.sizes.xl,
      currencyFontSize: Typography.sizes.sm,
      currencyLineHeight: Math.round(Typography.sizes.sm * Typography.lineHeights.tight),
      inputHeight: Size.buttonLg,
    };
  }
  if (amountLength > 8) {
    return {
      amountFontSize: Typography.sizes.xxl,
      currencyFontSize: Typography.sizes.base,
      currencyLineHeight: Math.round(Typography.sizes.base * Typography.lineHeights.tight),
      inputHeight: Size.buttonLg,
    };
  }
  if (amountLength > 6) {
    return {
      amountFontSize: Typography.sizes.xxxl,
      currencyFontSize: Typography.sizes.lg,
      currencyLineHeight: Math.round(Typography.sizes.lg * Typography.lineHeights.tight),
      inputHeight: Size.xxl,
    };
  }
  return {
    amountFontSize: Typography.sizes.jumbo,
    currencyFontSize: Typography.sizes.xxl,
    currencyLineHeight: Math.round(Typography.sizes.xxl * Typography.lineHeights.tight),
    inputHeight: Size.xxl,
  };
}
