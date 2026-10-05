jest.mock('@/src/services/journal/journalDomainService');
jest.mock('@/src/services/transaction-ingestion');
jest.mock('@/src/services/journal/journalReadService', () => ({
  journalReadService: { find: jest.fn(), getJournalForEditor: jest.fn() },
}));
jest.mock('@/src/data/repositories/transaction');
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));
jest.mock('@/src/utils/alerts', () => ({
  showErrorAlert: jest.fn(),
}));
jest.mock('@/src/utils/haptics', () => ({
  triggerSaveOutcomeHaptic: jest.fn(),
}));
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: jest.fn(() => ({
    fetchRate: jest.fn(),
    fetchRequiredRate: jest.fn(),
  })),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: jest.fn(() => ({
    workplaceId: 'test-workplace',
    defaultCurrencyCode: 'USD',
  })),
}));
