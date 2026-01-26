import { AccountType } from '@/src/data/models/Account';

export enum JournalDisplayType {
    INCOME = 'INCOME',
    EXPENSE = 'EXPENSE',
    TRANSFER = 'TRANSFER',
    MIXED = 'MIXED',
}

export enum SemanticType {
    // Assets
    TRANSFER = 'Transfer',
    DEBT_PAYMENT = 'Debt Payment',
    OWNER_DRAW = 'Owner Draw',
    INCOME_REFUND = 'Income Refund',
    EXPENSE = 'Expense',

    // Liabilities
    NEW_DEBT = 'New Debt',
    DEBT_REFINANCE = 'Debt Refinance',
    DEBT_TO_EQUITY = 'Debt-to-Equity',
    LIABILITY_ADJ = 'Liability Adj',
    ACCRUED_EXPENSE = 'Accrued Expense',

    // Equity
    INVESTMENT = 'Investment',
    FINANCING_OBJ = 'Financing Obj',
    EQUITY_TRANSFER = 'Equity Transfer',
    CONTRIB_ADJ = 'Contrib. Adj',
    DIRECT_DRAW = 'Direct Draw',

    // Income
    INCOME = 'Income',
    DIRECT_PAYDOWN = 'Direct Paydown',
    RETAINED_SAVINGS = 'Retained Savings',
    INCOME_RECLASS = 'Income Reclass',
    DIRECT_TAX = 'Direct Tax/Fee',

    // Expense
    REFUND = 'Refund',
    CREDIT_REFUND = 'Credit Refund',
    CAPITALIZATION = 'Capitalization',
    ADJ_RESET = 'Adj Reset',
    RECLASSIFICATION = 'Reclassification',

    UNKNOWN = 'Transaction'
}

/**
 * Minimal interface for transaction data needed for journal type classification.
 * Allows both WatermelonDB Transaction models and plain DTOs to be used.
 */
export interface TransactionLike {
    accountId: string;
}

export interface JournalPresentation {
    type: JournalDisplayType;
    label: string;
    colorHex: string; // Using hex or theme key reference
}

export class JournalPresenter {
    /**
     * Determines the high-level type of a journal based on its transactions
     */
    static getJournalDisplayType(txs: TransactionLike[], accountTypes: Map<string, AccountType>): JournalDisplayType {
        let hasIncome = false;
        let hasExpense = false;

        txs.forEach(tx => {
            const type = accountTypes.get(tx.accountId);
            if (type === AccountType.INCOME) hasIncome = true;
            else if (type === AccountType.EXPENSE) hasExpense = true;
            else {
                // Asset, Liability, Equity - used implicitly as default (Transfer)
            }
        });

        if (hasIncome && hasExpense) return JournalDisplayType.MIXED;
        if (hasIncome) return JournalDisplayType.INCOME;
        if (hasExpense) return JournalDisplayType.EXPENSE;
        return JournalDisplayType.TRANSFER;
    }

    /**
     * Returns display properties for a journal type
     */
    static getPresentation(type: JournalDisplayType, theme: any, semanticLabel?: string): JournalPresentation {
        switch (type) {
            case JournalDisplayType.INCOME:
                return { type, label: semanticLabel || 'Income', colorHex: theme.success };
            case JournalDisplayType.EXPENSE:
                return { type, label: semanticLabel || 'Expense', colorHex: theme.error };
            case JournalDisplayType.TRANSFER:
                return { type, label: semanticLabel || 'Transfer', colorHex: theme.primary };
            case JournalDisplayType.MIXED:
            default:
                return { type, label: semanticLabel || 'Split', colorHex: theme.textSecondary };
        }
    }

    /**
     * Implements the 5x5 Semantic Matrix
     * Source (Credit) -> Destination (Debit)
     */
    static getSemanticType(sourceType: AccountType, destType: AccountType): SemanticType {
        const matrix: Record<string, Record<string, SemanticType>> = {
            [AccountType.ASSET]: {
                [AccountType.ASSET]: SemanticType.TRANSFER,
                [AccountType.LIABILITY]: SemanticType.DEBT_PAYMENT,
                [AccountType.EQUITY]: SemanticType.OWNER_DRAW,
                [AccountType.INCOME]: SemanticType.INCOME_REFUND,
                [AccountType.EXPENSE]: SemanticType.EXPENSE,
            },
            [AccountType.LIABILITY]: {
                [AccountType.ASSET]: SemanticType.NEW_DEBT,
                [AccountType.LIABILITY]: SemanticType.DEBT_REFINANCE,
                [AccountType.EQUITY]: SemanticType.DEBT_TO_EQUITY,
                [AccountType.INCOME]: SemanticType.LIABILITY_ADJ,
                [AccountType.EXPENSE]: SemanticType.ACCRUED_EXPENSE,
            },
            [AccountType.EQUITY]: {
                [AccountType.ASSET]: SemanticType.INVESTMENT,
                [AccountType.LIABILITY]: SemanticType.FINANCING_OBJ,
                [AccountType.EQUITY]: SemanticType.EQUITY_TRANSFER,
                [AccountType.INCOME]: SemanticType.CONTRIB_ADJ,
                [AccountType.EXPENSE]: SemanticType.DIRECT_DRAW,
            },
            [AccountType.INCOME]: {
                [AccountType.ASSET]: SemanticType.INCOME,
                [AccountType.LIABILITY]: SemanticType.DIRECT_PAYDOWN,
                [AccountType.EQUITY]: SemanticType.RETAINED_SAVINGS,
                [AccountType.INCOME]: SemanticType.INCOME_RECLASS,
                [AccountType.EXPENSE]: SemanticType.DIRECT_TAX,
            },
            [AccountType.EXPENSE]: {
                [AccountType.ASSET]: SemanticType.REFUND,
                [AccountType.LIABILITY]: SemanticType.CREDIT_REFUND,
                [AccountType.EQUITY]: SemanticType.CAPITALIZATION,
                [AccountType.INCOME]: SemanticType.ADJ_RESET,
                [AccountType.EXPENSE]: SemanticType.RECLASSIFICATION,
            }
        };

        return matrix[sourceType]?.[destType] || SemanticType.UNKNOWN;
    }

    /**
     * Gets theme color key for an account type (Used by hooks/repositories)
     */
    static getAccountColorKey(type: string): 'asset' | 'liability' | 'equity' | 'income' | 'expense' {
        switch (type) {
            case AccountType.ASSET: return 'asset';
            case AccountType.LIABILITY: return 'liability';
            case AccountType.EQUITY: return 'equity';
            case AccountType.INCOME: return 'income';
            case AccountType.EXPENSE: return 'expense';
            default: return 'asset';
        }
    }

    /**
     * Simple icon label for the Ivy-style UI
     */
    static getIconLabel(type: JournalDisplayType): string {
        switch (type) {
            case JournalDisplayType.INCOME: return 'I';
            case JournalDisplayType.EXPENSE: return 'E';
            case JournalDisplayType.TRANSFER: return 'T';
            default: return 'J';
        }
    }
}
