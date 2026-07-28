import { LaunchArguments } from 'react-native-launch-arguments';
import { E2E_AUTH_TOKEN } from '../e2eConstants';
import { readE2eLaunchConfig } from '../e2eLaunchArgs';

jest.mock('react-native-launch-arguments', () => ({
  LaunchArguments: {
    value: jest.fn(),
  },
}));

describe('readE2eLaunchConfig', () => {
  const valueMock = LaunchArguments.value as jest.Mock;

  beforeEach(() => {
    valueMock.mockReset();
  });

  it('returns null without auth token', () => {
    valueMock.mockReturnValue({ e2eSeedProfile: 'onboarded' });
    expect(readE2eLaunchConfig()).toBeNull();
  });

  it('parses seed profile when authorized', () => {
    valueMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eSeedProfile: 'journal-ready',
    });
    expect(readE2eLaunchConfig()).toEqual({
      reset: true,
      seedProfile: 'journal-ready',
    });
  });
});
