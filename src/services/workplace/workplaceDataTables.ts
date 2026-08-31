/**
 * Single registry for workplace backup export and workplace-scoped purge/swap.
 */

export type WorkplaceDataTableTask = {
  name: string;
  table: string;
};

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
  { name: 'Balance Snapshots', table: 'balance_snapshots' },
] as const;

/** Tables with workplace_id — used for workplace purge and replacement. */
export const WORKPLACE_SCOPED_TABLE_NAMES: readonly string[] = WORKPLACE_DATA_TABLES.map(
  ({ table }) => table,
);
