import { createAccount } from '@/src/services/accounts/accountCommands';
import {
  findOrCreateBalanceCorrectionAccount,
  getOpeningBalancesAccountId,
} from '@/src/services/accounts/accountSystemAccounts';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { onboardingService } from '../OnboardingService';

jest.mock('@/src/services/accounts/accountSystemAccounts', () => ({
  getOpeningBalancesAccountId: jest.fn().mockResolvedValue('opening-id'),
  findOrCreateBalanceCorrectionAccount: jest.fn().mockResolvedValue('correction-id'),
}));
jest.mock('@/src/services/accounts/accountCommands', () => ({
  createAccount: jest.fn().mockResolvedValue({ id: 'new-account' }),
}));
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
    expect(getOpeningBalancesAccountId).toHaveBeenCalledWith('USD', 'mock-workplace-id');
    expect(findOrCreateBalanceCorrectionAccount).toHaveBeenCalledWith('USD', 'mock-workplace-id');

    // Verify account creation
    expect(createAccount).toHaveBeenCalledWith(
      'mock-workplace-id',
      expect.objectContaining({
        name: 'Cash',
        currencyCode: 'USD',
      }),
    );

    // Verify category creation
    expect(createAccount).toHaveBeenCalledWith(
      'mock-workplace-id',
      expect.objectContaining({
        name: 'Food & Drink',
        currencyCode: 'USD',
      }),
    );
  });
});
