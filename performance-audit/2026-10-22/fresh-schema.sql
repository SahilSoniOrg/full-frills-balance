create table "local_storage" ("key" varchar(16) primary key not null, "value" text not null);create index "local_storage_key_index" on "local_storage" ("key");create table "device_sms_inbox_records" ("id" primary key, "_changed", "_status", "device_source_id", "provider_aliases_json", "sender_address", "raw_body", "input_date", "input_fingerprint", "content_digest", "parse_status", "parsed_amount", "parsed_currency_code", "parsed_merchant", "parsed_account_source", "reference_number", "direction", "parse_confidence", "parse_reason", "review_states_json", "notification_state", "notification_group_id", "notification_origin", "notification_workplace_id", "first_seen_at", "last_scanned_at", "created_at", "updated_at");create index if not exists "device_sms_inbox_records_device_source_id" on "device_sms_inbox_records" ("device_source_id");create index if not exists "device_sms_inbox_records_input_date" on "device_sms_inbox_records" ("input_date");create index if not exists "device_sms_inbox_records_input_fingerprint" on "device_sms_inbox_records" ("input_fingerprint");create index if not exists "device_sms_inbox_records_content_digest" on "device_sms_inbox_records" ("content_digest");create index if not exists "device_sms_inbox_records_notification_state" on "device_sms_inbox_records" ("notification_state");create index if not exists "device_sms_inbox_records_notification_group_id" on "device_sms_inbox_records" ("notification_group_id");create index if not exists "device_sms_inbox_records__status" on "device_sms_inbox_records" ("_status");create table "accounts" ("id" primary key, "_changed", "_status", "name", "account_type", "account_subtype", "currency_code", "parent_account_id", "description", "icon", "color", "order_num", "reconciled_at", "created_at", "updated_at", "deleted_at", "archived_at", "workplace_id");create index if not exists "accounts_account_type" on "accounts" ("account_type");create index if not exists "accounts_account_subtype" on "accounts" ("account_subtype");create index if not exists "accounts_currency_code" on "accounts" ("currency_code");create index if not exists "accounts_parent_account_id" on "accounts" ("parent_account_id");create index if not exists "accounts_order_num" on "accounts" ("order_num");create index if not exists "accounts_created_at" on "accounts" ("created_at");create index if not exists "accounts_deleted_at" on "accounts" ("deleted_at");create index if not exists "accounts_archived_at" on "accounts" ("archived_at");create index if not exists "accounts_workplace_id" on "accounts" ("workplace_id");create index if not exists "accounts__status" on "accounts" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_accounts_workplace_id_check
BEFORE INSERT ON accounts
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on accounts');
END;create table "balance_snapshots" ("id" primary key, "_changed", "_status", "account_id", "transaction_id", "transaction_date", "absolute_balance", "transaction_count", "created_at", "updated_at", "workplace_id");create index if not exists "balance_snapshots_account_id" on "balance_snapshots" ("account_id");create index if not exists "balance_snapshots_transaction_id" on "balance_snapshots" ("transaction_id");create index if not exists "balance_snapshots_transaction_date" on "balance_snapshots" ("transaction_date");create index if not exists "balance_snapshots_created_at" on "balance_snapshots" ("created_at");create index if not exists "balance_snapshots_workplace_id" on "balance_snapshots" ("workplace_id");create index if not exists "balance_snapshots__status" on "balance_snapshots" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_balance_snapshots_workplace_id_check
BEFORE INSERT ON balance_snapshots
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on balance_snapshots');
END;create table "currencies" ("id" primary key, "_changed", "_status", "code", "symbol", "name", "precision", "created_at", "updated_at", "deleted_at");create index if not exists "currencies_code" on "currencies" ("code");create index if not exists "currencies_created_at" on "currencies" ("created_at");create index if not exists "currencies_deleted_at" on "currencies" ("deleted_at");create index if not exists "currencies__status" on "currencies" ("_status");create table "journals" ("id" primary key, "_changed", "_status", "journal_date", "description", "notes", "currency_code", "status", "original_journal_id", "reversing_journal_id", "total_amount", "transaction_count", "display_type", "planned_payment_id", "created_at", "updated_at", "deleted_at", "workplace_id");create index if not exists "journals_journal_date" on "journals" ("journal_date");create index if not exists "journals_description" on "journals" ("description");create index if not exists "journals_currency_code" on "journals" ("currency_code");create index if not exists "journals_status" on "journals" ("status");create index if not exists "journals_original_journal_id" on "journals" ("original_journal_id");create index if not exists "journals_reversing_journal_id" on "journals" ("reversing_journal_id");create index if not exists "journals_planned_payment_id" on "journals" ("planned_payment_id");create index if not exists "journals_created_at" on "journals" ("created_at");create index if not exists "journals_deleted_at" on "journals" ("deleted_at");create index if not exists "journals_workplace_id" on "journals" ("workplace_id");create index if not exists "journals__status" on "journals" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_journals_workplace_id_check
BEFORE INSERT ON journals
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on journals');
END;

