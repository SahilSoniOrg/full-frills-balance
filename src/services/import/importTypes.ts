import type {
  AccountSubtype,
  AccountType,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';

export interface ImportAccountInput {
  id: string;
  name: string;
  currencyCode: string;
  accountType?: AccountType | string;
  accountSubtype?: AccountSubtype | string;
  description?: string;
  icon?: string;
  color?: string;
  orderNum?: number;
  reconciledAt?: number;
  archivedAt?: number;
}

export interface ImportCategoryInput {
  id: string;
  name: string;
  parentCategoryId?: string;
  orderNum?: number;
  archivedAt?: number;
  defaultType?: AccountType.EXPENSE | AccountType.INCOME;
  description?: string;
  icon?: string;
  color?: string;
}

export interface ImportTransactionInput {
  id?: string;
  journalId?: string;
  date?: number;
  amount: number;
  targetAmount?: number;
  currencyCode: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  sourceAccountId: string;
  targetAccountId?: string;
  categoryId?: string;
  description?: string;
  notes?: string;
  /**
   * Source-to-destination quote multiplier used to derive the imported destination amount.
   * The canonical journal line stores its inverse: journal currency per native line currency.
   */
  exchangeRate?: number;
  isOpeningBalance?: boolean;
  isBalanceCorrection?: boolean;
}

export interface ImportPlannedPaymentInput {
  id?: string;
  name: string;
  description?: string;
  amount: number;
  currencyCode: string;
  fromAccountId: string;
  toAccountId?: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  intervalN?: number;
  intervalType?: PlannedPaymentInterval | string;
  startDate: number;
  endDate?: number;
  nextOccurrence?: number;
  status?: PlannedPaymentStatus | string;
  isAutoPost?: boolean;
  recurrenceDay?: number;
  recurrenceMonth?: number;
}

export interface ImportBudgetInput {
  id?: string;
  name: string;
  amount: number;
  currencyCode: string;
  startMonth: string;
  active?: boolean;
  intervalType?: string;
  intervalN?: number;
  startDate?: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  categoryIds?: string[];
  assetAccountIds?: string[];
}

export interface ImportIssue {
  severity: 'warning' | 'error';
  entity: 'account' | 'category' | 'transaction' | 'plannedPayment' | 'budget';
  sourceId?: string;
  code:
    | 'ACCOUNT_NOT_FOUND'
    | 'CATEGORY_NOT_FOUND'
    | 'DUPLICATE_ACCOUNT_ID'
    | 'DUPLICATE_CATEGORY_ID'
    | 'INVALID_TRANSFER_DESTINATION'
    | 'INVALID_AMOUNT'
    | 'MISSING_EXCHANGE_RATE'
    | 'INVALID_EXCHANGE_RATE'
    | 'INVALID_ENUM'
    | 'INVALID_ICON'
    | 'EMPTY_BUDGET_SCOPE';
  message: string;
  details?: Record<string, unknown>;
}
