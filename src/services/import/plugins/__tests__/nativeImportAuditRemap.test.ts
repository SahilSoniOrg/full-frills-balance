import { AUDIT_ENTITY_TYPES } from '@/src/types/enums';
import type { CanonicalAuditLog } from '@/src/types/importContracts';

import { remapNativeAuditLog } from '@/src/services/import/plugins/nativeImportAuditRemap';

function emptyEntityMaps() {
  return Object.fromEntries(
    AUDIT_ENTITY_TYPES.map(type => [type, new Map<string, string>()]),
  ) as Record<(typeof AUDIT_ENTITY_TYPES)[number], Map<string, string>>;
}

function budgetLog(changes: unknown): CanonicalAuditLog {
  return {
    id: 'log-1',
    entityType: 'budget',
    entityId: 'budget-1',
    action: 'update',
    changes: JSON.stringify(changes),
    timestamp: 1,
  };
}

describe('remapNativeAuditLog funding account IDs', () => {
  it('remaps assetAccountIds string collections through JSON persist form', () => {
    const account = new Map([
      ['old-a', 'new-a'],
      ['old-b', 'new-b'],
    ]);
    const remapped = remapNativeAuditLog(budgetLog({ assetAccountIds: '["old-a","old-b"]' }), {
      entities: { ...emptyEntityMaps(), account },
      auditLogs: new Map(),
    });
    expect(JSON.parse(String(remapped.changes))).toEqual({
      assetAccountIds: '["new-a","new-b"]',
    });
  });

  it('remaps assetAccountIds arrays element-by-element without double-encoding', () => {
    const account = new Map([['old-id', 'new-id']]);
    const remapped = remapNativeAuditLog(
      budgetLog({
        before: { assetAccountIds: ['old-id'] },
        after: { assetAccountIds: ['old-id'] },
      }),
      { entities: { ...emptyEntityMaps(), account }, auditLogs: new Map() },
    );
    expect(JSON.parse(String(remapped.changes))).toEqual({
      before: { assetAccountIds: ['new-id'] },
      after: { assetAccountIds: ['new-id'] },
    });
  });
});
