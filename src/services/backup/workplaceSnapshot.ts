import { parseObject, assertAllowedKeys } from '@/src/utils/strictObject';
import { schema } from '@/src/data/database/schema';
import { exportRepository } from '@/src/data/repositories/ExportRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { fetchAndTransformTable } from '@/src/services/export/exportTableTransformer';
import { validateImportedData } from '@/src/services/import/validateImportedData';
import { preferences } from '@/src/services/preferences';
import { currencyReadService } from '@/src/services/currency-read-service';
import type { BatchImportData } from '@/src/types/importContracts';
import type { WorkplaceId } from '@/src/types/ids';
import {
  AccountType,
  AuditAction,
  AUDIT_ENTITY_TYPES,
  InboxParseStatus,
  InboxProcessingStatus,
  JournalDisplayType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionDirection,
  TransactionType,
} from '@/src/types/enums';
import { snakeToCamel } from '@/src/utils/serialization';
import { sanitizeSmsAuditChanges, sanitizeSmsMetadataJson } from '@/src/utils/smsPrivateMetadata';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';

export const WORKPLACE_SNAPSHOT_FORMAT = 'full-frills-workplace-snapshot' as const;
export const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const MAX_SNAPSHOT_RECORDS = 100_000;

type SnapshotData = Pick<
  BatchImportData,
  | 'accounts'
  | 'journals'
  | 'transactions'
  | 'auditLogs'
  | 'budgets'
  | 'budgetScopes'
  | 'accountMetadata'
  | 'plannedPayments'
  | 'journalMetadata'
  | 'transactionAutoPostRules'
  | 'transactionInboxRecords'
>;

export interface WorkplaceSnapshot {
  readonly format: typeof WORKPLACE_SNAPSHOT_FORMAT;
  readonly formatVersion: 1;
  readonly schemaVersion: number;
  readonly capturedAt: number;
  readonly workplace: {
    readonly id: string;
    readonly name: string;
    readonly icon: string;
    readonly defaultCurrencyCode: string;
  };
  readonly bookPreferences: { readonly safeToSpendDays: number };
  readonly currencyPrecisions: Readonly<Record<string, number>>;
  readonly data: SnapshotData;
}

// Format-v1 allowlist: adding a database column does not silently add it to a cloud payload.
// No Device feed/settings, balance projections, or global exchange-rate cache.
export const SNAPSHOT_TABLES = [
  {
    key: 'accounts',
    table: 'accounts',
    fields:
      'name account_type account_subtype currency_code parent_account_id description icon color order_num reconciled_at archived_at created_at updated_at deleted_at',
  },
  {
    key: 'journals',
    table: 'journals',
    fields:
      'journal_date description notes currency_code status original_journal_id reversing_journal_id total_amount transaction_count display_type planned_payment_id created_at updated_at deleted_at',
  },
  {
    key: 'transactions',
    table: 'transactions',
    fields:
      'journal_id account_id amount transaction_type currency_code transaction_date notes exchange_rate created_at updated_at deleted_at',
  },
  {
    key: 'auditLogs',
    table: 'audit_logs',
    fields: 'entity_type entity_id action changes timestamp created_at',
  },
  {
    key: 'budgets',
    table: 'budgets',
    fields:
      'name amount currency_code start_month interval_type interval_n start_date recurrence_day recurrence_month active asset_account_ids created_at updated_at',
  },
  {
    key: 'budgetScopes',
    table: 'budget_scopes',
    fields: 'budget_id account_id created_at updated_at',
  },
  {
    key: 'accountMetadata',
    table: 'account_metadata',
    fields:
      'account_id statement_day due_day minimum_payment_amount minimum_balance_amount credit_limit_amount apr_bps emi_day loan_tenure_months autopay_enabled grace_period_days pay_from_account_id min_payment_only minimum_payment_percent notes created_at updated_at',
  },
  {
    key: 'plannedPayments',
    table: 'planned_payments',
    fields:
      'name description amount fx_mode destination_amount currency_code from_account_id to_account_id interval_n interval_type start_date end_date next_occurrence status is_auto_post recurrence_day recurrence_month created_at updated_at deleted_at',
  },
  {
    key: 'journalMetadata',
    table: 'journal_metadata',
    fields:
      'journal_id import_source original_sms_id metadata_json reference_number created_at updated_at',
  },
  {
    key: 'transactionAutoPostRules',
    table: 'transaction_auto_post_rules',
    fields:
      'channels_json sender_match body_match conditions_json actions_json priority source_account_id category_account_id is_active created_at updated_at',
  },
  {
    key: 'transactionInboxRecords',
    table: 'transaction_inbox_records',
    fields:
      'channel device_source_id input_date input_fingerprint parse_status parsed_amount parsed_currency_code parsed_merchant parsed_account_source reference_number direction processing_status linked_journal_id duplicate_journal_id duplicate_confidence parse_confidence metadata_json first_seen_at last_scanned_at processed_at created_at updated_at',
  },
] as const;

