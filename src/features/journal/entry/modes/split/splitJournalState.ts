import type { AccountFields as Account } from '@/src/types/domain';
import {
  SplitRowState,
  SplitTotals,
  SplitValidationError,
} from '@/src/services/journal/splitJournalHelpers';
import { AccountId } from '@/src/types/domain';

/** Observable split-entry draft + derived display fields. */
export interface SplitJournalState {
  sourceAccountId: AccountId;
  totalAmount: string;
  splits: SplitRowState[];
  totals: SplitTotals;
  isValid: boolean;
  validationError: SplitValidationError | null;
  transactionAccounts: Account[];
  expenseAccounts: Account[];
  sourceAccount: Account | undefined;
  displayCurrency: string;
  isSubmitting: boolean;
  isValidTotal: boolean;
}

/** Imperative actions for the split journal form / mode controller. */
export interface SplitJournalActions {
  setSourceAccountId: (id: AccountId) => void;
  setTotalAmount: (amount: string) => void;
  addSplitRow: () => void;
  removeSplitRow: (id: string) => void;
  updateSplitRow: (id: string, patch: Partial<Pick<SplitRowState, 'accountId' | 'amount'>>) => void;
  openSourceAccountPicker: () => void;
  openSplitAccountPicker: (splitId: string) => void;
  handleSave: () => void | Promise<void>;
}

/** Full split-mode controller contract used by SplitForm and shell wiring. */
export type SplitJournalController = SplitJournalState & SplitJournalActions;
