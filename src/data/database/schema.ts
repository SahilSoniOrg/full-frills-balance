import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 23,
  tables: [
    tableSchema({
      name: 'accounts',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'account_type', type: 'string', isIndexed: true }, // ASSET, LIABILITY, etc.
        { name: 'account_subtype', type: 'string', isOptional: true, isIndexed: true },
        { name: 'currency_code', type: 'string', isIndexed: true },
        { name: 'parent_account_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'icon', type: 'string', isOptional: true },
        { name: 'order_num', type: 'number', isOptional: true, isIndexed: true },
        { name: 'reconciled_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_accounts_workplace_id_check
BEFORE INSERT ON accounts
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on accounts');
END;`,
    }),
    tableSchema({
      name: 'balance_snapshots',
      columns: [
        { name: 'account_id', type: 'string', isIndexed: true },
        { name: 'transaction_id', type: 'string', isIndexed: true },
        { name: 'transaction_date', type: 'number', isIndexed: true },
        { name: 'absolute_balance', type: 'number' },
        { name: 'transaction_count', type: 'number' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_balance_snapshots_workplace_id_check
BEFORE INSERT ON balance_snapshots
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on balance_snapshots');
END;`,
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
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'currency_code', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true }, // POSTED, REVERSED
        { name: 'original_journal_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'reversing_journal_id', type: 'string', isOptional: true, isIndexed: true },
        // Denormalized fields for list performance
        { name: 'total_amount', type: 'number' },
        { name: 'transaction_count', type: 'number' },
        { name: 'display_type', type: 'string' },
        { name: 'planned_payment_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_journals_workplace_id_check
BEFORE INSERT ON journals
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on journals');
END;`,
    }),
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'journal_id', type: 'string', isIndexed: true },
        { name: 'account_id', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number', isIndexed: true }, // in minor units, always positive
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
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_transactions_workplace_id_check
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on transactions');
END;`,
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
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_audit_logs_workplace_id_check
BEFORE INSERT ON audit_logs
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on audit_logs');
END;`,
    }),
    tableSchema({
      name: 'budgets',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'currency_code', type: 'string', isIndexed: true },
        { name: 'start_month', type: 'string', isIndexed: true }, // YYYY-MM
        { name: 'interval_type', type: 'string' }, // MONTHLY, WEEKLY, etc.
        { name: 'interval_n', type: 'number' },
        { name: 'start_date', type: 'number', isOptional: true },
        { name: 'recurrence_day', type: 'number', isOptional: true },
        { name: 'recurrence_month', type: 'number', isOptional: true },
        { name: 'active', type: 'boolean' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'asset_account_ids', type: 'string', isOptional: true },
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_budgets_workplace_id_check
BEFORE INSERT ON budgets
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on budgets');
END;`,
    }),
    tableSchema({
      name: 'budget_scopes',
      columns: [
        { name: 'budget_id', type: 'string', isIndexed: true },
        { name: 'account_id', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_budget_scopes_workplace_id_check
BEFORE INSERT ON budget_scopes
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on budget_scopes');
END;`,
    }),
    tableSchema({
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
        { name: 'pay_from_account_id', type: 'string', isOptional: true },
        { name: 'min_payment_only', type: 'boolean', isOptional: true },
        { name: 'minimum_payment_percent', type: 'number', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_account_metadata_workplace_id_check
BEFORE INSERT ON account_metadata
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on account_metadata');
END;`,
    }),
    tableSchema({
      name: 'planned_payments',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'amount', type: 'number' },
        { name: 'currency_code', type: 'string', isIndexed: true },
        { name: 'from_account_id', type: 'string', isIndexed: true },
        { name: 'to_account_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'interval_n', type: 'number' },
        { name: 'interval_type', type: 'string' }, // DAILY, WEEKLY, etc.
        { name: 'start_date', type: 'number', isIndexed: true },
        { name: 'end_date', type: 'number', isOptional: true },
        { name: 'next_occurrence', type: 'number', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true }, // ACTIVE, PAUSED, COMPLETED
        { name: 'is_auto_post', type: 'boolean' },
        { name: 'recurrence_day', type: 'number', isOptional: true },
        { name: 'recurrence_month', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_planned_payments_workplace_id_check
BEFORE INSERT ON planned_payments
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on planned_payments');
END;`,
    }),
    tableSchema({
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
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_journal_metadata_workplace_id_check
BEFORE INSERT ON journal_metadata
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on journal_metadata');
END;`,
    }),
    tableSchema({
      name: 'sms_auto_post_rules',
      columns: [
        { name: 'sender_match', type: 'string', isIndexed: true },
        { name: 'body_match', type: 'string', isOptional: true },
        { name: 'conditions_json', type: 'string', isOptional: true },
        { name: 'actions_json', type: 'string', isOptional: true },
        { name: 'priority', type: 'number', isOptional: true, isIndexed: true },
        { name: 'source_account_id', type: 'string', isIndexed: true },
        { name: 'category_account_id', type: 'string', isIndexed: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_sms_auto_post_rules_workplace_id_check
BEFORE INSERT ON sms_auto_post_rules
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on sms_auto_post_rules');
END;`,
    }),
    tableSchema({
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
        { name: 'workplace_id', type: 'string', isIndexed: true },
      ],
      unsafeSql: sql => `${sql};
CREATE TRIGGER IF NOT EXISTS trg_sms_inbox_records_workplace_id_check
BEFORE INSERT ON sms_inbox_records
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on sms_inbox_records');
END;`,
    }),
    tableSchema({
      name: 'workplaces',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'icon', type: 'string', isOptional: true },
        { name: 'default_currency_code', type: 'string', isOptional: false },
      ],
    }),
  ],
});
