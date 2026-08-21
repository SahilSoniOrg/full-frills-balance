import { AuditAction, AccountId, WorkplaceId } from '@/src/types/domain';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { revertAccountFromAuditState } from '@/src/services/accounts/accountAuditCommands';
import { serializeArchiveAuditChanges } from '@/src/services/accounts/accountArchiveCommands';
import { collectArchiveAuditEntries } from '@/src/services/accounts/accountArchiveMutations';
import { auditService } from '@/src/services/audit-service';
import { revertRegistry } from '@/src/services/revert-registry';

jest.mock('@/src/data/repositories/AuditRepository');
jest.mock('@/src/data/repositories/account');

describe('account archive revert integration', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const accountId = 'acct-1' as AccountId;

  beforeEach(() => {
    jest.clearAllMocks();
    revertRegistry.register('account', async (entityId, changes, action, wpId) => {
      if (action === AuditAction.UPDATE && changes.before) {
        await revertAccountFromAuditState(wpId, entityId as AccountId, changes.before);
      }
    });
  });

  it('restores an unarchived account when reverting an archive audit entry', async () => {
    const archivedAt = new Date('2026-01-01T00:00:00.000Z');
    const [entry] = collectArchiveAuditEntries(
      [{ id: accountId, archivedAt: undefined }],
      [],
      archivedAt,
    );
    const persistedChanges = JSON.parse(JSON.stringify(serializeArchiveAuditChanges(entry)));

    const record = {
      archivedAt,
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const mockAccount = {
      id: accountId,
      archivedAt,
    };

    (accountQueryRepository.findWithDeleted as jest.Mock).mockResolvedValue(mockAccount);
    (accountWriteRepository.update as jest.Mock).mockImplementation(async (_account, payload) => {
      if ('archivedAt' in payload) {
        record.archivedAt = payload.archivedAt ?? undefined;
        record.updatedAt = new Date();
      }
      return mockAccount;
    });
    (auditRepository.find as jest.Mock).mockResolvedValue({
      id: 'log-archive',
      entityId: accountId,
      entityType: 'account',
      action: AuditAction.UPDATE,
      canRevert: true,
      parsedChanges: persistedChanges,
    });

    const result = await auditService.revertEntry('log-archive', workplaceId);

    expect(result.success).toBe(true);
    expect(accountQueryRepository.findWithDeleted).toHaveBeenCalledWith(workplaceId, accountId);
    expect(accountWriteRepository.update).toHaveBeenCalledWith(
      mockAccount,
      { archivedAt: null },
      workplaceId,
    );
    expect(record.archivedAt).toBeUndefined();
  });

  it('fails revert when persisted archivedAt is invalid', async () => {
    (auditRepository.find as jest.Mock).mockResolvedValue({
      id: 'log-bad',
      entityId: accountId,
      entityType: 'account',
      action: AuditAction.UPDATE,
      canRevert: true,
      parsedChanges: {
        before: { archivedAt: 'not-a-date' },
        after: { archivedAt: '2026-01-01T00:00:00.000Z', action: 'ARCHIVED' },
      },
    });

    const result = await auditService.revertEntry('log-bad', workplaceId);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid archivedAt in audit snapshot/);
    expect(accountQueryRepository.findWithDeleted).not.toHaveBeenCalled();
  });
});