function identity(value: unknown): boolean {
  return typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(value);
}

function oneOf(value: unknown, values: Record<string, string>, label: string): void {
  if (!Object.values(values).some(candidate => candidate === value)) {
    throw new Error(`Invalid snapshot ${label}`);
  }
}

function validateEnums(table: string, row: Record<string, unknown>): void {
  if (table === 'accounts') oneOf(row.accountType, AccountType, 'account type');
  if (table === 'audit_logs') {
    oneOf(row.action, AuditAction, 'audit action');
    if (!AUDIT_ENTITY_TYPES.some(entity => entity === row.entityType))
      throw new Error('Invalid snapshot audit entity');
    if (typeof row.changes !== 'string' || sanitizeSmsAuditChanges(row.changes) !== row.changes) {
      throw new Error('Invalid or unfiltered snapshot audit changes');
    }
  }
  if (table === 'journals') {
    oneOf(row.status, JournalStatus, 'journal status');
    oneOf(row.displayType, JournalDisplayType, 'journal display type');
  }
  if (table === 'transactions') oneOf(row.transactionType, TransactionType, 'transaction type');
  if (table === 'planned_payments') {
    oneOf(row.status, PlannedPaymentStatus, 'payment status');
    oneOf(row.intervalType, PlannedPaymentInterval, 'payment interval');
    if (
      row.fxMode !== undefined &&
      !['automatic', 'fixed', 'manual'].includes(String(row.fxMode))
    ) {
      throw new Error('Invalid snapshot FX mode');
    }
  }
  if (table === 'transaction_inbox_records') {
    oneOf(row.parseStatus, InboxParseStatus, 'inbox parse status');
    oneOf(row.processingStatus, InboxProcessingStatus, 'inbox processing status');
    oneOf(row.direction, TransactionDirection, 'inbox direction');
  }
}

