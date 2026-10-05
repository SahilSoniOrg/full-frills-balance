import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { revertEntry } from '@/src/services/audit-service';
import { revertRegistry, RevertHandler } from '@/src/services/revert-registry';
import { AuditAction } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/data/repositories/AuditRepository');

describe('revertEntry dispatch contract', () => {
  const logId = 'log-1';
  const workplaceId = 'wp-1' as WorkplaceId;
  const changes = { before: { name: 'Before' }, after: { name: 'After' } };

  const mockLog = (overrides: Record<string, unknown> = {}) => ({
    id: logId,
    entityId: 'entity-1',
    entityType: 'account',
    action: AuditAction.UPDATE,
    canRevert: true,
    parsedChanges: changes,
    ...overrides,
  });

  let getHandler: jest.SpyInstance;
  let supports: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    getHandler = jest.spyOn(revertRegistry, 'getHandler').mockReturnValue(undefined);
    supports = jest.spyOn(revertRegistry, 'supports').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the not-found outcome without consulting the registry', async () => {
    (auditRepository.find as jest.Mock).mockResolvedValue(null);

    const result = await revertEntry(logId, workplaceId);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/No audit record found/i),
    });
    expect(auditRepository.find).toHaveBeenCalledWith(logId, workplaceId);
    expect(getHandler).not.toHaveBeenCalled();
    expect(supports).not.toHaveBeenCalled();
  });

  it('rejects a record marked non-revertible before dispatch', async () => {
    (auditRepository.find as jest.Mock).mockResolvedValue(mockLog({ canRevert: false }));

    const result = await revertEntry(logId, workplaceId);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/Failed to undo change/i),
    });
    expect(getHandler).not.toHaveBeenCalled();
    expect(supports).not.toHaveBeenCalled();
  });

  it('rejects a record without parsed changes before dispatch', async () => {
    (auditRepository.find as jest.Mock).mockResolvedValue(mockLog({ parsedChanges: null }));

    const result = await revertEntry(logId, workplaceId);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/Failed to undo change/i),
    });
    expect(getHandler).not.toHaveBeenCalled();
    expect(supports).not.toHaveBeenCalled();
  });

  it('returns unsupported when the entity has no registered handler', async () => {
    (auditRepository.find as jest.Mock).mockResolvedValue(mockLog({ entityType: 'transaction' }));

    const result = await revertEntry(logId, workplaceId);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/is not supported yet/i),
    });
    expect(getHandler).toHaveBeenCalledWith('transaction');
    expect(supports).not.toHaveBeenCalled();
  });

  it('returns unsupported when a registered handler rejects the action and changes', async () => {
    const handler = jest.fn<ReturnType<RevertHandler>, Parameters<RevertHandler>>();
    getHandler.mockReturnValue(handler);
    (auditRepository.find as jest.Mock).mockResolvedValue(mockLog());

    const result = await revertEntry(logId, workplaceId);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/is not supported yet/i),
    });
    expect(supports).toHaveBeenCalledWith('account', AuditAction.UPDATE, changes);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(
    (['account', 'journal'] as const).flatMap(entityType =>
      ([AuditAction.CREATE, AuditAction.UPDATE, AuditAction.DELETE] as const).map(
        action => [entityType, action] as const,
      ),
    ),
  )(
    'dispatches %s %s with the original changes and stored audit id',
    async (entityType, action) => {
      const entityId = `${entityType}-entity`;
      const storedLogId = 'stored-log-id';
      const handler = jest.fn<ReturnType<RevertHandler>, Parameters<RevertHandler>>();
      const recordChanges = { before: { marker: 'before' }, after: { marker: 'after' } };
      getHandler.mockReturnValue(handler);
      supports.mockReturnValue(true);
      (auditRepository.find as jest.Mock).mockResolvedValue(
        mockLog({ id: storedLogId, entityId, entityType, action, parsedChanges: recordChanges }),
      );

      const result = await revertEntry(logId, workplaceId);

      expect(result).toEqual({ success: true });
      expect(auditRepository.find).toHaveBeenCalledWith(logId, workplaceId);
      expect(supports).toHaveBeenCalledWith(entityType, action, recordChanges);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(entityId, recordChanges, action, workplaceId, {
        auditLogId: storedLogId,
      });
      expect(handler.mock.calls[0][1]).toBe(recordChanges);
    },
  );

  it('returns a handler error message when dispatch throws', async () => {
    const handler = jest.fn<ReturnType<RevertHandler>, Parameters<RevertHandler>>();
    handler.mockRejectedValue(new Error('Undo conflict'));
    getHandler.mockReturnValue(handler);
    supports.mockReturnValue(true);
    (auditRepository.find as jest.Mock).mockResolvedValue(mockLog());

    await expect(revertEntry(logId, workplaceId)).resolves.toEqual({
      success: false,
      error: 'Undo conflict',
    });
    expect(handler).toHaveBeenCalledWith('entity-1', changes, AuditAction.UPDATE, workplaceId, {
      auditLogId: logId,
    });
  });

  it('uses the generic failure message when a handler throws a non-Error value', async () => {
    const handler = jest.fn<ReturnType<RevertHandler>, Parameters<RevertHandler>>();
    handler.mockRejectedValue('unexpected failure');
    getHandler.mockReturnValue(handler);
    supports.mockReturnValue(true);
    (auditRepository.find as jest.Mock).mockResolvedValue(mockLog());

    const result = await revertEntry(logId, workplaceId);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/Failed to undo change/i),
    });
  });

  it('converts a handler false result into a failed undo outcome', async () => {
    const handler = jest.fn<ReturnType<RevertHandler>, Parameters<RevertHandler>>();
    handler.mockResolvedValue(false);
    getHandler.mockReturnValue(handler);
    supports.mockReturnValue(true);
    (auditRepository.find as jest.Mock).mockResolvedValue(mockLog());

    const result = await revertEntry(logId, workplaceId);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/Failed to undo change/i),
    });
  });
});
