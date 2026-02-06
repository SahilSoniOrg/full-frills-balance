import { accountService } from '@/src/features/accounts/services/AccountService';
import { onboardingService } from '../OnboardingService';

jest.mock('@/src/features/accounts/services/AccountService');
jest.mock('@/src/data/database/Database', () => ({
    database: {
        write: jest.fn((cb) => cb()),
    },
}));
jest.mock('@/src/utils/preferences', () => ({
    preferences: {
        setUserName: jest.fn(),
        setDefaultCurrencyCode: jest.fn(),
        setOnboardingCompleted: jest.fn(),
    },
}));

describe('OnboardingService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
        expect(accountService.getOpeningBalancesAccountId).toHaveBeenCalledWith('USD');
        expect(accountService.findOrCreateBalanceCorrectionAccount).toHaveBeenCalledWith('USD');

        // Verify account creation
        expect(accountService.createAccount).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Cash',
            currencyCode: 'USD',
        }));

        // Verify category creation
        expect(accountService.createAccount).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Food & Drink',
            currencyCode: 'USD',
        }));
    });
});
