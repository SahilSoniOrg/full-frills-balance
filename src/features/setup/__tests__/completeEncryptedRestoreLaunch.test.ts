import { finishDeviceSetup } from '../setupFinishers';
import { defaultDeviceDisplayName } from '../first-run/localeDefaults';
import { clearSetupDraft, loadSetupDraft } from '@/src/services/setup/SetupDraftStore';
import { preferences } from '@/src/services/preferences';
import {
  completeEncryptedRestoreLaunch,
  needsEncryptedRestoreLaunchCompletion,
} from '../completeEncryptedRestoreLaunch';

jest.mock('../setupFinishers', () => ({
  finishDeviceSetup: jest.fn(),
}));
jest.mock('@/src/services/setup/SetupDraftStore', () => ({
  loadSetupDraft: jest.fn(),
  clearSetupDraft: jest.fn(),
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    device: {
      deviceRegistered: false,
      setActiveWorkplaceId: jest.fn(),
    },
    userName: undefined,
  },
}));

describe('completeEncryptedRestoreLaunch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(preferences.device).deviceRegistered = false;
  });

  it('registers the device, activates the workplace, and clears blocking setup', () => {
    jest.mocked(loadSetupDraft).mockReturnValue({
      kind: 'restore',
      restore: { deviceCandidate: { value: '  My Device  ' } },
    } as never);
    completeEncryptedRestoreLaunch('wp-1' as never);
    expect(finishDeviceSetup).toHaveBeenCalledWith({
      displayName: { value: 'My Device', source: 'user_entered' },
    });
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith('wp-1');
    expect(clearSetupDraft).toHaveBeenCalled();
  });

  it('falls back to preferences and locale defaults for the device display name', () => {
    jest.mocked(loadSetupDraft).mockReturnValue(null);
    jest.mocked(preferences).userName = '  Phone  ';
    completeEncryptedRestoreLaunch('wp-2' as never);
    expect(finishDeviceSetup).toHaveBeenCalledWith({
      displayName: { value: 'Phone', source: 'user_entered' },
    });
    jest.mocked(preferences).userName = undefined;
    completeEncryptedRestoreLaunch('wp-3' as never);
    expect(finishDeviceSetup).toHaveBeenLastCalledWith({
      displayName: { value: defaultDeviceDisplayName(), source: 'user_entered' },
    });
  });

  it('preserves device registration when the device is already registered', () => {
    jest.mocked(preferences.device).deviceRegistered = true;
    completeEncryptedRestoreLaunch('wp-existing' as never);
    expect(finishDeviceSetup).not.toHaveBeenCalled();
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith('wp-existing');
    expect(clearSetupDraft).toHaveBeenCalled();
  });

  it('detects first-run style completion needs', () => {
    jest.mocked(loadSetupDraft).mockReturnValue({
      entryPolicy: 'blocking',
      journeyId: 'first_run',
    } as never);
    expect(needsEncryptedRestoreLaunchCompletion()).toBe(true);
  });
});
