import type { AccountFields } from '@/src/types/plainDtos';
import {
  SplitRowState,
  SplitTotals,
  SplitValidationError,
  SplitCurrencyContext,
} from '@/src/services/journal/splitJournalHelpers';
import { AccountId } from '@/src/types/ids';
import { TabType } from '@/src/types/domainJournal';

/** Observable split-entry draft + derived display fields. */
export interface SplitJournalState {
  transactionType: TabType;
  sourceAccountId: AccountId;
  totalAmount: string;
  splits: SplitRowState[];
  totals: SplitTotals;
  currencyContext: SplitCurrencyContext;
  isValid: boolean;
  validationError: SplitValidationError | null;
  allAccounts: AccountFields[];
  sourceAccounts: AccountFields[];
  allocationAccounts: AccountFields[];
  sourceAccount: AccountFields | undefined;
  displayCurrency: string;
  precision: number;
  journalDate: string;
  isSubmitting: boolean;
  isValidTotal: boolean;
}

/** Imperative actions for the split journal form / mode controller. */
export interface SplitJournalActions {
  setTransactionType: (type: TabType) => void;
  setSourceAccountId: (id: AccountId) => void;
  setTotalAmount: (amount: string) => void;
  updateSourceExchangeRate: (exchangeRate: string) => void;
  addSplitRow: () => void;
  removeSplitRow: (id: string) => void;
  updateSplitRow: (
    id: string,
    patch: Partial<Pick<SplitRowState, 'accountId' | 'amount' | 'exchangeRate'>>,
  ) => void;
  updateSplitAmounts: (updates: Record<string, string>) => void;
}

/** Full split-mode controller contract used by SplitForm and shell wiring. */
export type SplitJournalController = SplitJournalState & SplitJournalActions;
