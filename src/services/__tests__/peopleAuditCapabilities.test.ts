import { AUDIT_ENTITY_CAPABILITIES } from '@/src/types/auditEntityCapabilities';
import { AUDIT_ENTITY_TYPES } from '@/src/types/enums';
import { registerAuditHandlers } from '@/src/services/audit-handlers';
import { revertRegistry } from '@/src/services/revert-registry';

describe('People audit capabilities', () => {
  it('declares a capability for every audit type and registers all undo handlers', () => {
    expect(Object.keys(AUDIT_ENTITY_CAPABILITIES).sort()).toEqual([...AUDIT_ENTITY_TYPES].sort());
    expect(AUDIT_ENTITY_CAPABILITIES.person.revertHandler).toBe('none');
    expect(AUDIT_ENTITY_CAPABILITIES.open_item.revertHandler).toBe('none');
    expect(AUDIT_ENTITY_CAPABILITIES.settlement_allocation.revertHandler).toBe('none');
    expect(() => registerAuditHandlers()).not.toThrow();
    expect(revertRegistry.getRegisteredEntityTypes().sort()).toEqual(
      Object.entries(AUDIT_ENTITY_CAPABILITIES).filter(([, value]) => value.revertHandler !== 'none').map(([key]) => key).sort(),
    );
  });
});
