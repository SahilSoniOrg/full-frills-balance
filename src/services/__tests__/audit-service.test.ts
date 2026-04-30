import { AuditAction } from '@/src/data/models/AuditLog';
import { JournalStatus } from '@/src/data/models/Journal';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { accountService } from '@/src/features/accounts/services/AccountService';
import { journalService } from '@/src/features/journal/services/JournalService';
import { auditService } from '@/src/services/audit-service';

import { revertRegistry } from '@/src/services/revert-registry';

// Mock dependencies
jest.mock('@/src/data/repositories/AuditRepository');
jest.mock('@/src/data/database/Database', () => ({
  database: {
    write: jest.fn(callback => callback()),
    batch: jest.fn(),
  },
}));

jest.mock('@/src/features/accounts/services/AccountService', () => ({
  accountService: {
    deleteAccount: jest.fn(),
    recoverAccount: jest.fn(),
    updateAccount: jest.fn(),
  },
}));

jest.mock('@/src/features/journal/services/JournalService', () => ({
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
      if (action === AuditAction.CREATE) await accountService.deleteAccount(id);
      else if (action === AuditAction.DELETE) await accountService.recoverAccount(id);
      else if (action === AuditAction.UPDATE && changes.before) {
        if (changes.before.deletedAt) await accountService.deleteAccount(id);
        else await accountService.updateAccount(id, changes.before);
      }
    });

    revertRegistry.register('journal', async (id, changes, action) => {
      if (action === AuditAction.CREATE) await journalService.deleteJournal(id);
      else if (action === AuditAction.DELETE) await journalService.recoverJournal(id);
      else if (action === AuditAction.UPDATE && changes.before) {
        if (changes.before.deletedAt) await journalService.deleteJournal(id);
        else if (changes.before.status === JournalStatus.PLANNED)
          await journalService.revertToPlanned(id);
        else if (changes.before.status === JournalStatus.POSTED)
          await journalService.postJournal(id);
        else await journalService.updateJournal(id, changes.before as any);
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
        entityId: 'acc1',
        action: AuditAction.UPDATE,
        changes: { name: 'New Name' },
      };

      await auditService.log(entry);

      expect(auditRepository.log).toHaveBeenCalledWith(entry);
    });
  });

  describe('getAuditTrail', () => {
    it('should fetch by entity from repository', async () => {
      const mockLogs = [{ id: 'log1' }];
      (auditRepository.findByEntity as jest.Mock).mockResolvedValue(mockLogs);

      const result = await auditService.getAuditTrail('account', 'acc1');

      expect(auditRepository.findByEntity).toHaveBeenCalledWith('account', 'acc1');
      expect(result).toBe(mockLogs);
    });
  });

  describe('getRecentLogs', () => {
    it('should fetch recent logs from repository', async () => {
      const mockLogs = [{ id: 'log1' }, { id: 'log2' }];
      (auditRepository.fetchRecent as jest.Mock).mockResolvedValue(mockLogs);

      const result = await auditService.getRecentLogs(50);

      expect(auditRepository.fetchRecent).toHaveBeenCalledWith(50);
      expect(result).toBe(mockLogs);
    });

    it('should use default limit if not provided', async () => {
      await auditService.getRecentLogs();
      expect(auditRepository.fetchRecent).toHaveBeenCalledWith(100);
    });
  });

  describe('cleanupLegacyEntityTypes', () => {
    it('should return 0 if no uppercase logs exist', async () => {
      (auditRepository.findAll as jest.Mock).mockResolvedValue([
        { entityType: 'account' },
        { entityType: 'journal' },
      ]);

      const result = await auditService.cleanupLegacyEntityTypes();

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

      const result = await auditService.cleanupLegacyEntityTypes();

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
      const res = await auditService.revertEntry('log1');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/No audit record found/i);
    });

    it('should return error if log cannot be reverted', async () => {
      (auditRepository.find as jest.Mock).mockResolvedValue(mockLog({ canRevert: false }));
      const res = await auditService.revertEntry('log1');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Failed to undo change/i);
    });

    it('should return error for unsupported entity type', async () => {
      (auditRepository.find as jest.Mock).mockResolvedValue(mockLog({ entityType: 'transaction' }));
      const res = await auditService.revertEntry('log1');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/is not supported yet/i);
    });

    describe('Account Entity', () => {
      it('should revert CREATE by deleting account', async () => {
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'account', action: AuditAction.CREATE }),
        );
        const res = await auditService.revertEntry('log1');
        console.log('Result:', res);
        expect(accountService.deleteAccount).toHaveBeenCalledWith('ent1');
      });

      it('should revert DELETE by recovering account', async () => {
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'account', action: AuditAction.DELETE }),
        );
        await auditService.revertEntry('log1');
        expect(accountService.recoverAccount).toHaveBeenCalledWith('ent1');
      });

      it('should revert UPDATE by restoring previous state', async () => {
        const changes = { before: { name: 'Old Name' } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'account', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1');
        expect(accountService.updateAccount).toHaveBeenCalledWith('ent1', changes.before);
      });

      it('should revert UPDATE (undelete) by deleting account', async () => {
        const changes = { before: { deletedAt: '2024-01-01' } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'account', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1');
        expect(accountService.deleteAccount).toHaveBeenCalledWith('ent1');
      });
    });

    describe('Journal Entity', () => {
      it('should revert CREATE by deleting journal', async () => {
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.CREATE }),
        );
        await auditService.revertEntry('log1');
        expect(journalService.deleteJournal).toHaveBeenCalledWith('ent1');
      });

      it('should revert DELETE by recovering journal', async () => {
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.DELETE }),
        );
        await auditService.revertEntry('log1');
        expect(journalService.recoverJournal).toHaveBeenCalledWith('ent1');
      });

      it('should revert UPDATE by restoring previous state', async () => {
        const changes = { before: { description: 'Old Desc', transactions: [] } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1');
        expect(journalService.updateJournal).toHaveBeenCalledWith('ent1', changes.before);
      });

      it('should revert UPDATE (undelete) by deleting journal', async () => {
        const changes = { before: { deletedAt: '2024-01-01' } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1');
        expect(journalService.deleteJournal).toHaveBeenCalledWith('ent1');
      });

      it('should revert UPDATE transitioning to POSTED by reverting to PLANNED', async () => {
        const changes = { before: { status: JournalStatus.PLANNED } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1');
        expect(journalService.revertToPlanned).toHaveBeenCalledWith('ent1');
      });

      it('should revert UPDATE transitioning to PLANNED by posting journal', async () => {
        const changes = { before: { status: JournalStatus.POSTED } };
        (auditRepository.find as jest.Mock).mockResolvedValue(
          mockLog({ entityType: 'journal', action: AuditAction.UPDATE, changes }),
        );
        await auditService.revertEntry('log1');
        expect(journalService.postJournal).toHaveBeenCalledWith('ent1');
      });
    });
  });
});
