jest.mock('@/src/services/journal/journalDomainService');
jest.mock('@/src/services/journal/journalReadService', () => ({
  journalReadService: { find: jest.fn(), getJournalForEditor: jest.fn() },
}));
jest.mock('@/src/services/transaction-ingestion');
jest.mock('@/src/data/repositories/transaction');
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn() })),
}));
jest.mock('@/src/hooks/use-currencies', () => ({
  useCurrencies: jest.fn(() => ({ currencies: [], isLoading: false })),
  useCurrencyPrecision: jest.fn(() => ({ precision: 2, isLoading: false })),
}));
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: jest.fn(() => ({
    fetchRate: jest.fn().mockResolvedValue(1),
    fetchRequiredRate: jest.fn().mockResolvedValue(1),
  })),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: jest.fn(() => ({ workplaceId: 'wp-1', defaultCurrencyCode: 'USD' })),
}));
