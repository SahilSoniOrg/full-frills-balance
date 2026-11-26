import type { AuditEntityType } from '@/src/types/enums';
import type { CanonicalAuditLog } from '@/src/types/importContracts';
import {
  formatFundingAccountIds,
  parseFundingAccountIds,
} from '@/src/domain/budget/fundingAccountIds';

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
  uncategorizedAccountIds: 'account',
  targetAccountId: 'account',
  targetAccountIds: 'account',
  fromAccountId: 'account',
  toAccountId: 'account',
  payFromAccountId: 'account',
  assetAccountIds: 'account',
  scopedAccountIds: 'account',
  journalId: 'journal',
  originatingJournalId: 'journal',
  settlementJournalId: 'journal',
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
  accountMatcherId: 'account_matcher',
  matcherId: 'account_matcher',
  matcherIds: 'account_matcher',
  inboxRecordId: 'transaction_inbox_record',
  transactionInboxRecordId: 'transaction_inbox_record',
  personId: 'person',
  openItemId: 'open_item',
  settlementAllocationId: 'settlement_allocation',
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
    if (key === 'metadataJson') {
      try {
        const result = remapValue(JSON.parse(value), undefined, undefined, maps);
        return result.changed
          ? { value: JSON.stringify(result.value), changed: true }
          : { value, changed: false };
      } catch {
        // Historical audit payloads can contain malformed legacy metadata.
        return { value, changed: false };
      }
    }
    if (key === 'assetAccountIds') {
      const remappedIds = parseFundingAccountIds(value).map(id =>
        remapId(id, maps.entities.account),
      );
      const remapped = remappedIds.length === 0 ? '' : formatFundingAccountIds(remappedIds);
      return { value: remapped, changed: remapped !== value };
    }
    const remapped = remapId(value, currentMap);
    return { value: remapped, changed: remapped !== value };
  }

  if (Array.isArray(value)) {
    // Funding collections in audit snapshots are string[] of account IDs.
    // Remap each element as an ID — do not run the string serializer per item
    // (that would wrap each ID as JSON: ['["new-id"]']).
    if (key === 'assetAccountIds') {
      let changed = false;
      const remapped = value.flatMap(item => {
        if (typeof item !== 'string') return [];
        const sourceIds = parseFundingAccountIds(item);
        const ids = sourceIds.length > 0 ? sourceIds : [item];
        return ids.map(id => {
          const next = remapId(id, maps.entities.account);
          changed ||= next !== id;
          return next;
        });
      });
      return { value: remapped, changed };
    }
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
