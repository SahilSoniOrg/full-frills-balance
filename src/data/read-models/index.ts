/**
 * Read Models Index - Repository-owned read models for UI consumption
 * 
 * These are read-only shapes that combine related data for presentation
 * They make it explicit these are query results, not domain entities
 * No caching, no persistence - pure computed views
 */

export type { AccountWithBalance } from './AccountRead'
export type { JournalWithTransactionSummary } from './JournalRead'
export type { TransactionWithAccountInfo } from './TransactionRead'

