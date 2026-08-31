import { AppConfig } from '@/src/constants/app-config';
import { WorkplaceId } from '@/src/types/ids';
import { DEFAULT_WORKPLACE_PREFERENCES } from '../../workplaceTypes';
import { StsPreferences } from '../StsPreferences';
import type { DevicePreferencesStore } from '../../DevicePreferencesStore';
import type { WorkplacePreferencesStore } from '../../WorkplacePreferencesStore';
import { of } from 'rxjs';

function createStores(activeId: WorkplaceId | undefined = 'wp-1' as WorkplaceId) {
  const snapshots = new Map<string, typeof DEFAULT_WORKPLACE_PREFERENCES>();
  const workplace = {
    getSnapshot: (id: WorkplaceId) => snapshots.get(id) ?? { ...DEFAULT_WORKPLACE_PREFERENCES },
    update: (id: WorkplaceId, patch: Partial<typeof DEFAULT_WORKPLACE_PREFERENCES>) => {
      snapshots.set(id, {
        ...(snapshots.get(id) ?? { ...DEFAULT_WORKPLACE_PREFERENCES }),
        ...patch,
      });
    },
    observe: jest.fn(),
  } as unknown as WorkplacePreferencesStore;

  const device = {
    activeWorkplaceId: activeId,
    observe: () => of(activeId),
  } as unknown as DevicePreferencesStore;

  return { workplace, device, snapshots, sts: new StsPreferences(workplace, device) };
}

describe('StsPreferences', () => {
  it('defaults safeToSpendDays from AppConfig', () => {
    const { sts } = createStores();
    expect(sts.safeToSpendDays).toBe(AppConfig.defaults.safeToSpendDays);
  });

  it('persists safeToSpendDays on the active workplace only', () => {
    const { sts, snapshots } = createStores('wp-1' as WorkplaceId);
    sts.setSafeToSpendDays(60);
    expect(sts.safeToSpendDays).toBe(60);
    expect(snapshots.get('wp-1')?.safeToSpendDays).toBe(60);
    expect(snapshots.get('wp-2')).toBeUndefined();
  });

  it('reads a specific workplace horizon', () => {
    const { sts, workplace } = createStores('wp-1' as WorkplaceId);
    workplace.update('wp-2' as WorkplaceId, { safeToSpendDays: 90 });
    expect(sts.forWorkplace('wp-2' as WorkplaceId)).toBe(90);
    expect(sts.forWorkplace('wp-1' as WorkplaceId)).toBe(AppConfig.defaults.safeToSpendDays);
  });
});