/** Strict trust boundary: validates primitive shapes and references, with no import salvage. */
export function parseWorkplaceSnapshot(value: unknown): WorkplaceSnapshot {
  const snapshot = parseObject(value, 'Invalid snapshot envelope');
  assertAllowedKeys(
    snapshot,
    [
      'format',
      'formatVersion',
      'schemaVersion',
      'capturedAt',
      'workplace',
      'bookPreferences',
      'currencyPrecisions',
      'data',
    ],
    'Unsupported snapshot field in envelope',
  );
  if (
    snapshot.format !== WORKPLACE_SNAPSHOT_FORMAT ||
    snapshot.formatVersion !== 1 ||
    snapshot.schemaVersion !== schema.version
  )
    throw new Error('Unsupported Workplace snapshot version');
  if (
    typeof snapshot.capturedAt !== 'number' ||
    !Number.isSafeInteger(snapshot.capturedAt) ||
    snapshot.capturedAt < 0
  ) {
    throw new Error('Invalid snapshot capture time');
  }
  const workplace = parseObject(snapshot.workplace, 'Invalid snapshot Workplace');
  assertAllowedKeys(
    workplace,
    ['id', 'name', 'icon', 'defaultCurrencyCode'],
    'Unsupported snapshot field in Workplace',
  );
  if (
    !identity(workplace.id) ||
    ['name', 'icon', 'defaultCurrencyCode'].some(
      key => typeof workplace[key] !== 'string' || !workplace[key].trim(),
    )
  )
    throw new Error('Invalid snapshot Workplace identity');
  const settings = parseObject(snapshot.bookPreferences, 'Invalid snapshot book preferences');
  assertAllowedKeys(
    settings,
    ['safeToSpendDays'],
    'Unsupported snapshot field in book preferences',
  );
  if (![30, 60, 90].some(days => days === settings.safeToSpendDays))
    throw new Error('Invalid snapshot spending horizon');
  const data = parseObject(snapshot.data, 'Invalid snapshot data');
  assertAllowedKeys(
    data,
    SNAPSHOT_TABLES.map(entry => entry.key),
    'Unsupported snapshot field in data',
  );
  let count = 0;
  for (const { key, table, fields } of SNAPSHOT_TABLES) {
    const rows = data[key];
    if (!Array.isArray(rows)) throw new Error(`Missing snapshot table ${key}`);
    count += rows.length;
    if (count > MAX_SNAPSHOT_RECORDS) throw new Error('Workplace snapshot has too many records');
    const columns = fields.split(' ').map(name => schema.tables[table].columns[name]);
    const seenIds = new Set<string>();
    for (const value of rows) {
      const row = parseObject(value, `Invalid snapshot ${key}`);
      assertAllowedKeys(
        row,
        ['id', ...columns.map(column => snakeToCamel(column.name))],
        `Unsupported snapshot field in ${key}`,
      );
      if (!identity(row.id)) throw new Error(`Invalid snapshot ${key} identity`);
      if (seenIds.has(String(row.id))) throw new Error(`duplicate snapshot ${key} identity`);
      seenIds.add(String(row.id));
      for (const column of columns) {
        const field = snakeToCamel(column.name);
        const entry = row[field];
        if (entry === undefined && column.isOptional) continue;
        if (
          typeof entry !== column.type ||
          (typeof entry === 'number' && !Number.isFinite(entry))
        ) {
          throw new Error(`Invalid snapshot ${key}.${field}`);
        }
      }
      validateEnums(table, row);
      if (
        typeof row.metadataJson === 'string' &&
        sanitizeSmsMetadataJson(row.metadataJson, true) !== row.metadataJson
      ) {
        throw new Error('Snapshot metadata contains invalid or unfiltered source content');
      }
    }
  }
  // The schema/allowlist checks above establish the canonical primitive record shapes.
  const validated = value as WorkplaceSnapshot;
  validateImportedData(validated.data);
  const precisions = parseObject(
    snapshot.currencyPrecisions,
    'Invalid snapshot currency precisions',
  );
  const codes = snapshotCurrencyCodes(validated);
  assertAllowedKeys(precisions, codes, 'Unsupported snapshot field in currency precisions');
  for (const code of codes) {
    const precision = precisions[code];
    if (
      typeof precision !== 'number' ||
      !Number.isInteger(precision) ||
      precision < 0 ||
      precision > 8
    ) {
      throw new Error('Invalid snapshot currency precision');
    }
  }
  const journals = new Set(validated.data.journals.map(journal => journal.id));
  for (const journal of validated.data.journals) {
    for (const linked of [journal.originalJournalId, journal.reversingJournalId]) {
      if (linked && !journals.has(linked))
        throw new Error('Snapshot reversal references a missing journal');
    }
  }
  return validated;
}

