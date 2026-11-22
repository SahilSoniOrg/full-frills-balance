import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { preferences } from '@/src/services/preferences';
import { reactiveCacheCoordinator } from '@/src/services/reactive/ReactiveCacheCoordinator';
import { widgetProjectionService } from '@/src/services/widgets/WidgetProjectionService';
import { snapshotService } from '@/src/data/cache/SnapshotService';

jest.mock('@/src/data/repositories/DatabaseRepository', () => ({
  databaseRepository: {
    resetDatabase: jest.fn(),
    destroyWorkplace: jest.fn(),
    purgeWorkplaceData: jest.fn(),
  },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    clearPreferences: jest.fn(),
    device: { activeWorkplaceId: undefined, setActiveWorkplaceId: jest.fn() },
    workplace: { clear: jest.fn() },
  },
}));
jest.mock('@/src/services/reactive/ReactiveCacheCoordinator', () => ({
  reactiveCacheCoordinator: { clearAll: jest.fn() },
}));
jest.mock('@/src/services/widgets/WidgetProjectionService', () => ({
  widgetProjectionService: {
    clearAll: jest.fn().mockResolvedValue(undefined),
    clearWorkplace: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/data/cache/SnapshotService', () => ({
  snapshotService: {
    clearSnapshots: jest.fn(() => true),
    clearSnapshotsForWorkplace: jest.fn(() => true),
    resumeSnapshotsForWorkplace: jest.fn(),
  },
}));
jest.mock('@/src/data/storage/storage', () => ({
  storage: {
    clearAll: jest.fn(),
    remove: jest.fn(),
    getString: jest.fn(),
    set: jest.fn(),
  },
}));
jest.mock('@/src/services/audit-identity', () => ({ clearLocalAuditActorId: jest.fn() }));
jest.mock('@/src/services/import/restorePublicationClaims', () => ({
  restorePublicationClaims: { clearAll: jest.fn() },
}));
jest.mock('@/src/services/sms/ShortcutSmsIntakeService', () => ({
  shortcutSmsIntakeService: {
    resetWithDatabase: jest.fn(async (run: () => Promise<unknown>) => {
      await run();
      return undefined;
    }),
  },
}));
jest.mock('@/modules/expo-sms-inbox/shortcut', () => ({
  getPending: jest.fn(),
  acknowledge: jest.fn().mockResolvedValue(undefined),
  stageReset: jest.fn().mockResolvedValue(undefined),
  hasStagedReset: jest.fn().mockResolvedValue(false),
  finishReset: jest.fn().mockResolvedValue(undefined),
  purgeRetired: jest.fn().mockResolvedValue(undefined),
}));

export function resetIntegrityMaintenanceTestState() {
  jest.clearAllMocks();
  (preferences.device as any).activeWorkplaceId = 'wp-a';
  (snapshotService.clearSnapshots as jest.Mock).mockReturnValue(true);
  (snapshotService.clearSnapshotsForWorkplace as jest.Mock).mockReturnValue(true);
  (widgetProjectionService.clearAll as jest.Mock).mockResolvedValue(undefined);
  (widgetProjectionService.clearWorkplace as jest.Mock).mockResolvedValue(undefined);
}

export {
  databaseRepository,
  preferences,
  reactiveCacheCoordinator,
  snapshotService,
  widgetProjectionService,
};
