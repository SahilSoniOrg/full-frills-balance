import {
  createSettingsSearchCatalog,
  filterSettingsSearchItems,
} from '@/src/features/settings/components/settingsSearchCatalog';

const actions = {
  onProfile: jest.fn(),
  onAppearance: jest.fn(),
  onAutomation: jest.fn(),
  onPrivacy: jest.fn(),
  onCurrentWorkplace: jest.fn(),
  onDataManagement: jest.fn(),
  onMaintenance: jest.fn(),
  onAbout: jest.fn(),
  onDeviceSettings: jest.fn(),
};

describe('settings search catalog', () => {
  it('matches titles, descriptions, and aliases', () => {
    const catalog = createSettingsSearchCatalog(actions);

    expect(filterSettingsSearchItems(catalog, 'lock').map(item => item.id)).toContain('app-lock');
    expect(filterSettingsSearchItems(catalog, 'money horizon').map(item => item.id)).toContain(
      'safe-to-spend-forecast',
    );
    expect(filterSettingsSearchItems(catalog, '  APPEARANCE  ').length).toBeGreaterThan(0);
  });

  it('returns no results for an empty query', () => {
    const catalog = createSettingsSearchCatalog(actions);

    expect(filterSettingsSearchItems(catalog, '')).toEqual([]);
    expect(filterSettingsSearchItems(catalog, '   ')).toEqual([]);
  });

  it('keeps the destination callback on each result', () => {
    const catalog = createSettingsSearchCatalog(actions);
    const result = filterSettingsSearchItems(catalog, 'currency')[0];
    const shareFormat = filterSettingsSearchItems(catalog, 'share format')[0];

    result.navigate(result.focusId);
    shareFormat.navigate(shareFormat.focusId);
    expect(actions.onCurrentWorkplace).toHaveBeenCalledWith(result.focusId);
    expect(actions.onDataManagement).toHaveBeenCalledWith('share-format');
  });

  it('uses the rendered focus target as the navigation target', () => {
    const catalog = createSettingsSearchCatalog(actions);
    const appearanceMode = catalog.find(item => item.id === 'appearance-mode');
    const dataManagement = catalog.find(item => item.id === 'data-management');

    if (appearanceMode) appearanceMode.navigate(appearanceMode.focusId);
    if (dataManagement) dataManagement.navigate(dataManagement.focusId);

    expect(actions.onAppearance).toHaveBeenCalledWith(appearanceMode?.focusId);
    expect(actions.onDataManagement).toHaveBeenCalledWith(dataManagement?.focusId);
  });

  it('records the rendered focus target when it differs from the search id', () => {
    const catalog = createSettingsSearchCatalog(actions);

    expect(catalog.find(item => item.id === 'appearance-mode')?.focusId).toBe('mode');
    expect(catalog.find(item => item.id === 'data-management')?.focusId).toBe('data-export');
    expect(catalog.find(item => item.id === 'maintenance')?.focusId).toBe('integrity');
    expect(catalog.every(item => item.focusId.length > 0)).toBe(true);
  });
});