/** Captures one Workplace in memory. This function does not encrypt, upload, or write a file. */
export async function captureWorkplaceSnapshot(
  workplaceId: WorkplaceId,
): Promise<WorkplaceSnapshot> {
  return exportRepository.captureConsistently(async () => {
    const safeToSpendDays = preferences.workplace.getSnapshot(workplaceId).safeToSpendDays;
    const workplace = await workplaceRepository.find(workplaceId);
    if (!workplace) throw new Error('Workplace not found for snapshot');
    const data: Record<string, Record<string, unknown>[]> = {};
    for (const { key, table, fields } of SNAPSHOT_TABLES) {
      const rows = await fetchAndTransformTable<Record<string, unknown>>(
        workplaceId,
        table,
        undefined,
        { dateFormat: 'timestamp', includeSmsSources: false, includeDeleted: true },
      );
      const names = ['id', ...fields.split(' ').map(snakeToCamel)];
      data[key] = rows
        .filter(
          row =>
            table !== 'transaction_inbox_records' ||
            row.channel !== 'sms' ||
            ['imported', 'auto_posted', 'dismissed'].includes(String(row.processingStatus)),
        )
        .map(row => {
          const result = Object.fromEntries(
            names.flatMap(name => (row[name] == null ? [] : [[name, row[name]]])),
          );
          if (typeof result.metadataJson === 'string') {
            const cleaned = sanitizeSmsMetadataJson(result.metadataJson, true);
            if (cleaned === undefined)
              throw new Error('Invalid source metadata in Workplace snapshot');
            result.metadataJson = cleaned;
          }
          if (typeof result.inputFingerprint === 'string')
            result.inputFingerprint = hashLegacySmsFingerprint(result.inputFingerprint);
          if (typeof result.changes === 'string' && table === 'audit_logs') {
            const cleaned = sanitizeSmsAuditChanges(result.changes);
            if (cleaned === undefined)
              throw new Error('Invalid audit changes in Workplace snapshot');
            result.changes = cleaned;
          }
          return result;
        });
    }
    const source = {
      format: WORKPLACE_SNAPSHOT_FORMAT,
      formatVersion: 1,
      schemaVersion: schema.version,
      capturedAt: Date.now(),
      workplace: {
        id: workplace.id,
        name: workplace.name,
        icon: workplace.icon,
        defaultCurrencyCode: workplace.defaultCurrencyCode,
      },
      bookPreferences: { safeToSpendDays },
      data,
    };
    // All money rows carry a currency code. Capture interpretation, not a mutable rates cache.
    const codes = new Set([workplace.defaultCurrencyCode]);
    for (const rows of Object.values(data))
      for (const row of rows) {
        if (typeof row.currencyCode === 'string') codes.add(row.currencyCode);
      }
    const currencyPrecisions = Object.fromEntries(
      await Promise.all(
        [...codes].map(async code => [code, await currencyReadService.getPrecision(code)] as const),
      ),
    );
    return parseWorkplaceSnapshot({ ...source, currencyPrecisions });
  });
}

function snapshotCurrencyCodes(snapshot: WorkplaceSnapshot): string[] {
  return [
    ...new Set([
      snapshot.workplace.defaultCurrencyCode,
      ...snapshot.data.accounts.map(row => row.currencyCode),
      ...snapshot.data.journals.map(row => row.currencyCode),
      ...snapshot.data.transactions.map(row => row.currencyCode),
      ...(snapshot.data.budgets ?? []).map(row => row.currencyCode),
      ...(snapshot.data.plannedPayments ?? []).map(row => row.currencyCode),
    ]),
  ];
}

export function serializeWorkplaceSnapshot(snapshot: WorkplaceSnapshot): string {
  const serialized = JSON.stringify(parseWorkplaceSnapshot(snapshot));
  if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error('Workplace snapshot exceeds the supported size');
  }
  return serialized;
}

export function decodeWorkplaceSnapshot(serialized: string): WorkplaceSnapshot {
  if (
    serialized.length > MAX_SNAPSHOT_BYTES ||
    new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES
  ) {
    throw new Error('Workplace snapshot exceeds the supported size');
  }
  return parseWorkplaceSnapshot(JSON.parse(serialized));
}
