export declare const __brand: unique symbol;
export type Brand<T, B> = T & { readonly [__brand]: B };

export type WorkplaceId = Brand<string, 'WorkplaceId'>;
export type AccountId = Brand<string, 'AccountId'>;
export type JournalId = Brand<string, 'JournalId'>;
export type TransactionId = Brand<string, 'TransactionId'>;
export type BudgetId = Brand<string, 'BudgetId'>;
export type PlannedPaymentId = Brand<string, 'PlannedPaymentId'>;

/**
 * Brand a raw string at an untyped boundary (route params, Object.keys,
 * generateId, raw SQL, MMKV). Do not recast values that are already branded.
 */
export const asWorkplaceId = (id: string): WorkplaceId => id as WorkplaceId;
export const asAccountId = (id: string): AccountId => id as AccountId;
export const asJournalId = (id: string): JournalId => id as JournalId;
export const asTransactionId = (id: string): TransactionId => id as TransactionId;
export const asBudgetId = (id: string): BudgetId => id as BudgetId;
export const asPlannedPaymentId = (id: string): PlannedPaymentId => id as PlannedPaymentId;

export const EMPTY_ACCOUNT_ID: AccountId = asAccountId('');

/** Object.keys erases branded record keys; brand them back at that call. */
export function brandedKeys<K extends string>(record: Record<K, unknown>): K[] {
  return Object.keys(record) as K[];
}
