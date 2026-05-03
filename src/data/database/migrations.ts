import {
  addColumns,
  createTable,
  schemaMigrations,
  unsafeExecuteSql,
} from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        // Add exchange_rate to transactions for multi-currency support
        addColumns({
          table: 'transactions',
          columns: [{ name: 'exchange_rate', type: 'number', isOptional: true }],
        }),
        // New table for storing historical exchange rates
        createTable({
          name: 'exchange_rates',
          columns: [
            { name: 'from_currency', type: 'string', isIndexed: true },
            { name: 'to_currency', type: 'string', isIndexed: true },
            { name: 'rate', type: 'number' },
            { name: 'effective_date', type: 'number', isIndexed: true },
            { name: 'source', type: 'string' }, // API source
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        // New table for audit trail
        createTable({
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
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'journals',
          columns: [
            { name: 'total_amount', type: 'number' },
            { name: 'transaction_count', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'journals',
          columns: [{ name: 'display_type', type: 'string' }],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'accounts',
          columns: [{ name: 'order_num', type: 'number', isOptional: true, isIndexed: true }],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'accounts',
          columns: [{ name: 'icon', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        createTable({
          name: 'budgets',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'amount', type: 'number' },
            { name: 'currency_code', type: 'string', isIndexed: true },
            { name: 'start_month', type: 'string', isIndexed: true },
            { name: 'active', type: 'boolean' },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'budget_scopes',
          columns: [
            { name: 'budget_id', type: 'string', isIndexed: true },
            { name: 'account_id', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'accounts',
          columns: [{ name: 'account_subtype', type: 'string', isOptional: true, isIndexed: true }],
        }),
        unsafeExecuteSql(`
                  UPDATE accounts
                  SET account_subtype = CASE account_type
                    WHEN 'ASSET' THEN 'CASH'
                    WHEN 'LIABILITY' THEN 'CREDIT_CARD'
                    WHEN 'EQUITY' THEN 'OPENING_BALANCE'
                    WHEN 'INCOME' THEN 'SALARY'
                    WHEN 'EXPENSE' THEN 'FOOD'
                    ELSE 'OTHER'
                  END
                  WHERE account_subtype IS NULL OR account_subtype = '';
                `),
        createTable({
          name: 'account_metadata',
          columns: [
            { name: 'account_id', type: 'string', isIndexed: true },
            { name: 'statement_day', type: 'number', isOptional: true },
            { name: 'due_day', type: 'number', isOptional: true },
            { name: 'minimum_payment_amount', type: 'number', isOptional: true },
            { name: 'minimum_balance_amount', type: 'number', isOptional: true },
            { name: 'credit_limit_amount', type: 'number', isOptional: true },
            { name: 'apr_bps', type: 'number', isOptional: true },
            { name: 'emi_day', type: 'number', isOptional: true },
            { name: 'loan_tenure_months', type: 'number', isOptional: true },
            { name: 'autopay_enabled', type: 'boolean', isOptional: true },
            { name: 'grace_period_days', type: 'number', isOptional: true },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 9,
      steps: [
        addColumns({
          table: 'journals',
          columns: [
            { name: 'planned_payment_id', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
        createTable({
          name: 'planned_payments',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'description', type: 'string', isOptional: true },
            { name: 'amount', type: 'number' },
            { name: 'currency_code', type: 'string', isIndexed: true },
            { name: 'from_account_id', type: 'string', isIndexed: true },
            { name: 'to_account_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'interval_n', type: 'number' },
            { name: 'interval_type', type: 'string' },
            { name: 'start_date', type: 'number', isIndexed: true },
            { name: 'end_date', type: 'number', isOptional: true },
            { name: 'next_occurrence', type: 'number', isIndexed: true },
            { name: 'status', type: 'string' },
            { name: 'is_auto_post', type: 'boolean' },
            { name: 'recurrence_day', type: 'number', isOptional: true },
            { name: 'recurrence_month', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
            { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 10,
      steps: [
        createTable({
          name: 'balance_snapshots',
          columns: [
            { name: 'account_id', type: 'string', isIndexed: true },
            { name: 'transaction_id', type: 'string', isIndexed: true },
            { name: 'transaction_date', type: 'number', isIndexed: true },
            { name: 'absolute_balance', type: 'number' },
            { name: 'transaction_count', type: 'number' },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 11,
      steps: [
        createTable({
          name: 'journal_metadata',
          columns: [
            { name: 'journal_id', type: 'string', isIndexed: true },
            { name: 'import_source', type: 'string' },
            { name: 'original_sms_id', type: 'string', isOptional: true },
            { name: 'original_sms_sender', type: 'string', isOptional: true },
            { name: 'original_sms_body', type: 'string', isOptional: true },
            { name: 'metadata_json', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 12,
      steps: [
        createTable({
          name: 'sms_auto_post_rules',
          columns: [
            { name: 'sender_match', type: 'string', isIndexed: true },
            { name: 'body_match', type: 'string', isOptional: true },
            { name: 'source_account_id', type: 'string', isIndexed: true },
            { name: 'category_account_id', type: 'string', isIndexed: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 13,
      steps: [
        createTable({
          name: 'sms_inbox_records',
          columns: [
            { name: 'device_sms_id', type: 'string', isIndexed: true },
            { name: 'sender_address', type: 'string', isIndexed: true },
            { name: 'raw_body', type: 'string' },
            { name: 'sms_date', type: 'number', isIndexed: true },
            { name: 'sms_fingerprint', type: 'string', isIndexed: true },
            { name: 'parse_status', type: 'string', isIndexed: true },
            { name: 'parsed_amount', type: 'number', isOptional: true },
            { name: 'parsed_currency_code', type: 'string', isOptional: true },
            { name: 'parsed_merchant', type: 'string', isOptional: true },
            { name: 'parsed_account_source', type: 'string', isOptional: true },
            { name: 'reference_number', type: 'string', isOptional: true },
            { name: 'direction', type: 'string', isIndexed: true },
            { name: 'processing_status', type: 'string', isIndexed: true },
            { name: 'linked_journal_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'duplicate_journal_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'duplicate_confidence', type: 'number', isOptional: true },
            { name: 'parse_confidence', type: 'number', isOptional: true },
            { name: 'parse_reason', type: 'string', isOptional: true },
            { name: 'metadata_json', type: 'string', isOptional: true },
            { name: 'first_seen_at', type: 'number', isIndexed: true },
            { name: 'last_scanned_at', type: 'number', isIndexed: true },
            { name: 'processed_at', type: 'number', isOptional: true, isIndexed: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'sms_auto_post_rules',
          columns: [
            { name: 'conditions_json', type: 'string', isOptional: true },
            { name: 'actions_json', type: 'string', isOptional: true },
            { name: 'priority', type: 'number', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 14,
      steps: [
        addColumns({
          table: 'accounts',
          columns: [{ name: 'reconciled_at', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 15,
      steps: [
        addColumns({
          table: 'account_metadata',
          columns: [{ name: 'pay_from_account_id', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 16,
      steps: [
        addColumns({
          table: 'budgets',
          columns: [{ name: 'asset_account_ids', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 17,
      steps: [
        addColumns({
          table: 'account_metadata',
          columns: [
            { name: 'min_payment_only', type: 'boolean', isOptional: true },
            { name: 'minimum_payment_percent', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 18,
      steps: [
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_chronological 
          ON transactions (account_id, transaction_date, created_at, id) 
          WHERE deleted_at IS NULL;
        `),
      ],
    },
    {
      toVersion: 19,
      steps: [
        unsafeExecuteSql(`DROP INDEX IF EXISTS idx_transactions_chronological;`),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_high_perf 
          ON transactions (account_id, transaction_date DESC, created_at DESC, id DESC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_journals_status_active 
          ON journals (status, deleted_at) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup 
          ON exchange_rates (from_currency, to_currency, effective_date DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_audit_logs_history 
          ON audit_logs (entity_type, entity_id, timestamp DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_planned_payments_active 
          ON planned_payments (status, deleted_at, next_occurrence ASC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_journals_main_ledger 
          ON journals (status, deleted_at, journal_date DESC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_amount 
          ON transactions (amount) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_balance_snapshots_chronological 
          ON balance_snapshots (account_id, transaction_date DESC, created_at DESC, id DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_budgets_active_sorted 
          ON budgets (active, start_month DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_sms_inbox_chronological 
          ON sms_inbox_records (sms_date DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_accounts_ordered 
          ON accounts (deleted_at, order_num ASC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_global_chronological 
          ON transactions (transaction_date DESC, created_at DESC, id DESC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_journals_dedup 
          ON journals (total_amount, journal_date) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_by_journal 
          ON transactions (journal_id, transaction_date, created_at) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_sms_inbox_pending 
          ON sms_inbox_records (processing_status, sms_date DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_planned_payments_upcoming 
          ON planned_payments (deleted_at, next_occurrence ASC) 
          WHERE deleted_at IS NULL;
        `),
      ],
    },
    {
      toVersion: 20,
      steps: [
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_high_perf 
          ON transactions (account_id, transaction_date DESC, created_at DESC, id DESC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_balance_snapshots_chronological 
          ON balance_snapshots (account_id, transaction_date DESC, created_at DESC, id DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_journals_main_ledger 
          ON journals (status, deleted_at, journal_date DESC) 
          WHERE deleted_at IS NULL;
        `),
      ],
    },
    {
      toVersion: 21,
      steps: [
        addColumns({
          table: 'budgets',
          columns: [
            { name: 'interval_type', type: 'string' },
            { name: 'interval_n', type: 'number' },
            { name: 'start_date', type: 'number', isOptional: true },
            { name: 'recurrence_day', type: 'number', isOptional: true },
            { name: 'recurrence_month', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 22,
      steps: [
        addColumns({
          table: 'journals',
          columns: [{ name: 'notes', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
