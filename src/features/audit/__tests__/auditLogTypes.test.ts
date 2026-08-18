import { AuditAction, AccountId } from '@/src/types/domain';
import {
  AuditLogEntry,
  computeCanRevert,
  getEntityDisplayName,
  hasBeforeAfterChanges,
  parseAuditChanges,
} from '@/src/features/audit/auditLogTypes';

describe('auditLogTypes', () => {
  describe('parseAuditChanges', () => {
    it('parses valid before/after JSON', () => {
      const raw = JSON.stringify({
        before: { amount: 10 },
        after: { amount: 20 },
      });
      const parsed = parseAuditChanges(raw);
      expect(parsed).not.toBeNull();
      expect(hasBeforeAfterChanges(parsed!)).toBe(true);
    });

    it('returns null for invalid JSON', () => {
      expect(parseAuditChanges('not-json')).toBeNull();
    });

    it('returns null for non-object JSON', () => {
      expect(parseAuditChanges('"hello"')).toBeNull();
    });
  });

  describe('getEntityDisplayName', () => {
    it('prefers after.name over before', () => {
      const parsed = parseAuditChanges(
        JSON.stringify({ before: { name: 'Old' }, after: { name: 'New' } }),
      );
      expect(getEntityDisplayName(parsed)).toBe('New');
    });

    it('falls back to description', () => {
      const parsed = parseAuditChanges(JSON.stringify({ description: 'Coffee' }));
      expect(getEntityDisplayName(parsed)).toBe('Coffee');
    });
  });

  describe('computeCanRevert', () => {
    const baseEntry: AuditLogEntry = {
      id: 'log-1',
      entityType: 'journal',
      entityId: 'j-1',
      action: AuditAction.UPDATE,
      changes: '{}',
      timestamp: Date.now(),
      canRevert: true,
    };

    it('returns false when canRevert flag is false', () => {
      expect(
        computeCanRevert(
          { ...baseEntry, canRevert: false },
          {
            'j-1': { exists: true, isDeleted: false },
          },
        ),
      ).toBe(false);
    });

    it('returns false when entity does not exist', () => {
      expect(computeCanRevert(baseEntry, { 'j-1': { exists: false, isDeleted: false } })).toBe(
        false,
      );
    });

    it('allows revert UPDATE on active entity', () => {
      expect(computeCanRevert(baseEntry, { 'j-1': { exists: true, isDeleted: false } })).toBe(true);
    });

    it('allows revert DELETE only when entity is deleted', () => {
      const entry = { ...baseEntry, action: AuditAction.DELETE };
      expect(computeCanRevert(entry, { 'j-1': { exists: true, isDeleted: true } })).toBe(true);
      expect(computeCanRevert(entry, { 'j-1': { exists: true, isDeleted: false } })).toBe(false);
    });

    it('allows revert CREATE only when entity is not deleted', () => {
      const entry = { ...baseEntry, action: AuditAction.CREATE };
      expect(computeCanRevert(entry, { 'j-1': { exists: true, isDeleted: false } })).toBe(true);
      expect(computeCanRevert(entry, { 'j-1': { exists: true, isDeleted: true } })).toBe(false);
    });
  });

  describe('transaction snapshots', () => {
    it('accepts branded account ids in parsed transactions', () => {
      const accountId = 'acc-123' as AccountId;
      const parsed = parseAuditChanges(
        JSON.stringify({
          transactions: [{ accountId, amount: 50, type: 'DEBIT' }],
        }),
      );
      expect(parsed).not.toBeNull();
    });
  });
});
