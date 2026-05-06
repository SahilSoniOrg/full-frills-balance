import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { AccountId, JournalDisplayType, SemanticType } from '@/src/types/domain';

const SEMANTIC_MATRIX: Record<AccountType, Record<AccountType, SemanticType>> = {
  [AccountType.ASSET]: {
    [AccountType.ASSET]: SemanticType.TRANSFER,
    [AccountType.LIABILITY]: SemanticType.DEBT_PAYMENT,
    [AccountType.EQUITY]: SemanticType.OWNER_WITHDRAWAL,
    [AccountType.INCOME]: SemanticType.INCOME_REVERSAL,
    [AccountType.EXPENSE]: SemanticType.PURCHASE,
  },

  [AccountType.LIABILITY]: {
    [AccountType.ASSET]: SemanticType.BORROWING,
    [AccountType.LIABILITY]: SemanticType.LIABILITY_TRANSFER,
    [AccountType.EQUITY]: SemanticType.DEBT_CONVERSION,
    [AccountType.INCOME]: SemanticType.LIABILITY_ADJUSTMENT,
    [AccountType.EXPENSE]: SemanticType.PURCHASE,
  },

  [AccountType.EQUITY]: {
    [AccountType.ASSET]: SemanticType.BALANCE_ADJUSTMENT,
    [AccountType.LIABILITY]: SemanticType.LIABILITY_FUNDING,
    [AccountType.EQUITY]: SemanticType.EQUITY_TRANSFER,
    [AccountType.INCOME]: SemanticType.EQUITY_INCOME_ADJUSTMENT,
    [AccountType.EXPENSE]: SemanticType.OWNER_SPENDING,
  },

  [AccountType.INCOME]: {
    [AccountType.ASSET]: SemanticType.INCOME_RECEIVED,
    [AccountType.LIABILITY]: SemanticType.DEBT_PAYDOWN,
    [AccountType.EQUITY]: SemanticType.SAVINGS_ALLOCATION,
    [AccountType.INCOME]: SemanticType.INCOME_RECLASSIFICATION,
    [AccountType.EXPENSE]: SemanticType.TAX_OR_FEE,
  },

  [AccountType.EXPENSE]: {
    [AccountType.ASSET]: SemanticType.REFUND,
    [AccountType.LIABILITY]: SemanticType.CREDIT_REFUND,
    [AccountType.EQUITY]: SemanticType.EXPENSE_CAPITALIZATION,
    [AccountType.INCOME]: SemanticType.EXPENSE_REVERSAL,
    [AccountType.EXPENSE]: SemanticType.EXPENSE_RECLASSIFICATION,
  },
};
export const SEMANTIC_TYPE_LABELS: Record<SemanticType, string> = {
  // Asset sourced
  [SemanticType.TRANSFER]: 'Transfer',
  [SemanticType.DEBT_PAYMENT]: 'Debt Payment',
  [SemanticType.OWNER_WITHDRAWAL]: 'Owner Withdrawal',
  [SemanticType.INCOME_REVERSAL]: 'Income Reversal',
  [SemanticType.PURCHASE]: 'Expense',

  // Liability sourced
  [SemanticType.BORROWING]: 'Borrowed Money',
  [SemanticType.LIABILITY_TRANSFER]: 'Liability Transfer',
  [SemanticType.DEBT_CONVERSION]: 'Debt Conversion',
  [SemanticType.LIABILITY_ADJUSTMENT]: 'Liability Adjustment',
  [SemanticType.EXPENSE_ON_CREDIT]: 'Expense on Credit',

  // Equity sourced
  [SemanticType.BALANCE_ADJUSTMENT]: 'Balance Adjustment',
  [SemanticType.LIABILITY_FUNDING]: 'Liability Funding',
  [SemanticType.EQUITY_TRANSFER]: 'Equity Transfer',
  [SemanticType.EQUITY_INCOME_ADJUSTMENT]: 'Income Adjustment',
  [SemanticType.OWNER_SPENDING]: 'Owner Spending',

  // Income sourced
  [SemanticType.INCOME_RECEIVED]: 'Income',
  [SemanticType.DEBT_PAYDOWN]: 'Debt Paydown',
  [SemanticType.SAVINGS_ALLOCATION]: 'Savings Allocation',
  [SemanticType.INCOME_RECLASSIFICATION]: 'Income Reclassification',
  [SemanticType.TAX_OR_FEE]: 'Tax / Fee',

  // Expense sourced
  [SemanticType.REFUND]: 'Refund',
  [SemanticType.CREDIT_REFUND]: 'Credit Refund',
  [SemanticType.EXPENSE_CAPITALIZATION]: 'Capitalization',
  [SemanticType.EXPENSE_REVERSAL]: 'Expense Reversal',
  [SemanticType.EXPENSE_RECLASSIFICATION]: 'Expense Reclassification',

  [SemanticType.UNKNOWN]: 'Transaction',
};
/**
 * Minimal interface for transaction data needed for journal type classification.
 * Allows both WatermelonDB Transaction models and plain DTOs to be used.
 */
