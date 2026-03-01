/**
 * Shared types and DTOs for transaction-related data.
 * These are primarily used for high-performance raw SQL queries.
 */

/**
 * Minimal transaction data required for running balance rebuilds.
 */
export interface RebuildTransaction {
    id: string;
    amount: number;
    transactionType: string;
    transactionDate: number;
    runningBalance: number | null;
    createdAt: number;
}

/**
 * Daily net balance change data.
 */
export interface DailyDelta {
    dayStart: number;
    currencyCode: string;
    accountType: string;
    delta: number;
}

/**
 * Account-level net balance change data.
 */
export interface AccountDelta {
    accountId: string;
    currencyCode: string;
    delta: number;
}

/**
 * Recurring transaction pattern candidate.
 */
export interface RecurringPattern {
    amount: number;
    accountId: string;
    currencyCode: string;
    occurrenceCount: number;
    journalIds: string;
    firstDate: number;
    lastDate: number;
}
