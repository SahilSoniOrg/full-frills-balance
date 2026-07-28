import Constants from 'expo-constants';
import { LaunchArguments } from 'react-native-launch-arguments';
import { E2E_AUTH_TOKEN, E2E_SEED_PROFILES, E2eSeedProfile } from './e2eConstants';

export type E2eLaunchConfig = {
  reset: boolean;
  seedProfile?: E2eSeedProfile;
};

function isSeedProfile(value: unknown): value is E2eSeedProfile {
  return typeof value === 'string' && (E2E_SEED_PROFILES as readonly string[]).includes(value);
}

function configFromArgs(args: Record<string, unknown>): E2eLaunchConfig | null {
  if (args.e2eAuth !== E2E_AUTH_TOKEN) {
    return null;
  }
  const reset = args.e2eReset === '1' || args.e2eReset === true || args.e2eReset === 'true';
  const seedProfile = isSeedProfile(args.e2eSeedProfile) ? args.e2eSeedProfile : undefined;
  return {
    reset: reset || Boolean(seedProfile),
    seedProfile,
  };
}

/**
 * Reads Detox / instrumentation launch arguments.
 * Honored in debug and release simulator builds when `e2eAuth` matches.
 */
export function readE2eLaunchConfig(): E2eLaunchConfig | null {
  const fromLaunch = configFromArgs(LaunchArguments.value() ?? {});
  if (fromLaunch) {
    return fromLaunch;
  }

  // Fallback when native launch args are unavailable but the binary was built with E2E env.
  const extra = Constants.expoConfig?.extra as
    { e2eHarnessEnabled?: boolean; e2eSeedProfile?: string } | undefined;
  if (!extra?.e2eHarnessEnabled) {
    return null;
  }
  const seedProfile = isSeedProfile(extra.e2eSeedProfile) ? extra.e2eSeedProfile : undefined;
  if (!seedProfile) {
    return null;
  }
  return { reset: true, seedProfile };
}
