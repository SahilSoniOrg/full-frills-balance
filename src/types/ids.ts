export declare const __brand: unique symbol;
export type Brand<T, B> = T & { readonly [__brand]: B };

export type WorkplaceId = Brand<string, 'WorkplaceId'>;
export type AccountId = Brand<string, 'AccountId'>;
export type JournalId = Brand<string, 'JournalId'>;
export type TransactionId = Brand<string, 'TransactionId'>;
export type BudgetId = Brand<string, 'BudgetId'>;
export type PlannedPaymentId = Brand<string, 'PlannedPaymentId'>;
export type PersonId = Brand<string, 'PersonId'>;
export type PersonAccountId = Brand<string, 'PersonAccountId'>;
export type OpenItemId = Brand<string, 'OpenItemId'>;
export type SettlementAllocationId = Brand<string, 'SettlementAllocationId'>;

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
export const asPersonId = (id: string): PersonId => id as PersonId;
export const asPersonAccountId = (id: string): PersonAccountId => id as PersonAccountId;
export const asOpenItemId = (id: string): OpenItemId => id as OpenItemId;
export const asSettlementAllocationId = (id: string): SettlementAllocationId => id as SettlementAllocationId;

export const EMPTY_ACCOUNT_ID: AccountId = asAccountId('');

/** Object.keys erases branded record keys; brand them back at that call. */
export function brandedKeys<K extends string>(record: Record<K, unknown>): K[] {
  return Object.keys(record) as K[];
}