export interface TransactionLike {
  accountId: AccountId;
  amount?: number;
  transactionType?: TransactionType;
}

export interface JournalPresentation {
  type: JournalDisplayType;
  label: string;
  colorKey:
    | 'primary'
    | 'success'
    | 'error'
    | 'textSecondary'
    | 'income'
    | 'expense'
    | 'asset'
    | 'liability'
    | 'equity';
}

export const SEMANTIC_TYPE_COLORS: Record<SemanticType, JournalPresentation['colorKey']> = {
  // Asset sourced
  [SemanticType.TRANSFER]: 'primary',
  [SemanticType.DEBT_PAYMENT]: 'liability',
  [SemanticType.OWNER_WITHDRAWAL]: 'equity',
  [SemanticType.INCOME_REVERSAL]: 'error',
  [SemanticType.PURCHASE]: 'error',

  // Liability sourced
  [SemanticType.BORROWING]: 'asset',
  [SemanticType.LIABILITY_TRANSFER]: 'liability',
  [SemanticType.DEBT_CONVERSION]: 'equity',
  [SemanticType.LIABILITY_ADJUSTMENT]: 'liability',
  [SemanticType.EXPENSE_ON_CREDIT]: 'error',

  // Equity sourced
  [SemanticType.BALANCE_ADJUSTMENT]: 'equity',
  [SemanticType.LIABILITY_FUNDING]: 'liability',
  [SemanticType.EQUITY_TRANSFER]: 'equity',
  [SemanticType.EQUITY_INCOME_ADJUSTMENT]: 'equity',
  [SemanticType.OWNER_SPENDING]: 'equity',

  // Income sourced
  [SemanticType.INCOME_RECEIVED]: 'success',
  [SemanticType.DEBT_PAYDOWN]: 'liability',
  [SemanticType.SAVINGS_ALLOCATION]: 'asset',
  [SemanticType.INCOME_RECLASSIFICATION]: 'income',
  [SemanticType.TAX_OR_FEE]: 'error',

  // Expense sourced
  [SemanticType.REFUND]: 'success',
  [SemanticType.CREDIT_REFUND]: 'success',
  [SemanticType.EXPENSE_CAPITALIZATION]: 'asset',
  [SemanticType.EXPENSE_REVERSAL]: 'success',
  [SemanticType.EXPENSE_RECLASSIFICATION]: 'expense',

  [SemanticType.UNKNOWN]: 'textSecondary',
};

