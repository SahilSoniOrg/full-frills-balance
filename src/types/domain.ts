import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';

export enum JournalDisplayType {
    INCOME = 'INCOME',
    EXPENSE = 'EXPENSE',
    TRANSFER = 'TRANSFER',
    MIXED = 'MIXED',
}

export { AccountType, TransactionType };

/**
 * Domain-owned models and read models for UI consumption.
 * These are types that often combine multiple entities for presentation.
 * Follows Rule 3: Data-Driven UI (these define the 'data' the UI consumes).
 */

/**
 * AccountBalance - Summary of an account's financial state
 */
export interface AccountBalance {
    accountId: string;
    balance: number;
    currencyCode: string;
    transactionCount: number;
    directTransactionCount: number;
    asOfDate: number;
    accountType: AccountType;
    icon?: string;
    monthlyIncome: number;
    monthlyExpenses: number;
    childBalances?: { currencyCode: string; balance: number; transactionCount: number }[];
}

/**
 * TransactionWithAccountInfo - Transaction data merged with metadata of the account it belongs to
 */
export interface TransactionWithAccountInfo {
    id: string;
    amount: number;
    transactionType: TransactionType;
    currencyCode: string;
    transactionDate: number;
    notes?: string;
    accountId: string;
    exchangeRate?: number;

    // Account information for display
    accountName: string;
    accountType: AccountType;
    counterAccountName?: string;
    counterAccountType?: AccountType;
    journalDescription?: string;
    displayTitle?: string;
    isIncrease?: boolean;
    icon?: string;
    counterAccountIcon?: string;

    // Semantic flags
    flowDirection: 'IN' | 'OUT';
    balanceImpact: 'INCREASE' | 'DECREASE';

    // Running balance for this transaction
    runningBalance?: number;

    // Audit fields
    createdAt: Date;
    updatedAt: Date;
}

/**
 * JournalWithTransactionSummary - Journal data with computed summary from its transactions
 */
export interface JournalWithTransactionSummary {
    id: string;
    journalDate: number;
    description?: string;
    currencyCode: string;
    status: string;

    // Computed transaction summary
    totalDebits: number;
    totalCredits: number;
    transactionCount: number;
    isBalanced: boolean;

    // Audit fields
    createdAt: Date;
    updatedAt: Date;
}

/**
 * AccountWithBalance - Account data with its current balance information
 */
export interface AccountWithBalance {
    id: string;
    name: string;
    accountType: AccountType;
    currencyCode: string;
    description?: string;

    // Computed balance information
    currentBalance: number;
    transactionCount: number;
    lastActivityDate?: number;
    icon?: string;

    // Audit fields
    createdAt: Date;
    updatedAt: Date;
}

/**
 * EnrichedJournal - Highly processed journal data for card-style list display
 */
export interface EnrichedJournal {
    id: string;
    journalDate: number;
    description?: string;
    currencyCode: string;
    status: string;
    totalAmount: number;
    transactionCount: number;
    displayType: string;
    accounts: {
        id: string;
        name: string;
        accountType: string;
        icon?: string;
        role: 'SOURCE' | 'DESTINATION' | 'NEUTRAL';
    }[];
    semanticType?: string;
    semanticLabel?: string;
}

/**
 * EnrichedTransaction - Highly processed transaction data for transaction-specific lists
 */
export interface EnrichedTransaction {
    id: string;
    journalId: string;
    accountId: string;
    amount: number;
    currencyCode: string;
    transactionType: string;
    transactionDate: number;
    notes?: string;
    journalDescription?: string;
    accountName?: string;
    accountType?: string;
    counterAccountName?: string;
    counterAccountType?: string;
    runningBalance?: number;
    displayTitle: string;
    displayType: JournalDisplayType;
    isIncrease: boolean;
    icon?: string;
    counterAccountIcon?: string;
    exchangeRate?: number;
    semanticType?: string;
    semanticLabel?: string;
}

/**
 * JournalEntryLine - UI-specific model for a single line in the journal editor.
 * Used in guided and advanced forms.
 */
export interface JournalEntryLine {
    id: string;
    accountId: string;
    accountName: string;
    accountType: AccountType;
    amount: string;
    transactionType: TransactionType;
    notes: string;
    exchangeRate: string;
    accountCurrency?: string;
}

/**
 * AccountCreateInput - Input for creating a new account
 */
export interface AccountCreateInput {
    name: string;
    accountType: AccountType;
    currencyCode: string;
    description?: string;
    parentAccountId?: string;
    icon?: string;
    initialBalance?: number;
}

/**
 * AccountUpdateInput - Input for updating an existing account
 */
export interface AccountUpdateInput {
    name?: string;
    description?: string;
    parentAccountId?: string;
    accountType?: AccountType;
    icon?: string;
}

/**
 * AccountSummary - Aggregated financial summary across accounts
 */
export interface AccountSummary {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalIncome: number;
    totalExpenses: number;
    netWorth: number;
}
