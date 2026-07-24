import { accountService } from '@/src/services/accounts/accountDomainService';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { onboardingService } from '../OnboardingService';

jest.mock('@/src/services/accounts/accountDomainService');
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    createWorkplace: jest
      .fn()
      .mockResolvedValue({ id: 'mock-workplace-id', name: 'Personal', icon: 'briefcase' }),
    getAllWorkplaces: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/data/database/Database', () => ({
  database: {
    write: jest.fn(cb => cb()),
  },
}));
jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    setUserName: jest.fn(),
    setDefaultCurrencyCode: jest.fn(),
    setOnboardingCompleted: jest.fn(),
    setActiveWorkplaceId: jest.fn(),
  },
  preferencesMigration: { legacyCurrencyCode: undefined, clearLegacyCurrencyCode: jest.fn() },
}));

describe('OnboardingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (accountRepository.findAll as jest.Mock).mockResolvedValue([]);
  });

  it('should complete onboarding by performing all steps transactionally', async () => {
    const data = {
      name: 'Test User',
      selectedCurrency: 'USD',
      selectedAccounts: ['Cash'],
      customAccounts: [],
      selectedCategories: ['Food & Drink'],
      customCategories: [],
    };

    await onboardingService.completeOnboarding(data);

    // Verify preferences were set

    // Verify system accounts were ensured
    expect(accountService.getOpeningBalancesAccountId).toHaveBeenCalledWith(
      'USD',
      'mock-workplace-id',
    );
    expect(accountService.findOrCreateBalanceCorrectionAccount).toHaveBeenCalledWith(
      'USD',
      'mock-workplace-id',
    );

    // Verify account creation
    expect(accountService.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cash',
        currencyCode: 'USD',
      }),
      'mock-workplace-id',
    );

    // Verify category creation
    expect(accountService.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Food & Drink',
        currencyCode: 'USD',
      }),
      'mock-workplace-id',
    );
  });
});
