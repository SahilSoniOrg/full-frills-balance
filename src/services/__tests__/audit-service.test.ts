import { AuditAction } from '@/src/data/models/AuditLog';
import { JournalStatus } from '@/src/data/models/Journal';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { deleteAccount, recoverAccount } from '@/src/services/accounts/accountDeleteCommands';
import { revertAccountFromAuditState } from '@/src/services/accounts/accountAuditCommands';
import { journalService } from '@/src/services/journal/journalDomainService';
import { auditService } from '@/src/services/audit-service';

import { revertRegistry } from '@/src/services/revert-registry';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';

// Mock dependencies
jest.mock('@/src/data/repositories/AuditRepository');
jest.mock('@/src/data/database/Database', () => ({
  database: {
    write: jest.fn(callback => callback()),
    batch: jest.fn(),
  },
}));

jest.mock('@/src/services/accounts/accountDeleteCommands', () => ({
  deleteAccount: jest.fn(),
  recoverAccount: jest.fn(),
}));

jest.mock('@/src/services/accounts/accountAuditCommands', () => ({
  revertAccountFromAuditState: jest.fn(),
}));

jest.mock('@/src/services/journal/journalDomainService', () => ({
  journalService: {
    deleteJournal: jest.fn(),
    recoverJournal: jest.fn(),
    updateJournal: jest.fn(),
    revertToPlanned: jest.fn(),
    postJournal: jest.fn(),
  },
}));

