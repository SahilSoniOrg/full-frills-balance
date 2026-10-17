/** Outgoing projection and privacy policy. All runtime inputs are plain data. */
import type { RowSourceRecord, PhysicalRowTable } from './rowRecords';
import { validateEnum, validId } from './workplaceRowValidation';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import { sanitizeSmsAuditChanges, sanitizeSmsMetadataJson } from '@/src/utils/smsPrivateMetadata';

/** These names and columns are the V1 allowlist, retained as the row plaintext contract. */
export const TABLE_COLUMNS = {
  accounts:
    'name account_type account_subtype currency_code parent_account_id description icon color order_num reconciled_at archived_at created_at updated_at deleted_at',
  journals:
    'journal_date description notes currency_code status original_journal_id reversing_journal_id total_amount transaction_count display_type planned_payment_id created_at updated_at deleted_at',
  transactions:
    'journal_id account_id amount transaction_type currency_code transaction_date notes exchange_rate created_at updated_at deleted_at',
  audit_logs: 'entity_type entity_id action changes timestamp created_at',
  budgets:
    'name amount currency_code start_month interval_type interval_n start_date recurrence_day recurrence_month active asset_account_ids created_at updated_at',
  budget_scopes: 'budget_id account_id created_at updated_at',
  account_metadata:
    'account_id statement_day due_day minimum_payment_amount minimum_balance_amount credit_limit_amount apr_bps emi_day loan_tenure_months autopay_enabled grace_period_days pay_from_account_id min_payment_only minimum_payment_percent notes created_at updated_at',
  planned_payments:
    'name description amount fx_mode destination_amount currency_code from_account_id to_account_id interval_n interval_type start_date end_date next_occurrence status is_auto_post recurrence_day recurrence_month created_at updated_at deleted_at',
  journal_metadata:
    'journal_id import_source original_sms_id metadata_json reference_number created_at updated_at',
  transaction_auto_post_rules:
    'channels_json sender_match body_match conditions_json actions_json priority source_account_id category_account_id is_active created_at updated_at',
  transaction_inbox_records:
    'channel device_source_id input_date input_fingerprint parse_status parsed_amount parsed_currency_code parsed_merchant parsed_account_source reference_number direction processing_status linked_journal_id duplicate_journal_id duplicate_confidence parse_confidence metadata_json first_seen_at last_scanned_at processed_at created_at updated_at',
} as const;
export type { PhysicalRowTable } from './rowRecords';

export type PhysicalColumn = Readonly<{ name: string; type: 'string' | 'number' | 'boolean' }>;

export function cleanPhysicalRow(
  table: PhysicalRowTable,
  raw: Readonly<Record<string, unknown>>,
  columns: readonly PhysicalColumn[],
): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const column of columns) {
    const name = column.name;
    const value = raw[name];
    if (value == null) continue; // V1 omitted SQL nulls, including optional columns.
    const normalized = column.type === 'boolean' ? Boolean(value) : value;
    if (
      typeof normalized !== column.type ||
      (typeof normalized === 'number' && !Number.isFinite(normalized))
    ) {
      throw new Error(`Invalid row ${table}.${name}`);
    }
    content[name] = normalized;
  }
  if (typeof content.metadataJson === 'string') {
    const cleaned = sanitizeSmsMetadataJson(content.metadataJson, true);
    if (cleaned === undefined) throw new Error('Invalid source metadata in workplace state');
    content.metadataJson = cleaned;
  }
  if (typeof content.inputFingerprint === 'string')
    content.inputFingerprint = hashLegacySmsFingerprint(content.inputFingerprint);
  if (table === 'audit_logs' && typeof content.changes === 'string') {
    const cleaned = sanitizeSmsAuditChanges(content.changes);
    if (cleaned === undefined) throw new Error('Invalid audit changes in workplace state');
    content.changes = cleaned;
  }
  validateEnum(table, content);
  return content;
}

/** Preserve cleaning/enum failures even for rows subsequently excluded by SMS policy. */
export function preparePhysicalRow(
  table: PhysicalRowTable,
  raw: Readonly<Record<string, unknown>>,
  columns: readonly PhysicalColumn[],
): RowSourceRecord | undefined {
  const content = cleanPhysicalRow(table, raw, columns);
  if (
    table === 'transaction_inbox_records' &&
    content.channel === 'sms' &&
    !['imported', 'auto_posted', 'dismissed'].includes(String(content.processingStatus))
  )
    return undefined;
  const id = raw.id;
  if (!validId(id)) throw new Error(`Invalid ${table} row identity`);
  const updatedAt = content.updatedAt ?? content.timestamp ?? content.createdAt;
  if (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0)
    throw new Error(`Invalid ${table} updatedAt`);
  return { table, rowId: id, updatedAt, deleted: false, content };
}

export function collectCurrencyCodes(
  defaultCurrencyCode: string,
  rows: readonly RowSourceRecord[],
): readonly string[] {
  return [
    ...new Set([
      defaultCurrencyCode,
      ...rows.flatMap(row =>
        typeof row.content.currencyCode === 'string' ? [row.content.currencyCode] : [],
      ),
    ]),
  ];
}

export function prepareWorkplaceMetadata(
  workplace: Readonly<{
    id: string;
    updatedAt: number;
    name: string;
    icon: string;
    defaultCurrencyCode: string;
  }>,
  safeToSpendDays: number,
  currencyPrecisions: Readonly<Record<string, number>>,
): RowSourceRecord {
  return {
    table: 'workplace',
    rowId: workplace.id,
    updatedAt: workplace.updatedAt,
    deleted: false,
    content: {
      name: workplace.name,
      icon: workplace.icon,
      defaultCurrencyCode: workplace.defaultCurrencyCode,
      safeToSpendDays,
      currencyPrecisions: { ...currencyPrecisions },
    },
  };
}
