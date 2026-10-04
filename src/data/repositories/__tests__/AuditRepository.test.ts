import { auditRepository } from '@/src/data/repositories/AuditRepository';

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

  it('exposes the audit repository singleton', () => {
    expect(auditRepository).toBeDefined();
  });
});