describe('AuditService', () => {
  beforeAll(() => {
    // Manually register handlers since mocks don't run constructors
    revertRegistry.register('account', async (id, changes, action) => {
      if (action === AuditAction.CREATE)
        await deleteAccount(id as AccountId, 'wp-1' as WorkplaceId);
      else if (action === AuditAction.DELETE)
        await recoverAccount(id as AccountId, 'wp-1' as WorkplaceId);
      else if (action === AuditAction.UPDATE && changes.before) {
        if (changes.before.deletedAt)
          await deleteAccount(id as AccountId, 'wp-1' as WorkplaceId);
        else
          await revertAccountFromAuditState(
            'wp-1' as WorkplaceId,
            id as AccountId,
            changes.before,
          );
      }
    });

    revertRegistry.register('journal', async (id, changes, action) => {
      if (action === AuditAction.CREATE)
        await journalService.deleteJournal(id as JournalId, 'wp-1' as WorkplaceId);
      else if (action === AuditAction.DELETE)
        await journalService.recoverJournal(id as JournalId, 'wp-1' as WorkplaceId);
      else if (action === AuditAction.UPDATE && changes.before) {
        if (changes.before.deletedAt)
          await journalService.deleteJournal(id as JournalId, 'wp-1' as WorkplaceId);
        else if (changes.before.status === JournalStatus.PLANNED)
          await journalService.revertToPlanned(id as JournalId, 'wp-1' as WorkplaceId);
        else if (changes.before.status === JournalStatus.POSTED)
          await journalService.postJournal(id as JournalId, 'wp-1' as WorkplaceId);
        else
          await journalService.updateJournal(
            id as JournalId,
            changes.before as any,
            'wp-1' as WorkplaceId,
          );
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should delegate logging to repository', async () => {
      const entry = {
        entityType: 'account' as const,
        entityId: 'acc1' as AccountId,
        action: AuditAction.UPDATE,
        changes: { name: 'New Name' },
      };

      await auditService.log(entry, 'wp-1' as WorkplaceId);

      expect(auditRepository.log).toHaveBeenCalledWith(entry, 'wp-1');
    });
  });

  describe('getAuditTrail', () => {
    it('should fetch by entity from repository', async () => {
      const mockLogs = [{ id: 'log1' }];
      (auditRepository.findByEntity as jest.Mock).mockResolvedValue(mockLogs);

      const result = await auditService.getAuditTrail(
        'account',
        'acc1' as AccountId,
        'wp-1' as WorkplaceId,
      );

      expect(auditRepository.findByEntity).toHaveBeenCalledWith(
        'account',
        'acc1' as AccountId,
        'wp-1' as WorkplaceId,
      );
      expect(result).toBe(mockLogs);
    });
  });

  describe('getRecentLogs', () => {
    it('should fetch recent logs from repository', async () => {
      const mockLogs = [{ id: 'log1' }, { id: 'log2' }];
      (auditRepository.fetchRecent as jest.Mock).mockResolvedValue(mockLogs);

      const result = await auditService.getRecentLogs(50, 'wp-1' as WorkplaceId);

      expect(auditRepository.fetchRecent).toHaveBeenCalledWith(50, 'wp-1' as WorkplaceId);
      expect(result).toBe(mockLogs);
    });

    it('should use default limit if not provided', async () => {
      await auditService.getRecentLogs(undefined, 'wp-1' as WorkplaceId);
      expect(auditRepository.fetchRecent).toHaveBeenCalledWith(100, 'wp-1' as WorkplaceId);
    });
  });

  describe('cleanupLegacyEntityTypes', () => {
    it('should return 0 if no uppercase logs exist', async () => {
      (auditRepository.findAll as jest.Mock).mockResolvedValue([
        { entityType: 'account' },
        { entityType: 'journal' },
      ]);

      const result = await auditService.cleanupLegacyEntityTypes('wp-1' as WorkplaceId);

      expect(result).toBe(0);
    });

    it('should update uppercase logs to lowercase', async () => {
      const mockPrepareUpdate = jest.fn(callback => {
        const record = {
          entityType: '',
          // Mock properties to satisfy WatermelonDB batching/status checks
          _status: 'updated',
          _isEditing: false,
          __initialized: true,
        };
        callback(record);
        return record;
      });

      const uppercaseLogs = [
        {
          entityType: 'ACCOUNT',
          prepareUpdate: mockPrepareUpdate,
          _status: 'synced',
          _isEditing: false,
          __initialized: true,
        },
        {
          entityType: 'Journal',
          prepareUpdate: mockPrepareUpdate,
          _status: 'synced',
          _isEditing: false,
          __initialized: true,
        },
      ];

      (auditRepository.findAll as jest.Mock).mockResolvedValue([
        ...uppercaseLogs,
        { entityType: 'transaction' },
      ]);

      const result = await auditService.cleanupLegacyEntityTypes('wp-1' as WorkplaceId);

      expect(result).toBe(2);
      expect(mockPrepareUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe('revertEntry', () => {
    const mockLog = (overrides: any) => ({
      id: 'log1',
      entityId: 'ent1',
      canRevert: true,
      ...overrides,
      parsedChanges: overrides.changes || {},
    });

    it('should return error if log is not found', async () => {
      (auditRepository.find as jest.Mock).mockResolvedValue(null);
      const res = await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/No audit record found/i);
    });

    it('should return error if log cannot be reverted', async () => {
      (auditRepository.find as jest.Mock).mockResolvedValue(mockLog({ canRevert: false }));
      const res = await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Failed to undo change/i);
    });

    it('should return error for unsupported entity type', async () => {
      (auditRepository.find as jest.Mock).mockResolvedValue(mockLog({ entityType: 'transaction' }));
      const res = await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/is not supported yet/i);
    });

    describe('Account Entity', () => {
      it('should revert CREATE by deleting account', async () => {
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'account', action: AuditAction.CREATE }),
        );
        const res = await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        console.log('Result:', res);
        expect(deleteAccount).toHaveBeenCalledWith(
          'ent1' as AccountId,
          'wp-1' as WorkplaceId,
        );
      });

      it('should revert DELETE by recovering account', async () => {
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'account', action: AuditAction.DELETE }),
        );
        await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        expect(recoverAccount).toHaveBeenCalledWith(
          'ent1' as AccountId,
          'wp-1' as WorkplaceId,
        );
      });

      it('should revert UPDATE by restoring previous state', async () => {
        const changes = { before: { name: 'Old Name' } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'account', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        expect(revertAccountFromAuditState).toHaveBeenCalledWith(
          'wp-1' as WorkplaceId,
          'ent1' as AccountId,
          changes.before,
        );
      });

      it('should revert UPDATE (undelete) by deleting account', async () => {
        const changes = { before: { deletedAt: '2024-01-01' } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'account', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        expect(deleteAccount).toHaveBeenCalledWith(
          'ent1' as AccountId,
          'wp-1' as WorkplaceId,
        );
      });
    });

    describe('Journal Entity', () => {
      it('should revert CREATE by deleting journal', async () => {
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.CREATE }),
        );
        await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        expect(journalService.deleteJournal).toHaveBeenCalledWith(
          'ent1' as JournalId,
          'wp-1' as WorkplaceId,
        );
      });

      it('should revert DELETE by recovering journal', async () => {
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.DELETE }),
        );
        await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        expect(journalService.recoverJournal).toHaveBeenCalledWith(
          'ent1' as JournalId,
          'wp-1' as WorkplaceId,
        );
      });

      it('should revert UPDATE by restoring previous state', async () => {
        const changes = { before: { description: 'Old Desc', transactions: [] } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        expect(journalService.updateJournal).toHaveBeenCalledWith(
          'ent1' as JournalId,
          changes.before,
          'wp-1' as WorkplaceId,
        );
      });

      it('should revert UPDATE (undelete) by deleting journal', async () => {
        const changes = { before: { deletedAt: '2024-01-01' } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        expect(journalService.deleteJournal).toHaveBeenCalledWith(
          'ent1' as JournalId,
          'wp-1' as WorkplaceId,
        );
      });

      it('should revert UPDATE transitioning to POSTED by reverting to PLANNED', async () => {
        const changes = { before: { status: JournalStatus.PLANNED } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        expect(journalService.revertToPlanned).toHaveBeenCalledWith(
          'ent1' as JournalId,
          'wp-1' as WorkplaceId,
        );
      });

      it('should revert UPDATE transitioning to PLANNED by posting journal', async () => {
        const changes = { before: { status: JournalStatus.POSTED } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1', 'wp-1' as WorkplaceId);
        expect(journalService.postJournal).toHaveBeenCalledWith(
          'ent1' as JournalId,
          'wp-1' as WorkplaceId,
        );
      });
    });
  });
});
