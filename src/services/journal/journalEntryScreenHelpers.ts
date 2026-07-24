import { AppConfig } from '@/src/constants';
import { AccountId, JournalId } from '@/src/types/domain';

export type JournalEntryScreenMode = 'guided' | 'advanced' | 'bulk';
export type JournalEntryRouteEditorMode = 'simple' | 'advanced' | 'bulk';
export type JournalEntrySimpleType = 'expense' | 'income' | 'transfer';

export type JournalEntryRouteParams = {
  mode?: JournalEntryRouteEditorMode;
  type?: JournalEntrySimpleType;
  journalId?: JournalId;
  sourceAccountId?: AccountId;
  destinationAccountId?: AccountId;
  amount?: string;
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
    modeRaw === 'simple' || modeRaw === 'advanced' || modeRaw === 'bulk' ? modeRaw : undefined;

  const typeRaw = firstString(params.type);
  const type =
    typeRaw === 'expense' || typeRaw === 'income' || typeRaw === 'transfer' ? typeRaw : undefined;

  const sourceAccountId =
    (firstString(params.sourceAccountId) as AccountId | undefined) ||
    (firstString(params.sourceId) as AccountId | undefined);

  const destinationAccountId =
    (firstString(params.destinationAccountId) as AccountId | undefined) ||
    (firstString(params.destinationId) as AccountId | undefined);

  return {
    mode,
    type,
    journalId: firstString(params.journalId) as JournalId | undefined,
    sourceAccountId,
    destinationAccountId,
    amount: firstString(params.amount),
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
  if (routeMode === 'simple') return 'guided';
  if (routeMode === 'advanced') return 'advanced';
  if (routeMode === 'bulk') return 'bulk';
  return 'guided';
}

export function resolveJournalEntryHeaderTitle(input: {
  activeMode: JournalEntryScreenMode;
  isEdit: boolean;
  isGuidedMode: boolean;
}): string {
  if (input.activeMode === 'bulk') return 'Bulk Entry';
  if (input.isEdit) return AppConfig.strings.transactionFlow.headers.edit;
  return input.isGuidedMode
    ? AppConfig.strings.transactionFlow.headers.new
    : AppConfig.strings.transactionFlow.headers.default;
}

export function isAdvancedJournalFormValid(input: {
  isBalanced: boolean;
  description: string;
  lines: { accountId?: string; amount: string }[];
  isSubmitting: boolean;
}): boolean {
  const hasDescription = input.description.trim().length > 0;
  const hasIncompleteLines = input.lines.some(line => !line.accountId || !line.amount.trim());
  return input.isBalanced && hasDescription && !hasIncompleteLines && !input.isSubmitting;
}

export function resolveJournalEntrySubmitLabel(input: {
  activeMode: JournalEntryScreenMode;
  bulkSubmitting: boolean;
  bulkRowCount: number;
  isGuidedMode: boolean;
  isAmountFocused: boolean;
  isSimpleValid: boolean;
  simpleSubmitting: boolean;
  simpleType: string;
  isEdit: boolean;
  isSubmitting: boolean;
}): string {
  if (input.activeMode === 'bulk') {
    return input.bulkSubmitting ? 'Saving All...' : `Save ${input.bulkRowCount} Transactions`;
  }
  if (input.isGuidedMode) {
    if (input.isAmountFocused && !input.isSimpleValid) {
      return AppConfig.strings.transactionFlow.continue;
    }
    return input.simpleSubmitting
      ? AppConfig.strings.transactionFlow.saving
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
  bulkSubmitting: boolean;
  bulkValid: boolean;
  isGuidedMode: boolean;
  isAmountFocused: boolean;
  isSimpleValid: boolean;
  isAdvancedValid: boolean;
}): boolean {
  if (input.activeMode === 'bulk') {
    return input.bulkSubmitting || !input.bulkValid;
  }
  return input.isGuidedMode
    ? input.isAmountFocused
      ? false
      : !input.isSimpleValid
    : !input.isAdvancedValid;
}

export function createSmsJournalAfterSaveHandler(input: {
  smsId?: string;
  smsRecordId?: string;
  finalizeManualImport: (smsRecordId: string, journalId: JournalId) => Promise<void>;
  markSmsAsProcessed: (smsId: string) => Promise<void>;
}): ((result: { journalId?: JournalId; success?: boolean }) => Promise<void>) | undefined {
  if (input.smsRecordId) {
    return async result => {
      if (result.journalId) {
        await input.finalizeManualImport(input.smsRecordId!, result.journalId);
      }
      if (input.smsId) {
        await input.markSmsAsProcessed(input.smsId);
      }
    };
  }
  if (input.smsId) {
    return async () => input.markSmsAsProcessed(input.smsId!);
  }
  return undefined;
}
