// Shared by fresh setup, index recreation, and the forward migration. Keep old
// migrations immutable: existing v34 installations also need these indexes.
const ledgerReadIndexes = {
  idx_transactions_workplace_account_chrono: `ON transactions (
    workplace_id, account_id, transaction_date DESC, created_at DESC, id DESC
  ) WHERE deleted_at IS NULL`,
  idx_transactions_workplace_journal: `ON transactions (
    workplace_id, journal_id, transaction_date DESC
  ) WHERE deleted_at IS NULL`,
  idx_journals_workplace_status_chrono: `ON journals (
    workplace_id, status, journal_date DESC, created_at DESC, id DESC
  ) WHERE deleted_at IS NULL`,
  idx_balance_snapshots_workplace_account: `ON balance_snapshots (
    workplace_id, account_id, transaction_date DESC
  )`,
};

export const CREATE_LEDGER_READ_INDEXES_SQL = Object.entries(ledgerReadIndexes)
  .map(([name, definition]) => `CREATE INDEX IF NOT EXISTS ${name} ${definition};`)
  .join('\n');

export const DROP_LEDGER_READ_INDEXES_SQL = Object.keys(ledgerReadIndexes)
  .map(name => `DROP INDEX IF EXISTS ${name};`)
  .join('\n');
