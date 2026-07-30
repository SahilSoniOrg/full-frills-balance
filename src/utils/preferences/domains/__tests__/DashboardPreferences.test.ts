import { DEFAULT_UI_PREFERENCES, type UIPreferences } from '../../types';
import { DashboardPreferences } from '../DashboardPreferences';
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

describe('DashboardPreferences', () => {
  it('defaults showSafeToSpendChart to true', () => {
    const dashboard = new DashboardPreferences(createMockStore());
    expect(dashboard.showSafeToSpendChart).toBe(true);
  });

  it('persists showSafeToSpendChart updates', () => {
    const store = createMockStore();
    const dashboard = new DashboardPreferences(store);

    dashboard.setShowSafeToSpendChart(false);
    expect(dashboard.showSafeToSpendChart).toBe(false);

    dashboard.setShowSafeToSpendChart(true);
    expect(dashboard.showSafeToSpendChart).toBe(true);
  });

  it('treats missing showSafeToSpendChart as visible', () => {
    const legacySnapshot = { ...DEFAULT_UI_PREFERENCES } as Partial<UIPreferences>;
    Reflect.deleteProperty(legacySnapshot, 'showSafeToSpendChart');

    const store = {
      getSnapshot: () => legacySnapshot as UIPreferences,
      update: jest.fn(),
      observe: jest.fn(),
    } as unknown as PreferencesStore;

    const dashboard = new DashboardPreferences(store);
    expect(dashboard.showSafeToSpendChart).toBe(true);
  });
});