export const journalPresenter = {
  /**
   * Determines the high-level type of a journal based on its transactions.
   * Uses explicit type presence first, then falls back to structural analysis.
   */
  getJournalDisplayType(
    txs: TransactionLike[],
    accountTypes: Map<string, AccountType>,
  ): JournalDisplayType {
    let hasIncome = false;
    let hasExpense = false;

    txs.forEach(tx => {
      const type = accountTypes.get(tx.accountId);
      if (type === AccountType.INCOME) hasIncome = true;
      else if (type === AccountType.EXPENSE) hasExpense = true;
    });

    // 1. Explicit Domain Accounts take precedence
    if (hasIncome && hasExpense) return JournalDisplayType.MIXED;
    if (hasIncome) return JournalDisplayType.INCOME;
    if (hasExpense) return JournalDisplayType.EXPENSE;

    // 2. Structural/Semantic Classification
    const { source, destination } = this.getSourceAndDestTypes(txs, accountTypes);

    // Map semantic pairs to high-level display types
    if (source === AccountType.INCOME || destination === AccountType.EQUITY)
      return JournalDisplayType.INCOME;
    if (destination === AccountType.EXPENSE || source === AccountType.EQUITY)
      return JournalDisplayType.EXPENSE;

    return JournalDisplayType.TRANSFER;
  },

  /**
   * Identifies the primary Source and Destination account types for a journal.
   * Handles both 2-leg and complex multi-leg/split transactions by finding the dominant flow.
   */
  getSourceAndDestTypes(
    txs: TransactionLike[],
    accountTypes: Map<string, AccountType>,
  ): { source: AccountType; destination: AccountType } {
    const creditWeights = new Map<AccountType, number>();
    const debitWeights = new Map<AccountType, number>();

    txs.forEach(tx => {
      const type = accountTypes.get(tx.accountId);
      if (!type) return;

      const weight = Math.abs(tx.amount || 0);
      if (tx.transactionType === TransactionType.CREDIT) {
        creditWeights.set(type, (creditWeights.get(type) || 0) + weight);
      } else {
        debitWeights.set(type, (debitWeights.get(type) || 0) + weight);
      }
    });

    // Find primary types by highest weight
    let source = AccountType.ASSET;
    let maxSourceWeight = -1;
    creditWeights.forEach((weight, type) => {
      if (weight > maxSourceWeight) {
        maxSourceWeight = weight;
        source = type;
      }
    });

    let destination = AccountType.ASSET;
    let maxDestWeight = -1;
    debitWeights.forEach((weight, type) => {
      if (weight > maxDestWeight) {
        maxDestWeight = weight;
        destination = type;
      }
    });

    return { source, destination };
  },

  /**
   * Returns a human-readable specific label based on semantic analysis.
   */
  getJournalSemanticLabel(txs: TransactionLike[], accountTypes: Map<string, AccountType>): string {
    // Special case: Multiple income/expense legs without a single dominant pattern
    const hasIncome = txs.some(tx => accountTypes.get(tx.accountId) === AccountType.INCOME);
    const hasExpense = txs.some(tx => accountTypes.get(tx.accountId) === AccountType.EXPENSE);
    if (hasIncome && hasExpense) return 'Split';

    const { source, destination } = this.getSourceAndDestTypes(txs, accountTypes);
    const typeKey = this.getSemanticType(source, destination);
    const label = SEMANTIC_TYPE_LABELS[typeKey];

    return label; // SemanticType enum has user-friendly strings (e.g. "Debt Payment")
  },

  /**
   * Returns display properties for a journal type
   */
  getPresentation(
    type: JournalDisplayType,
    semanticLabel?: string,
    semanticType?: SemanticType,
  ): JournalPresentation {
    // If we have a specific semantic type, use its color override
    if (semanticType && semanticType !== SemanticType.UNKNOWN) {
      return {
        type,
        label: semanticLabel || SEMANTIC_TYPE_LABELS[semanticType],
        colorKey: SEMANTIC_TYPE_COLORS[semanticType],
      };
    }

    // Fallback to high-level display types
    switch (type) {
      case JournalDisplayType.INCOME:
        return { type, label: semanticLabel || 'Income', colorKey: 'success' };
      case JournalDisplayType.EXPENSE:
        return { type, label: semanticLabel || 'Expense', colorKey: 'error' };
      case JournalDisplayType.TRANSFER:
        return { type, label: semanticLabel || 'Transfer', colorKey: 'primary' };
      case JournalDisplayType.MIXED:
      default:
        return { type, label: semanticLabel || 'Split', colorKey: 'textSecondary' };
    }
  },

  /**
   * Implements the 5x5 Semantic Matrix
   * Source (Credit) -> Destination (Debit)
   */
  getSemanticType(sourceType: AccountType, destType: AccountType): SemanticType {
    return SEMANTIC_MATRIX[sourceType]?.[destType] ?? SemanticType.UNKNOWN;
  },

  /**
   * Simple icon label for the Ivy-style UI
   */
  getIconLabel(type: JournalDisplayType): string {
    switch (type) {
      case JournalDisplayType.INCOME:
        return 'I';
      case JournalDisplayType.EXPENSE:
        return 'E';
      case JournalDisplayType.TRANSFER:
        return 'T';
      default:
        return 'J';
    }
  },
};
