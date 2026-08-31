import { act, renderHook } from '@testing-library/react-native';
import { useOnboardingFlow } from '../useOnboardingFlow';

let mockMode: string | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ mode: mockMode }),
}));

jest.mock('@/src/utils/preferences', () => ({
  preferences: { device: { onboardingCompleted: false }, userName: 'Sahil' },
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
  AppNavigation: { back: jest.fn(), toImportSelection: jest.fn() },
}));
jest.mock('@/src/features/onboarding/services/OnboardingService', () => ({
  onboardingService: {},
}));
jest.mock('@/src/data/database/idGenerator', () => ({ generator: () => 'operation-id' }));

describe('useOnboardingFlow', () => {
  beforeEach(() => {
    mockMode = undefined;
    jest.clearAllMocks();
    const { preferences } = jest.requireMock('@/src/utils/preferences') as {
      preferences: { device: { onboardingCompleted: boolean } };
    };
    preferences.device.onboardingCompleted = false;
  });

  it('claims the Device then skips editable Workplace identity', async () => {
    const { result } = renderHook(() => useOnboardingFlow());

    expect(result.current.step).toBe(1);
    await act(async () => result.current.onContinue());

    expect(result.current.step).toBe(3);
    expect(result.current.workplaceName).toBe("Sahil's Personal workplace");
    expect(result.current.workplaceIcon).toBe('briefcase');
  });

  it('starts later Workplace creation at the editable identity step', () => {
    mockMode = 'full';

    const { result } = renderHook(() => useOnboardingFlow());

    expect(result.current.step).toBe(2);
  });

  it('does not restart Device onboarding when a claimed Device has a step-one draft', async () => {
    const { storage } = jest.requireMock('@/src/utils/storage') as {
      storage: { getString: jest.Mock };
    };
    const { preferences } = jest.requireMock('@/src/utils/preferences') as {
      preferences: { device: { onboardingCompleted: boolean }; userName: string };
    };
    preferences.device.onboardingCompleted = true;
    storage.getString.mockReturnValue(
      JSON.stringify({ operationId: 'operation-id', step: 1, name: 'Sahil' }),
    );

    const { result } = renderHook(() => useOnboardingFlow());
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));

    expect(result.current.step).toBe(3);
  });

  it('resumes an unclaimed Device at the splash step', async () => {
    const { storage } = jest.requireMock('@/src/utils/storage') as {
      storage: { getString: jest.Mock };
    };
    storage.getString.mockReturnValue(JSON.stringify({ step: 1, name: 'Sahil' }));

    const { result } = renderHook(() => useOnboardingFlow());
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));

    expect(result.current.step).toBe(1);
  });

  it('allows first-run users to restore instead of creating a Workplace', () => {
    const { AppNavigation } = jest.requireMock('@/src/utils/navigation') as {
      AppNavigation: { toImportSelection: jest.Mock };
    };
    const { result } = renderHook(() => useOnboardingFlow());

    act(() => result.current.onRestore());

    expect(AppNavigation.toImportSelection).toHaveBeenCalledWith(false);
  });
});
