import { AccountId } from '@/src/types/domain';

/** Submit chrome the shell footer renders for the active mode. */
export type ModeSubmitState = {
  submitLabel: string;
  isSubmitDisabled: boolean;
  isSubmitting: boolean;
};

/**
 * Contract the active journal entry mode panel registers with the shell.
 * Submit chrome drives the footer; callbacks are imperative handoffs invoked
 * after the user acts (footer press, account picked). Panels clear on unmount.
 */
export type ModeHandle = {
  submitLabel: string;
  isSubmitDisabled: boolean;
  submit: () => void;
  isSubmitting?: boolean;
  applyAccountToLine?: (lineId: string, accountId: AccountId) => void;
  resolveSelectedAccountId?: (lineId: string) => AccountId | undefined;
};
