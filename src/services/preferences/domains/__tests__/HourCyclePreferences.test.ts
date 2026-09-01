import { DEFAULT_UI_PREFERENCES, type UIPreferences } from '../../types';
import { HourCyclePreferences } from '../HourCyclePreferences';
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

describe('HourCyclePreferences', () => {
  it('defaults to system', () => {
    const hourCycle = new HourCyclePreferences(createMockStore());
    expect(hourCycle.preference).toBe('system');
  });

  it('persists an explicit cycle', () => {
    const store = createMockStore();
    const hourCycle = new HourCyclePreferences(store);

    hourCycle.setPreference('24-hour');
    expect(hourCycle.preference).toBe('24-hour');
    expect(hourCycle.resolved).toBe('24-hour');
  });

  it('treats a missing key as system', () => {
    const legacySnapshot = { ...DEFAULT_UI_PREFERENCES } as Partial<UIPreferences>;
    Reflect.deleteProperty(legacySnapshot, 'hourCyclePreference');

    const store = {
      getSnapshot: () => legacySnapshot as UIPreferences,
      update: jest.fn(),
      observe: jest.fn(),
    } as unknown as PreferencesStore;

    expect(new HourCyclePreferences(store).preference).toBe('system');
  });
});
