import { act, renderHook } from '@testing-library/react-native';
import { ONBOARDING_DRAFT_KEY } from '../../services/OnboardingDraftStore';
import { useOnboardingFlow } from '../useOnboardingFlow';

let mockMode: string | undefined;
let mockStage: string | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ mode: mockMode, stage: mockStage }),
}));

jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    device: {
      deviceRegistered: false,
      onboardingCompleted: false,
      onboardingStage: 'user_profile',
      onboardingWorkplaceId: undefined,
      setOnboardingStage: jest.fn(),
    },
    userName: 'Sahil',
    themePrefs: {
      themeId: 'deep-space',
      fontId: 'deep-space',
      setThemeId: jest.fn(),
      setFontId: jest.fn(),
    },
  },
}));

jest.mock('@/src/contexts/app-shell/AppOnboardingProvider', () => ({
  useOnboardingSession: () => ({
    completeDeviceOnboarding: jest.fn().mockResolvedValue(undefined),
    persistDisplayName: jest.fn(),
  }),
}));

jest.mock('@/src/utils/storage', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), remove: jest.fn() },
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: { trackOnboardingStep: jest.fn(), trackFeatureUsage: jest.fn() },
}));
jest.mock('@/src/utils/haptics', () => ({ triggerHaptic: jest.fn() }));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    back: jest.fn(),
    toImportSelection: jest.fn(),
    toDashboard: jest.fn(),
  },
}));
jest.mock('@/src/features/onboarding/services/OnboardingService', () => ({
  onboardingService: {
    completeOnboarding: jest.fn().mockResolvedValue('created-workplace'),
    completeImportedWorkplace: jest.fn(),
  },
}));
jest.mock('@/src/data/database/idGenerator', () => ({ generator: () => 'operation-id' }));

