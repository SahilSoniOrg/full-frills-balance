import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 4,
  tables: [
    tableSchema({
      name: 'accounts',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'account_type', type: 'string' }, // ASSET, LIABILITY, etc.
        { name: 'currency_code', type: 'string', isIndexed: true },
        { name: 'parent_account_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'currencies',
      columns: [
        { name: 'code', type: 'string', isIndexed: true },
        { name: 'symbol', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'precision', type: 'number' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'journals',
      columns: [
        { name: 'journal_date', type: 'number', isIndexed: true }, // timestamp
        { name: 'description', type: 'string', isOptional: true },
        { name: 'currency_code', type: 'string', isIndexed: true },
        { name: 'status', type: 'string' }, // POSTED, REVERSED
        { name: 'original_journal_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'reversing_journal_id', type: 'string', isOptional: true, isIndexed: true },
        // Denormalized fields for list performance
        { name: 'total_amount', type: 'number' },
        { name: 'transaction_count', type: 'number' },
        { name: 'display_type', type: 'string' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'journal_id', type: 'string', isIndexed: true },
        { name: 'account_id', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number' }, // in minor units, always positive
        { name: 'transaction_type', type: 'string' }, // DEBIT or CREDIT
        { name: 'currency_code', type: 'string', isIndexed: true },
        { name: 'transaction_date', type: 'number', isIndexed: true }, // timestamp
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'exchange_rate', type: 'number', isOptional: true }, // For multi-currency transactions
        // Note: running_balance is a cache that can be rebuilt from transactions
        // It should only be written by rebuild process, not during normal operations
        { name: 'running_balance', type: 'number', isOptional: true, isIndexed: false },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'exchange_rates',
      columns: [
        { name: 'from_currency', type: 'string', isIndexed: true },
        { name: 'to_currency', type: 'string', isIndexed: true },
        { name: 'rate', type: 'number' },
        { name: 'effective_date', type: 'number', isIndexed: true },
        { name: 'source', type: 'string' }, // API source name
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'audit_logs',
      columns: [
        { name: 'entity_type', type: 'string', isIndexed: true },
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'action', type: 'string' }, // CREATE, UPDATE, DELETE
        { name: 'changes', type: 'string' }, // JSON of before/after
        { name: 'timestamp', type: 'number', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
})
