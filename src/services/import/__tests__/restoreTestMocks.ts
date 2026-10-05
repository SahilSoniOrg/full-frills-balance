jest.mock('@/src/data/repositories/ImportRepository', () => ({
  importRepository: { batchInsertNewWorkplace: jest.fn() },
}));
jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: { find: jest.fn() },
}));
jest.mock('@/src/services/currency-init-service', () => ({
  currencyInitService: { initialize: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    getHistoricalRate: jest.fn().mockResolvedValue({
      rate: 1.1,
      requestedDate: Date.UTC(2020, 0, 2),
      effectiveDate: Date.UTC(2020, 0, 2),
      source: 'frankfurter/ecb:historical',
    }),
    syncTodayRates: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/services/integrity', () => ({
  forceRunCheck: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/services/import/importAccountBalanceRebuild', () => ({
  rebuildAllAccountBalancesAfterImport: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/services/import/restorePublicationClaims', () => ({
  restorePublicationClaims: { claim: jest.fn() },
}));
jest.mock('@/src/services/ReactiveDataService', () => ({
  reactiveDataService: { clearCache: jest.fn() },
}));
jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: {
    clearSnapshotsForWorkplace: jest.fn(),
    resumeSnapshotsForWorkplace: jest.fn(),
  },
}));
jest.mock('@/src/services/widgets/WidgetProjectionService', () => ({
  widgetProjectionService: {
    clearWorkplace: jest.fn().mockResolvedValue(undefined),
    resumeWorkplace: jest.fn(),
  },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    workplace: { replace: jest.fn() },
    restorePreferences: jest.fn(),
    restoreImportedPreferences: jest.fn(),
    device: {
      setDeviceRegistered: jest.fn(),
      setActiveWorkplaceId: jest.fn(),
    },
  },
}));
jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(() => ({ query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue([]) })) })),
    },
  },
}));
