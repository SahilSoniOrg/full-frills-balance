import { act, render, waitFor } from '@testing-library/react-native';
import { BehaviorSubject } from 'rxjs';
import { encryptionSetup } from '@/src/services/backup/encryptionSetup';
import { workplaceService } from '@/src/services/WorkplaceService';
import { LaunchCoordinatorProvider, useLaunchCoordinator } from '../LaunchCoordinator';

jest.mock('@shopify/flash-list', () => ({ FlashList: () => null }));
jest.mock('@/src/services/backup/encryptionSetup', () => ({
  encryptionSetup: { finishRecoveryCompletion: jest.fn() },
}));
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    observeAllWorkplaces: jest.fn(),
    migrateLegacyCurrency: jest.fn(async () => undefined),
  },
}));
jest.mock('@/src/contexts/app-shell/AppReadyProvider', () => ({
  useAppReady: () => ({ isInitialized: true }),
}));
jest.mock('@/src/services/launch/deviceRecovery', () => ({
  decideDeviceRecovery: jest.fn(() => ({ kind: 'none' })),
  applyDeviceRecovery: jest.fn(),
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    rawDeviceBagPresentAtStartup: true,
    userName: 'Test',
    device: {
      activeWorkplaceId: null,
      deviceRegistered: false,
      observe: () => jest.requireActual('rxjs').NEVER,
    },
  },
}));
jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

function LaunchKind({ onKind }: { onKind: (kind: string) => void }) {
  onKind(useLaunchCoordinator().kind);
  return null;
}

it('opens launch and finishes recovery once when the pending recovery session is unreadable', async () => {
  const workplaces = new BehaviorSubject<never[]>([]);
  jest.mocked(workplaceService.observeAllWorkplaces).mockReturnValue(workplaces);
  jest
    .mocked(encryptionSetup.finishRecoveryCompletion)
    .mockRejectedValue(new Error('Invalid encryption setup session'));
  const kinds: string[] = [];

  render(
    <LaunchCoordinatorProvider>
      <LaunchKind onKind={kind => kinds.push(kind)} />
    </LaunchCoordinatorProvider>,
  );
  await waitFor(() => expect(kinds.at(-1)).toBe('setup'));
  await act(async () => workplaces.next([]));

  expect(kinds).not.toContain('error');
  expect(encryptionSetup.finishRecoveryCompletion).toHaveBeenCalledTimes(1);
});
