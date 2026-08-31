import { storage } from '@/src/utils/storage';
import { DevicePreferencesStore } from '../DevicePreferencesStore';

const mockMemory = new Map<string, string>();

jest.mock('@/src/utils/storage', () => ({
  storage: {
    set: jest.fn((key: string, value: string) => mockMemory.set(key, value)),
    getString: jest.fn((key: string) => mockMemory.get(key)),
    remove: jest.fn((key: string) => mockMemory.delete(key)),
  },
}));

describe('DevicePreferencesStore', () => {
  beforeEach(() => {
    mockMemory.clear();
    jest.clearAllMocks();
  });

  it('keeps the previous active Workplace when persistence fails', () => {
    const store = new DevicePreferencesStore();
    store.setActiveWorkplaceId('old-workplace' as never);
    (storage.set as jest.Mock).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    expect(() => store.setActiveWorkplaceId('new-workplace' as never)).toThrow('disk full');
    expect(store.activeWorkplaceId).toBe('old-workplace');
  });

  it('sanitizes malformed persisted values', () => {
    mockMemory.set(
      'full_frills_balance_device_preferences',
      JSON.stringify({ onboardingCompleted: 'false', activeWorkplaceId: 42 }),
    );

    const store = new DevicePreferencesStore();

    expect(store.onboardingCompleted).toBe(false);
    expect(store.activeWorkplaceId).toBeUndefined();
  });

  it('resets its in-memory snapshot when persisted preferences are removed', () => {
    mockMemory.set(
      'full_frills_balance_device_preferences',
      JSON.stringify({ onboardingCompleted: true, activeWorkplaceId: 'workplace-1' }),
    );
    const store = new DevicePreferencesStore();

    mockMemory.clear();
    store.reload();

    expect(store.onboardingCompleted).toBe(false);
    expect(store.activeWorkplaceId).toBeUndefined();
  });

  it('persists the resumable onboarding stage and Workplace', () => {
    const store = new DevicePreferencesStore();

    store.setOnboardingStage('post_import');
    store.setOnboardingWorkplaceId('imported-workplace' as never);

    const reloaded = new DevicePreferencesStore();
    expect(reloaded.onboardingStage).toBe('post_import');
    expect(reloaded.onboardingWorkplaceId).toBe('imported-workplace');
  });

  it('persists synthesized defaults for recovered installs', () => {
    const store = new DevicePreferencesStore();

    store.persist();

    expect(mockMemory.has('full_frills_balance_device_preferences')).toBe(true);
    expect(JSON.parse(mockMemory.get('full_frills_balance_device_preferences')!)).toEqual({
      deviceRegistered: false,
      onboardingStage: 'user_profile',
      onboardingCompleted: false,
      isAppLockEnabled: false,
      isSmsImportEnabled: false,
    });
  });
});
