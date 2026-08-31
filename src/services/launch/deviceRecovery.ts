import { preferences } from '@/src/utils/preferences';

export interface DeviceRecoveryInput {
  /** Raw presence captured before preference migration synthesizes defaults. */
  readonly deviceBagPresent: boolean;
  readonly deviceClaimed: boolean;
  readonly workplaceCount: number;
  readonly userName?: string;
  readonly onboardingStage?: 'user_profile' | 'workplace_setup' | 'post_import' | 'complete';
}

export interface DeviceRecoveryResult {
  readonly kind: 'not_needed' | 'recovered';
  /** Explicit effect for the coordinator when existing books prove old setup. */
  readonly shouldClaimDevice: boolean;
  /** Persist synthesized defaults when the Device bag was absent. */
  readonly shouldPersistDeviceDefaults: boolean;
  /** Set only when the User bag needs a canonical display-name repair. */
  readonly userNameRepair?: string;
}

/**
 * Decide how to recover a missing Device preference bag.
 *
 * Existing Workplaces are the upgrade proof that setup completed. Their
 * contents are intentionally irrelevant: even an empty legacy Workplace is
 * preserved and treated as a completed install. Persistence is the
 * coordinator's responsibility.
 */
export function decideDeviceRecovery(input: DeviceRecoveryInput): DeviceRecoveryResult {
  const existingBooksProveCompletion = input.workplaceCount > 0;
  const needsMissingBagRecovery = !input.deviceBagPresent;
  const needsClaimRepair =
    existingBooksProveCompletion && !input.deviceClaimed && input.onboardingStage !== 'post_import';
  if (!needsMissingBagRecovery && !needsClaimRepair) {
    return { kind: 'not_needed', shouldClaimDevice: false, shouldPersistDeviceDefaults: false };
  }

  const hasUserName = Boolean(input.userName?.trim());

  return {
    kind: 'recovered',
    shouldClaimDevice: existingBooksProveCompletion,
    shouldPersistDeviceDefaults: needsMissingBagRecovery,
    ...(existingBooksProveCompletion && !hasUserName ? { userNameRepair: 'User' } : {}),
  };
}

export function applyDeviceRecovery(result: DeviceRecoveryResult): void {
  if (result.shouldPersistDeviceDefaults) preferences.device.persist();
  if (result.shouldClaimDevice) {
    preferences.device.setDeviceRegistered(true);
    preferences.device.setOnboardingStage('complete');
    preferences.device.setOnboardingCompleted(true);
  }
  if (result.userNameRepair) preferences.setUserName(result.userNameRepair);
}
