import type { AuditEntityType } from '@/src/types/enums';
import type { CanonicalAuditLog } from '@/src/types/importContracts';

export type AuditImportEntityIdMaps = Record<AuditEntityType, ReadonlyMap<string, string>>;

export interface NativeAuditImportIdMaps {
  entities: AuditImportEntityIdMaps;
  auditLogs: ReadonlyMap<string, string>;
}

const ID_MAP_BY_FIELD: Readonly<Record<string, keyof AuditImportEntityIdMaps | 'auditLogs'>> = {
  accountId: 'account',
  accountIds: 'account',
  parentAccountId: 'account',
  sourceAccountId: 'account',
  sourceAccountIds: 'account',
  mergedAccountIds: 'account',
  mergedIntoAccountId: 'account',
  categoryAccountId: 'account',
  targetAccountId: 'account',
  targetAccountIds: 'account',
  fromAccountId: 'account',
  toAccountId: 'account',
  payFromAccountId: 'account',
  assetAccountIds: 'account',
  scopedAccountIds: 'account',
  journalId: 'journal',
  journalIds: 'journal',
  originalJournalId: 'journal',
  reversingJournalId: 'journal',
  sourceJournalId: 'journal',
  sourceJournalIds: 'journal',
  targetJournalId: 'journal',
  linkedJournalId: 'journal',
  duplicateJournalId: 'journal',
  transactionId: 'transaction',
  transactionIds: 'transaction',
  budgetId: 'budget',
  budgetIds: 'budget',
  plannedPaymentId: 'planned_payment',
  plannedPaymentIds: 'planned_payment',
  ruleId: 'transaction_auto_post_rule',
  autoPostRuleId: 'transaction_auto_post_rule',
  transactionAutoPostRuleId: 'transaction_auto_post_rule',
  ruleKey: 'transaction_auto_post_rule',
  inboxRecordId: 'transaction_inbox_record',
  transactionInboxRecordId: 'transaction_inbox_record',
  revertsLogId: 'auditLogs',
};

function remapId(value: string, map: ReadonlyMap<string, string> | undefined): string {
  return map?.get(value) ?? value;
}

function remapValue(
  value: unknown,
  key: string | undefined,
  inheritedMap: ReadonlyMap<string, string> | undefined,
  maps: NativeAuditImportIdMaps,
): { value: unknown; changed: boolean } {
  const fieldMapName = key ? ID_MAP_BY_FIELD[key] : undefined;
  const currentMap = fieldMapName
    ? fieldMapName === 'auditLogs'
      ? maps.auditLogs
      : maps.entities[fieldMapName]
    : inheritedMap;

  if (typeof value === 'string') {
    if (key === 'assetAccountIds') {
      const remapped = value
        .split(',')
        .map(id => remapId(id.trim(), maps.entities.account))
        .join(',');
      return { value: remapped, changed: remapped !== value };
    }
    const remapped = remapId(value, currentMap);
    return { value: remapped, changed: remapped !== value };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const remapped = value.map(item => {
      const result = remapValue(item, key, currentMap, maps);
      changed ||= result.changed;
      return result.value;
    });
    return { value: remapped, changed };
  }

  if (typeof value === 'object' && value !== null) {
    let changed = false;
    const remapped = Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => {
        const result =
          key === 'assetAccountIds'
            ? remapValue(childValue, 'assetAccountIds', maps.entities.account, maps)
            : remapValue(childValue, childKey, currentMap, maps);
        changed ||= result.changed;
        return [childKey, result.value];
      }),
    );
    return { value: remapped, changed };
  }

  return { value, changed: false };
}

/** Remap entity references inside legacy and versioned audit payloads after backup restore. */
export function remapNativeAuditLog(
  log: CanonicalAuditLog,
  maps: NativeAuditImportIdMaps,
): CanonicalAuditLog {
  const entityType = String(log.entityType).toLowerCase() as AuditEntityType;
  const entityIdMap = maps.entities[entityType];
  const entityId = remapId(log.entityId, entityIdMap);
  let changes = log.changes;
  try {
    const parsed: unknown = JSON.parse(log.changes);
    const remapped = remapValue(parsed, undefined, undefined, maps);
    if (remapped.changed) changes = JSON.stringify(remapped.value);
  } catch {
    // Keep historical payloads readable even when an older exporter stored invalid JSON.
  }

  return {
    ...log,
    entityType,
    entityId,
    changes,
  };
}
