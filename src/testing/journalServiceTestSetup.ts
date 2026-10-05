jest.mock('@/src/data/repositories/account');
jest.mock('@/src/data/repositories/journal/JournalEnrichmentQueries');
jest.mock('@/src/data/repositories/journal/journalQueryRepository');
jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/services/audit-service');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/utils/logger');
jest.mock('@/src/services/journal/JournalPersistenceService', () => ({
  journalPersistenceService: {
    put: jest.fn(),
    putAndLinkInboxRecord: jest.fn(),
    putMany: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    recover: jest.fn(),
    bulkRestore: jest.fn(),
    revertToPlanned: jest.fn(),
    reverse: jest.fn(),
  },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: { defaultCurrencyCode: 'USD' },
  preferencesMigration: { legacyCurrencyCode: undefined, clearLegacyCurrencyCode: jest.fn() },
}));
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getCurrency: jest.fn(() => Promise.resolve('USD')),
  },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getPrecision: jest.fn().mockResolvedValue(2) },
}));
