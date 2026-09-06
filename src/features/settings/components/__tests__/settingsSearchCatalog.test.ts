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

    result.onPress();
    shareFormat.onPress();
    expect(actions.onCurrentWorkplace).toHaveBeenCalled();
    expect(actions.onDataManagement).toHaveBeenCalledWith('share-format');
  });
});
