/**
 * Single registry for workplace backup export and workplace-scoped purge/swap.
 */

export type WorkplaceDataTableTask = {
  name: string;
  table: string;
};

/** Included in JSON export but not keyed by workplace_id (see schema.ts). */
export const WORKPLACE_EXPORT_GLOBAL_TABLE_NAMES = ['currencies', 'exchange_rates'] as const;

export const WORKPLACE_DATA_TABLES: readonly WorkplaceDataTableTask[] = [
  { name: 'Accounts', table: 'accounts' },
  { name: 'Journals', table: 'journals' },
  { name: 'Entries', table: 'transactions' },
  { name: 'Audit Logs', table: 'audit_logs' },
  { name: 'Budgets', table: 'budgets' },
  { name: 'Budget Scopes', table: 'budget_scopes' },
  { name: 'Metadata', table: 'account_metadata' },
  { name: 'Planned Payments', table: 'planned_payments' },
  { name: 'Journal Metadata', table: 'journal_metadata' },
  { name: 'Rules', table: 'transaction_auto_post_rules' },
  { name: 'Inbox', table: 'transaction_inbox_records' },
  { name: 'Currencies', table: 'currencies' },
  { name: 'Exchange Rates', table: 'exchange_rates' },
  { name: 'Balance Snapshots', table: 'balance_snapshots' },
] as const;

const globalExportTableSet = new Set<string>(WORKPLACE_EXPORT_GLOBAL_TABLE_NAMES);

/** Tables with workplace_id — used for purge and staged-import swap. */
export const WORKPLACE_SCOPED_TABLE_NAMES: readonly string[] = WORKPLACE_DATA_TABLES.map(
  ({ table }) => table,
).filter(table => !globalExportTableSet.has(table));