describe('useOnboardingFlow', () => {
  beforeEach(() => {
    mockMode = undefined;
    mockStage = undefined;
    jest.clearAllMocks();
    const { storage } = jest.requireMock('@/src/utils/storage') as {
      storage: { getString: jest.Mock };
    };
    storage.getString.mockReset();
    storage.getString.mockReturnValue(undefined);
    const { preferences } = jest.requireMock('@/src/utils/preferences') as {
      preferences: {
        device: {
          deviceRegistered: boolean;
          onboardingCompleted: boolean;
          onboardingStage: string;
          onboardingWorkplaceId?: string;
          setOnboardingStage: jest.Mock;
        };
      };
    };
    preferences.device.onboardingCompleted = false;
    preferences.device.deviceRegistered = false;
    preferences.device.onboardingStage = 'user_profile';
    preferences.device.onboardingWorkplaceId = undefined;
    preferences.device.setOnboardingStage = jest.fn();
  });

  it('claims the Device then skips editable Workplace identity', async () => {
    const { result } = renderHook(() => useOnboardingFlow());

    expect(result.current.stage).toBe('user_profile');
    expect(result.current.step).toBe(1);
    await act(async () => result.current.onContinue());

    expect(result.current.stage).toBe('workplace_setup');
    expect(result.current.step).toBe(3);
    expect(result.current.workplaceName).toBe("Sahil's Personal workplace");
  });

  it('starts full Workplace creation at the editable identity step', () => {
    mockMode = 'full';

    const { result } = renderHook(() => useOnboardingFlow());

    expect(result.current.stage).toBe('workplace_setup');
    expect(result.current.step).toBe(2);
  });

  it('writes appearance changes to global preferences instead of the onboarding draft', () => {
    const { result } = renderHook(() => useOnboardingFlow());
    const { preferences } = jest.requireMock('@/src/utils/preferences') as {
      preferences: {
        themePrefs: { setThemeId: jest.Mock; setFontId: jest.Mock };
      };
    };
    const { storage } = jest.requireMock('@/src/utils/storage') as {
      storage: { set: jest.Mock };
    };

    act(() => {
      result.current.setThemeId('ivy');
      result.current.setFontId('editorial');
    });

    expect(preferences.themePrefs.setThemeId).toHaveBeenCalledWith('ivy');
    expect(preferences.themePrefs.setFontId).toHaveBeenCalledWith('editorial');
    const latestDraft = JSON.parse(storage.set.mock.calls.at(-1)[1]);
    expect(latestDraft.themeId).toBeUndefined();
    expect(latestDraft.fontId).toBeUndefined();
  });

  it('moves through review before committing the Workplace', async () => {
    mockMode = 'full';
    const { result } = renderHook(() => useOnboardingFlow());

    for (let index = 0; index < 4; index += 1) {
      await act(async () => result.current.onContinue());
    }
    expect(result.current.stage).toBe('review');

    await act(async () => result.current.onFinish());

    expect(
      (
        jest.requireMock('@/src/features/onboarding/services/OnboardingService') as {
          onboardingService: { completeOnboarding: jest.Mock };
        }
      ).onboardingService.completeOnboarding,
    ).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'operation-id' }));
    expect(
      (jest.requireMock('@/src/utils/navigation') as { AppNavigation: { toDashboard: jest.Mock } })
        .AppNavigation.toDashboard,
    ).toHaveBeenCalled();
    expect(result.current.stage).toBe('complete');
  });

  it('keeps checkpoint data in MMKV and never commits before final confirmation', async () => {
    mockMode = 'full';
    const { storage } = jest.requireMock('@/src/utils/storage') as {
      storage: { set: jest.Mock };
    };
    const { onboardingService } = jest.requireMock(
      '@/src/features/onboarding/services/OnboardingService',
    ) as { onboardingService: { completeOnboarding: jest.Mock } };
    const { result } = renderHook(() => useOnboardingFlow());

    await act(async () => result.current.onContinue());
    await act(async () => result.current.onContinue());
    await act(async () => result.current.onContinue());

    expect(result.current.stage).toBe('workplace_setup');
    expect(onboardingService.completeOnboarding).not.toHaveBeenCalled();
    expect(storage.set).toHaveBeenCalledWith(
      ONBOARDING_DRAFT_KEY,
      expect.stringContaining('"stage":"workplace_setup"'),
    );

    await act(async () => result.current.onFinish());
    expect(onboardingService.completeOnboarding).not.toHaveBeenCalled();

    await act(async () => result.current.onContinue());
    expect(result.current.stage).toBe('review');

    await act(async () => result.current.onFinish());
    expect(onboardingService.completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('routes review edits back to the requested draft checkpoint', async () => {
    mockMode = 'full';
    const { result } = renderHook(() => useOnboardingFlow());

    await act(async () => result.current.onContinue());
    await act(async () => result.current.onContinue());
    await act(async () => result.current.onContinue());
    await act(async () => result.current.onContinue());
    await act(async () => result.current.onContinue());
    expect(result.current.stage).toBe('review');

    act(() => result.current.onEdit('accounts'));
    expect(result.current.stage).toBe('workplace_setup');
    expect(result.current.step).toBe(4);
    await act(async () => result.current.onContinue());
    expect(result.current.stage).toBe('review');
  });

  it('hydrates all fields and resumes at the persisted named stage', () => {
    const { storage } = jest.requireMock('@/src/utils/storage') as {
      storage: { getString: jest.Mock };
    };
    storage.getString.mockImplementation((key: string) =>
      key === ONBOARDING_DRAFT_KEY
        ? JSON.stringify({
            version: 1,
            flow: 'full',
            stage: 'review',
            workplaceStep: 'categories',
            operationId: 'saved-operation',
            name: 'Saved name',
            workplaceName: 'Saved workplace',
            workplaceIcon: 'home',
            selectedCurrency: 'EUR',
            selectedAccounts: ['Cash'],
            customAccounts: [],
            selectedCategories: ['Salary'],
            customCategories: [],
            themeId: 'ivy',
            fontId: 'editorial',
          })
        : undefined,
    );

    const { result } = renderHook(() => useOnboardingFlow());

    expect(result.current.stage).toBe('review');
    expect(result.current.name).toBe('Saved name');
    expect(result.current.workplaceName).toBe('Saved workplace');
    expect(result.current.selectedCurrency).toBe('EUR');
    expect(result.current.themeId).toBe('deep-space');
    expect(result.current.fontId).toBe('deep-space');
  });

  it('does not hydrate a stale device-onboarding draft for workplace creation', () => {
    mockMode = 'full';
    const { storage } = jest.requireMock('@/src/utils/storage') as {
      storage: { getString: jest.Mock };
    };
    storage.getString.mockReturnValue(
      JSON.stringify({
        version: 1,
        stage: 'review',
        workplaceStep: 'categories',
        operationId: 'old-operation',
        name: 'Old user',
        workplaceName: 'Old workplace',
        workplaceIcon: 'home',
        selectedCurrency: 'EUR',
        selectedAccounts: ['Old account'],
        customAccounts: [],
        selectedCategories: ['Old category'],
        customCategories: [],
      }),
    );

    const { result } = renderHook(() => useOnboardingFlow());

    expect(result.current.stage).toBe('workplace_setup');
    expect(result.current.workplaceName).toBe('');
    expect(result.current.selectedCurrency).toBe('USD');
    expect(result.current.selectedAccounts).toEqual(['Cash', 'Bank']);
  });

  it('normalizes post-import entry to appearance and preserves import completion', async () => {
    mockStage = 'post_import';
    const { preferences } = jest.requireMock('@/src/utils/preferences') as {
      preferences: { device: { onboardingStage: string; onboardingWorkplaceId?: string } };
    };
    preferences.device.onboardingStage = 'post_import';
    preferences.device.onboardingWorkplaceId = 'imported-workplace';

    const { result } = renderHook(() => useOnboardingFlow());
    expect(result.current.stage).toBe('appearance');

    act(() => result.current.onBack());
    expect(result.current.stage).toBe('user_profile');
    await act(async () => result.current.onContinue());
    expect(result.current.stage).toBe('appearance');
    expect(
      (
        jest.requireMock('@/src/contexts/app-shell/AppOnboardingProvider') as {
          useOnboardingSession: () => { completeDeviceOnboarding: jest.Mock };
        }
      ).useOnboardingSession().completeDeviceOnboarding,
    ).not.toHaveBeenCalled();

    await act(async () => result.current.onContinue());
    expect(result.current.stage).toBe('review');
    await act(async () => result.current.onFinish());

    expect(
      (
        jest.requireMock('@/src/features/onboarding/services/OnboardingService') as {
          onboardingService: { completeImportedWorkplace: jest.Mock };
        }
      ).onboardingService.completeImportedWorkplace,
    ).toHaveBeenCalledWith('imported-workplace', "Sahil's Personal workplace", 'briefcase');
    expect(
      (jest.requireMock('@/src/utils/navigation') as { AppNavigation: { toDashboard: jest.Mock } })
        .AppNavigation.toDashboard,
    ).toHaveBeenCalled();
  });

  it('uses the imported user name when an older empty draft is still present', () => {
    mockStage = 'post_import';
    const { storage } = jest.requireMock('@/src/utils/storage') as {
      storage: { getString: jest.Mock };
    };
    storage.getString.mockReturnValue(
      JSON.stringify({
        version: 1,
        stage: 'appearance',
        workplaceStep: 'categories',
        operationId: 'operation-id',
        name: '',
        workplaceName: "User's Personal workplace",
        workplaceIcon: 'briefcase',
        selectedCurrency: 'USD',
        selectedAccounts: ['Cash'],
        customAccounts: [],
        selectedCategories: ['Salary'],
        customCategories: [],
        themeId: 'deep-space',
        fontId: 'deep-space',
        importedWorkplaceId: 'imported-workplace',
      }),
    );

    const { result } = renderHook(() => useOnboardingFlow());

    expect(result.current.name).toBe('Sahil');
  });

  it('keeps the MMKV workplace name when opening an imported workplace edit', () => {
    mockStage = 'post_import';
    const { storage } = jest.requireMock('@/src/utils/storage') as {
      storage: { getString: jest.Mock };
    };
    storage.getString.mockReturnValue(
      JSON.stringify({
        version: 1,
        stage: 'appearance',
        workplaceStep: 'categories',
        operationId: 'operation-id',
        name: 'Sahil',
        workplaceName: 'MMKV workplace name',
        workplaceIcon: 'briefcase',
        selectedCurrency: 'USD',
        selectedAccounts: ['Cash'],
        customAccounts: [],
        selectedCategories: ['Salary'],
        customCategories: [],
        importedWorkplaceId: 'imported-workplace',
      }),
    );

    const { result } = renderHook(() => useOnboardingFlow());
    act(() => result.current.onEdit('workplace'));

    expect(result.current.workplaceName).toBe('MMKV workplace name');
  });

  it('opens the profile step for a profile edit and returns to review after confirmation', async () => {
    mockMode = 'full';
    const { result } = renderHook(() => useOnboardingFlow());

    for (let index = 0; index < 5; index += 1) {
      await act(async () => result.current.onContinue());
    }
    expect(result.current.stage).toBe('review');

    act(() => result.current.setWorkplaceName('My Ledger'));
    act(() => result.current.onEdit('profile'));
    expect(result.current.stage).toBe('user_profile');

    await act(async () => result.current.onContinue());
    expect(result.current.stage).toBe('review');
    expect(result.current.workplaceName).toBe('My Ledger');
  });
});
