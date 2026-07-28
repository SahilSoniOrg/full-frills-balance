import { LaunchArguments } from 'react-native-launch-arguments';
import { E2E_AUTH_TOKEN, E2E_SEED_PROFILES, E2eSeedProfile } from './e2eConstants';

export type E2eLaunchConfig = {
  reset: boolean;
  seedProfile?: E2eSeedProfile;
};

function isSeedProfile(value: unknown): value is E2eSeedProfile {
  return typeof value === 'string' && (E2E_SEED_PROFILES as readonly string[]).includes(value);
}

/**
 * Reads Detox / instrumentation launch arguments.
 * Honored in debug and release simulator builds when `e2eAuth` matches.
 */
export function readE2eLaunchConfig(): E2eLaunchConfig | null {
  const args = LaunchArguments.value() ?? {};
  const auth = args.e2eAuth;
  if (auth !== E2E_AUTH_TOKEN) {
    return null;
  }

  const reset = args.e2eReset === '1' || args.e2eReset === true || args.e2eReset === 'true';
  const seedProfile = isSeedProfile(args.e2eSeedProfile) ? args.e2eSeedProfile : undefined;

  return {
    reset: reset || Boolean(seedProfile),
    seedProfile,
  };
}
