import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { database } from '@/src/data/database/Database';
import { WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          fetch: jest.fn(),
          fetchCount: jest.fn(),
          observe: jest.fn(),
        })),
        create: jest.fn(),
        prepareCreate: jest.fn(),
      })),
    },
    write: jest.fn(async cb => cb()),
    batch: jest.fn(),
  },
}));

describe('AuditRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeLegacyEntityTypes', () => {
    it('returns 0 when no uppercase logs exist', async () => {
      jest
        .spyOn(auditRepository, 'findAll')
        .mockResolvedValue([{ entityType: 'account' } as any, { entityType: 'journal' } as any]);

      const result = await auditRepository.normalizeLegacyEntityTypes('wp-1' as WorkplaceId);
      expect(result).toBe(0);
      expect(database.write).not.toHaveBeenCalled();
    });

    it('updates uppercase entity types to lowercase and batches them', async () => {
      const mockPrepareUpdate = jest.fn(cb => {
        const record: any = { entityType: '' };
        cb(record);
        return record;
      });

      const uppercaseLogs = [
        { entityType: 'ACCOUNT', prepareUpdate: mockPrepareUpdate } as any,
        { entityType: 'Journal', prepareUpdate: mockPrepareUpdate } as any,
      ];

      jest
        .spyOn(auditRepository, 'findAll')
        .mockResolvedValue([...uppercaseLogs, { entityType: 'transaction' } as any]);

      const result = await auditRepository.normalizeLegacyEntityTypes('wp-1' as WorkplaceId);
      expect(result).toBe(2);
      expect(database.write).toHaveBeenCalled();
      expect(database.batch).toHaveBeenCalled();
      expect(mockPrepareUpdate).toHaveBeenCalledTimes(2);
    });
  });
});
