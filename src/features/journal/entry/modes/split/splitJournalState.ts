import type { AccountFields } from '@/src/types/plainDtos';
import {
  SplitRowState,
  SplitTotals,
  SplitValidationError,
  SplitCurrencyContext,
} from '@/src/services/journal/splitJournalHelpers';
import type { RowFx } from '@/src/features/journal/entry/hooks/workplaceRowFx';
import { AccountId } from '@/src/types/ids';
import { TabType } from '@/src/types/domainJournal';

/** Observable split-entry draft + derived display fields. */
export interface SplitJournalState {
  transactionType: TabType;
  sourceAccountId: AccountId;
  totalAmount: string;
  splits: SplitRowState[];
  splitFx: Record<string, RowFx>;
  /** Workplace rate for the paid-from row. A card shows when that account is not the workplace currency. */
  sourceFx: RowFx;
  /** Source row and every allocation row have a resolved workplace rate. */
  canEqualize: boolean;
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
  addSplitRow: () => void;
  removeSplitRow: (id: string) => void;
  updateSplitRow: (
    id: string,
    patch: Partial<Pick<SplitRowState, 'accountId' | 'amount' | 'exchangeRate'>>,
  ) => void;
  updateSplitAmounts: (updates: Record<string, string>) => void;
  updateAmount: (id: string, amount: string) => void;
  updateConvertedAmount: (id: string, amount: string) => void;
  resetRate: (id: string) => void;
  updateSourceConvertedAmount: (amount: string) => void;
  resetSourceRate: () => void;
}

/** Full split-mode controller contract used by SplitForm and shell wiring. */
export type SplitJournalController = SplitJournalState & SplitJournalActions;
