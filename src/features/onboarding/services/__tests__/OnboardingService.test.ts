import { onboardingService } from '../OnboardingService';
import { workplaceService } from '@/src/services/WorkplaceService';
import { preferences } from '@/src/utils/preferences';
import { WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    createWorkplace: jest.fn().mockResolvedValue({
      id: 'mock-workplace-id',
      name: "Test User's Personal workplace",
      icon: 'briefcase',
    }),
    updateWorkplace: jest.fn(),
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
    device: {
      setOnboardingCompleted: jest.fn(),
      setActiveWorkplaceId: jest.fn(),
      setPendingWorkplaceId: jest.fn(),
      setOnboardingWorkplaceId: jest.fn(),
      setOnboardingStage: jest.fn(),
      setDeviceRegistered: jest.fn(),
    },
  },
  preferencesMigration: { legacyCurrencyCode: undefined, clearLegacyCurrencyCode: jest.fn() },
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

    expect(workplaceService.createWorkplace).toHaveBeenCalledWith(
      "Test User's Personal workplace",
      'briefcase',
      expect.objectContaining({
        id: expect.any(String),
        currencyCode: 'USD',
        initialAccounts: [expect.objectContaining({ name: 'Cash' })],
        initialCategories: [expect.objectContaining({ name: 'Food & Drink' })],
      }),
    );
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith('mock-workplace-id');
  });

  it('creates a later workplace atomically instead of publishing a shell first', async () => {
    (workplaceService.getAllWorkplaces as jest.Mock).mockResolvedValueOnce([
      { id: 'existing-one', name: 'Travel' },
      { id: 'existing-two', name: 'Home' },
    ]);

    const data = {
      operationId: 'retryable-workplace-operation' as WorkplaceId,
      name: 'Second User',
      selectedCurrency: 'EUR',
      selectedAccounts: ['Cash'],
      customAccounts: [],
      selectedCategories: ['Food & Drink'],
      customCategories: [],
    };

    await onboardingService.completeOnboarding(data);

    expect(workplaceService.createWorkplace).toHaveBeenCalledWith(
      "Second User's Personal workplace",
      'briefcase',
      expect.objectContaining({
        id: data.operationId,
        currencyCode: 'EUR',
        initialAccounts: [expect.objectContaining({ name: 'Cash' })],
        initialCategories: [expect.objectContaining({ name: 'Food & Drink' })],
      }),
    );
  });

  it('persists the user-selected workplace name', async () => {
    await onboardingService.completeOnboarding({
      name: 'Test User',
      workplaceName: 'My Ledger',
      selectedCurrency: 'USD',
      selectedAccounts: ['Cash'],
      customAccounts: [],
      selectedCategories: ['Food & Drink'],
      customCategories: [],
    });

    expect(workplaceService.createWorkplace).toHaveBeenCalledWith(
      'My Ledger',
      'briefcase',
      expect.anything(),
    );
  });

  it('applies an edited imported workplace name before publishing it', async () => {
    await onboardingService.completeImportedWorkplace(
      'imported-workplace' as WorkplaceId,
      'Imported household',
      'home',
    );

    expect(workplaceService.updateWorkplace).toHaveBeenCalledWith('imported-workplace', {
      name: 'Imported household',
      icon: 'home',
    });
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith('imported-workplace');
  });

  it('creates a new workplace even when legacy Personal data already exists', async () => {
    (workplaceService.getAllWorkplaces as jest.Mock).mockResolvedValueOnce([
      { id: 'legacy-personal', name: 'Personal' },
    ]);

    await onboardingService.completeOnboarding({
      name: 'New User',
      selectedCurrency: 'GBP',
      selectedAccounts: ['Cash'],
      customAccounts: [],
      selectedCategories: ['Food & Drink'],
      customCategories: [],
    });

    expect(workplaceService.createWorkplace).toHaveBeenCalledWith(
      "New User's Personal workplace",
      'briefcase',
      expect.objectContaining({
        currencyCode: 'GBP',
      }),
    );
    expect(workplaceService.updateWorkplace).not.toHaveBeenCalled();
  });

  it('preserves the selected type for custom accounts', async () => {
    await onboardingService.completeOnboarding({
      name: 'Test User',
      selectedCurrency: 'USD',
      selectedAccounts: ['Freelance income'],
      customAccounts: [{ name: 'Freelance income', type: 'ASSET', icon: 'wallet' }],
      selectedCategories: [],
      customCategories: [],
    });

    expect(workplaceService.createWorkplace).toHaveBeenCalledWith(
      "Test User's Personal workplace",
      'briefcase',
      expect.objectContaining({
        initialAccounts: [
          expect.objectContaining({ name: 'Freelance income', type: 'ASSET', icon: 'wallet' }),
        ],
      }),
    );
  });

  it('keeps a committed workplace successful when the active pointer cannot be saved', async () => {
    (preferences.device.setActiveWorkplaceId as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });

    await expect(
      onboardingService.completeOnboarding({
        name: 'Test User',
        selectedCurrency: 'USD',
        selectedAccounts: [],
        customAccounts: [],
        selectedCategories: [],
        customCategories: [],
      }),
    ).resolves.toBe('mock-workplace-id');
  });
});
