import { AuditAction } from '@/src/data/models/AuditLog';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { auditService } from '@/src/services/audit-service';

// Mock dependencies
jest.mock('@/src/data/repositories/AuditRepository');

describe('AuditService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('log', () => {
        it('should delegate logging to repository', async () => {
            const entry = {
                entityType: 'ACCOUNT',
                entityId: 'acc1',
                action: AuditAction.UPDATE,
                changes: { name: 'New Name' }
            };

            await auditService.log(entry);

            expect(auditRepository.log).toHaveBeenCalledWith(entry);
        });
    });

    describe('getAuditTrail', () => {
        it('should fetch by entity from repository', async () => {
            const mockLogs = [{ id: 'log1' }];
            (auditRepository.findByEntity as jest.Mock).mockResolvedValue(mockLogs);

            const result = await auditService.getAuditTrail('ACCOUNT', 'acc1');

            expect(auditRepository.findByEntity).toHaveBeenCalledWith('ACCOUNT', 'acc1');
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
});