-- P0 Compound Index for Journal List status filtering
CREATE INDEX IF NOT EXISTS idx_journals_active_wp_status ON journals (workplace_id, deleted_at, status);
create table "transactions" ("id" primary key, "_changed", "_status", "journal_id", "account_id", "amount", "transaction_type", "currency_code", "transaction_date", "notes", "exchange_rate", "running_balance", "created_at", "updated_at", "deleted_at", "workplace_id");create index if not exists "transactions_journal_id" on "transactions" ("journal_id");create index if not exists "transactions_account_id" on "transactions" ("account_id");create index if not exists "transactions_amount" on "transactions" ("amount");create index if not exists "transactions_currency_code" on "transactions" ("currency_code");create index if not exists "transactions_transaction_date" on "transactions" ("transaction_date");create index if not exists "transactions_running_balance" on "transactions" ("running_balance");create index if not exists "transactions_created_at" on "transactions" ("created_at");create index if not exists "transactions_deleted_at" on "transactions" ("deleted_at");create index if not exists "transactions_workplace_id" on "transactions" ("workplace_id");create index if not exists "transactions__status" on "transactions" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_transactions_workplace_id_check
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on transactions');
END;

-- P0 Compound Index for Dashboard/Account List hydration
CREATE INDEX IF NOT EXISTS idx_transactions_active_wp_date ON transactions (workplace_id, deleted_at, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions (account_id, deleted_at, transaction_date);
create table "exchange_rates" ("id" primary key, "_changed", "_status", "from_currency", "to_currency", "rate", "effective_date", "requested_date", "source", "created_at", "updated_at");create index if not exists "exchange_rates_from_currency" on "exchange_rates" ("from_currency");create index if not exists "exchange_rates_to_currency" on "exchange_rates" ("to_currency");create index if not exists "exchange_rates_effective_date" on "exchange_rates" ("effective_date");create index if not exists "exchange_rates_requested_date" on "exchange_rates" ("requested_date");create index if not exists "exchange_rates_created_at" on "exchange_rates" ("created_at");create index if not exists "exchange_rates__status" on "exchange_rates" ("_status");create table "audit_logs" ("id" primary key, "_changed", "_status", "entity_type", "entity_id", "action", "changes", "timestamp", "created_at", "workplace_id", "source", "event_type", "correlation_id");create index if not exists "audit_logs_entity_type" on "audit_logs" ("entity_type");create index if not exists "audit_logs_entity_id" on "audit_logs" ("entity_id");create index if not exists "audit_logs_timestamp" on "audit_logs" ("timestamp");create index if not exists "audit_logs_workplace_id" on "audit_logs" ("workplace_id");create index if not exists "audit_logs__status" on "audit_logs" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_audit_logs_workplace_id_check
BEFORE INSERT ON audit_logs
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on audit_logs');
END;

CREATE INDEX IF NOT EXISTS idx_audit_logs_workplace_timeline
ON audit_logs (workplace_id, timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workplace_entity_timeline
ON audit_logs (workplace_id, entity_type, entity_id, timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workplace_type_timeline
ON audit_logs (workplace_id, entity_type, timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workplace_source_timeline
ON audit_logs (workplace_id, source, timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workplace_event_timeline
ON audit_logs (workplace_id, event_type, timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workplace_correlation_timeline
ON audit_logs (workplace_id, correlation_id, timestamp DESC, id DESC);create table "budgets" ("id" primary key, "_changed", "_status", "name", "amount", "currency_code", "start_month", "interval_type", "interval_n", "start_date", "recurrence_day", "recurrence_month", "active", "created_at", "updated_at", "asset_account_ids", "workplace_id");create index if not exists "budgets_currency_code" on "budgets" ("currency_code");create index if not exists "budgets_start_month" on "budgets" ("start_month");create index if not exists "budgets_created_at" on "budgets" ("created_at");create index if not exists "budgets_workplace_id" on "budgets" ("workplace_id");create index if not exists "budgets__status" on "budgets" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_budgets_workplace_id_check
BEFORE INSERT ON budgets
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on budgets');
END;create table "budget_scopes" ("id" primary key, "_changed", "_status", "budget_id", "account_id", "created_at", "updated_at", "workplace_id");create index if not exists "budget_scopes_budget_id" on "budget_scopes" ("budget_id");create index if not exists "budget_scopes_account_id" on "budget_scopes" ("account_id");create index if not exists "budget_scopes_created_at" on "budget_scopes" ("created_at");create index if not exists "budget_scopes_workplace_id" on "budget_scopes" ("workplace_id");create index if not exists "budget_scopes__status" on "budget_scopes" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_budget_scopes_workplace_id_check
BEFORE INSERT ON budget_scopes
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on budget_scopes');
END;create table "account_metadata" ("id" primary key, "_changed", "_status", "account_id", "statement_day", "due_day", "minimum_payment_amount", "minimum_balance_amount", "credit_limit_amount", "apr_bps", "emi_day", "loan_tenure_months", "autopay_enabled", "grace_period_days", "pay_from_account_id", "min_payment_only", "minimum_payment_percent", "notes", "created_at", "updated_at", "workplace_id");create index if not exists "account_metadata_account_id" on "account_metadata" ("account_id");create index if not exists "account_metadata_created_at" on "account_metadata" ("created_at");create index if not exists "account_metadata_workplace_id" on "account_metadata" ("workplace_id");create index if not exists "account_metadata__status" on "account_metadata" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_account_metadata_workplace_id_check
BEFORE INSERT ON account_metadata
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on account_metadata');
END;create table "planned_payments" ("id" primary key, "_changed", "_status", "name", "description", "amount", "fx_mode", "destination_amount", "currency_code", "from_account_id", "to_account_id", "interval_n", "interval_type", "start_date", "end_date", "next_occurrence", "status", "is_auto_post", "recurrence_day", "recurrence_month", "created_at", "updated_at", "deleted_at", "workplace_id");create index if not exists "planned_payments_currency_code" on "planned_payments" ("currency_code");create index if not exists "planned_payments_from_account_id" on "planned_payments" ("from_account_id");create index if not exists "planned_payments_to_account_id" on "planned_payments" ("to_account_id");create index if not exists "planned_payments_start_date" on "planned_payments" ("start_date");create index if not exists "planned_payments_next_occurrence" on "planned_payments" ("next_occurrence");create index if not exists "planned_payments_status" on "planned_payments" ("status");create index if not exists "planned_payments_created_at" on "planned_payments" ("created_at");create index if not exists "planned_payments_deleted_at" on "planned_payments" ("deleted_at");create index if not exists "planned_payments_workplace_id" on "planned_payments" ("workplace_id");create index if not exists "planned_payments__status" on "planned_payments" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_planned_payments_workplace_id_check
BEFORE INSERT ON planned_payments
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on planned_payments');
END;create table "journal_metadata" ("id" primary key, "_changed", "_status", "journal_id", "import_source", "original_sms_id", "original_sms_sender", "original_sms_body", "metadata_json", "reference_number", "created_at", "updated_at", "workplace_id");create index if not exists "journal_metadata_journal_id" on "journal_metadata" ("journal_id");create index if not exists "journal_metadata_reference_number" on "journal_metadata" ("reference_number");create index if not exists "journal_metadata_created_at" on "journal_metadata" ("created_at");create index if not exists "journal_metadata_workplace_id" on "journal_metadata" ("workplace_id");create index if not exists "journal_metadata__status" on "journal_metadata" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_journal_metadata_workplace_id_check
BEFORE INSERT ON journal_metadata
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on journal_metadata');
END;create table "transaction_auto_post_rules" ("id" primary key, "_changed", "_status", "channels_json", "sender_match", "body_match", "conditions_json", "actions_json", "priority", "source_account_id", "category_account_id", "is_active", "created_at", "updated_at", "workplace_id");create index if not exists "transaction_auto_post_rules_sender_match" on "transaction_auto_post_rules" ("sender_match");create index if not exists "transaction_auto_post_rules_priority" on "transaction_auto_post_rules" ("priority");create index if not exists "transaction_auto_post_rules_source_account_id" on "transaction_auto_post_rules" ("source_account_id");create index if not exists "transaction_auto_post_rules_category_account_id" on "transaction_auto_post_rules" ("category_account_id");create index if not exists "transaction_auto_post_rules_created_at" on "transaction_auto_post_rules" ("created_at");create index if not exists "transaction_auto_post_rules_workplace_id" on "transaction_auto_post_rules" ("workplace_id");create index if not exists "transaction_auto_post_rules__status" on "transaction_auto_post_rules" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_transaction_auto_post_rules_workplace_id_check
BEFORE INSERT ON transaction_auto_post_rules
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on transaction_auto_post_rules');
END;create table "transaction_inbox_records" ("id" primary key, "_changed", "_status", "channel", "device_source_id", "sender_address", "raw_body", "input_date", "input_fingerprint", "parse_status", "parsed_amount", "parsed_currency_code", "parsed_merchant", "parsed_account_source", "reference_number", "direction", "processing_status", "linked_journal_id", "duplicate_journal_id", "duplicate_confidence", "parse_confidence", "parse_reason", "metadata_json", "first_seen_at", "last_scanned_at", "processed_at", "created_at", "updated_at", "workplace_id");create index if not exists "transaction_inbox_records_channel" on "transaction_inbox_records" ("channel");create index if not exists "transaction_inbox_records_device_source_id" on "transaction_inbox_records" ("device_source_id");create index if not exists "transaction_inbox_records_sender_address" on "transaction_inbox_records" ("sender_address");create index if not exists "transaction_inbox_records_input_date" on "transaction_inbox_records" ("input_date");create index if not exists "transaction_inbox_records_input_fingerprint" on "transaction_inbox_records" ("input_fingerprint");create index if not exists "transaction_inbox_records_parse_status" on "transaction_inbox_records" ("parse_status");create index if not exists "transaction_inbox_records_direction" on "transaction_inbox_records" ("direction");create index if not exists "transaction_inbox_records_processing_status" on "transaction_inbox_records" ("processing_status");create index if not exists "transaction_inbox_records_linked_journal_id" on "transaction_inbox_records" ("linked_journal_id");create index if not exists "transaction_inbox_records_duplicate_journal_id" on "transaction_inbox_records" ("duplicate_journal_id");create index if not exists "transaction_inbox_records_first_seen_at" on "transaction_inbox_records" ("first_seen_at");create index if not exists "transaction_inbox_records_last_scanned_at" on "transaction_inbox_records" ("last_scanned_at");create index if not exists "transaction_inbox_records_processed_at" on "transaction_inbox_records" ("processed_at");create index if not exists "transaction_inbox_records_created_at" on "transaction_inbox_records" ("created_at");create index if not exists "transaction_inbox_records_workplace_id" on "transaction_inbox_records" ("workplace_id");create index if not exists "transaction_inbox_records__status" on "transaction_inbox_records" ("_status");;
CREATE TRIGGER IF NOT EXISTS trg_transaction_inbox_records_workplace_id_check
BEFORE INSERT ON transaction_inbox_records
FOR EACH ROW
WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
BEGIN
  SELECT RAISE(ABORT, 'Workplace ID cannot be empty on transaction_inbox_records');
END;create table "workplaces" ("id" primary key, "_changed", "_status", "name", "created_at", "updated_at", "icon", "default_currency_code");create index if not exists "workplaces_created_at" on "workplaces" ("created_at");create index if not exists "workplaces__status" on "workplaces" ("_status");