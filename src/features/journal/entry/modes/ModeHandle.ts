import { AccountId, TabType } from '@/src/types/domain';

/**
 * Contract the active journal entry mode panel registers with the shell.
 * Shell footer / account apply read the current handle; panels clear on unmount.
 */
export type ModeHandle = {
  submitLabel: string;
  isSubmitDisabled: boolean;
  submit: () => void;
  isSubmitting?: boolean;
  /** Mode-local account apply (e.g. split draft). Absent → shell updates editor lines. */
  applyAccount?: (lineId: string, accountId: AccountId) => void;
  /** Guided amount strip rendered in the submit footer top slot. */
  footerAmount?: {
    amount: string;
    setAmount: (amount: string) => void;
    accentType: TabType;
    displayCurrency: string;
    onFocus: () => void;
    onBlur: () => void;
  };
};
