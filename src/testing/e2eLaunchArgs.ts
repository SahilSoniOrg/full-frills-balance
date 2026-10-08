import Constants from 'expo-constants';
import { NativeModules } from 'react-native';
import { LaunchArguments } from 'react-native-launch-arguments';
import {
  E2E_AUTH_TOKEN,
  E2E_SEED_PROFILES,
  E2eSeedProfile,
  E2eUpdateGateMode,
  E2E_UPDATE_FLOWS,
  E2eUpdateFlow,
} from './e2eConstants';
import { isE2eHarnessEnabled } from './e2eRuntimeGate';

export type E2eLaunchConfig = {
  reset: boolean;
  seedProfile?: E2eSeedProfile;
  backupPath?: string;
  updateGateMode?: E2eUpdateGateMode;
  updateFlow?: E2eUpdateFlow;
};

function isSeedProfile(value: unknown): value is E2eSeedProfile {
  return typeof value === 'string' && (E2E_SEED_PROFILES as readonly string[]).includes(value);
}

function isUpdateGateMode(value: unknown): value is E2eUpdateGateMode {
  return value === 'available' || value === 'required';
}

function configFromArgs(args: Record<string, unknown>): E2eLaunchConfig | null {
  if (args.e2eAuth !== E2E_AUTH_TOKEN) {
    return null;
  }
  const reset = args.e2eReset === '1' || args.e2eReset === true || args.e2eReset === 'true';
  const seedProfile = isSeedProfile(args.e2eSeedProfile) ? args.e2eSeedProfile : undefined;
  const backupPath = typeof args.e2eBackupPath === 'string' ? args.e2eBackupPath : undefined;
  const updateGateMode = isUpdateGateMode(args.e2eUpdateGateMode)
    ? args.e2eUpdateGateMode
    : undefined;
  const updateFlow =
    typeof args.e2eUpdateFlow === 'string' &&
    (E2E_UPDATE_FLOWS as readonly string[]).includes(args.e2eUpdateFlow)
      ? (args.e2eUpdateFlow as E2eUpdateFlow)
      : undefined;
  return {
    reset: reset || Boolean(seedProfile),
    seedProfile,
    backupPath,
    ...(updateGateMode ? { updateGateMode } : {}),
    ...(updateFlow ? { updateFlow } : {}),
  };
}

function configFromScriptUrl(): E2eLaunchConfig | null {
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL) {
    return null;
  }
  try {
    const params = new URL(scriptURL).searchParams;
    const query: Record<string, string> = {};
    params.forEach((value, key) => {
      query[key] = value;
    });
    return configFromArgs(query);
  } catch {
    return null;
  }
}

/**
 * Reads Detox / instrumentation launch arguments.
 * Honored only in an E2E-capable build when `e2eAuth` matches.
 */
export function readE2eLaunchConfig(): E2eLaunchConfig | null {
  if (!isE2eHarnessEnabled()) {
    return null;
  }

  const fromLaunch = configFromArgs(LaunchArguments.value() ?? {});
  if (fromLaunch) {
    return fromLaunch;
  }

  const fromScript = configFromScriptUrl();
  if (fromScript) {
    return fromScript;
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
  const updateGateMode = isUpdateGateMode(process.env.EXPO_PUBLIC_UPDATE_GATE_E2E)
    ? process.env.EXPO_PUBLIC_UPDATE_GATE_E2E
    : undefined;
  return {
    reset: true,
    seedProfile,
    ...(updateGateMode ? { updateGateMode } : {}),
  };
}
