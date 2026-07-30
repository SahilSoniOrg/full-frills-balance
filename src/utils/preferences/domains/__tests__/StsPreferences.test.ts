import { AppConfig } from '@/src/constants/app-config';
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from '../../types';
import { StsPreferences } from '../StsPreferences';
import type { PreferencesStore } from '../../PreferencesStore';

function createMockStore(initial: Partial<UIPreferences> = {}): PreferencesStore {
  let snapshot: UIPreferences = { ...DEFAULT_UI_PREFERENCES, ...initial };
  return {
    getSnapshot: () => snapshot,
    update: (updates: Partial<UIPreferences>) => {
      snapshot = { ...snapshot, ...updates };
    },
    observe: jest.fn(),
  } as unknown as PreferencesStore;
}

describe('StsPreferences', () => {
  it('defaults safeToSpendDays from AppConfig', () => {
    const sts = new StsPreferences(createMockStore({ safeToSpendDays: undefined as never }));
    expect(sts.safeToSpendDays).toBe(AppConfig.defaults.safeToSpendDays);
  });

  it('persists safeToSpendDays updates', () => {
    const store = createMockStore();
    const sts = new StsPreferences(store);

    sts.setSafeToSpendDays(14);
    expect(sts.safeToSpendDays).toBe(14);
  });
});
