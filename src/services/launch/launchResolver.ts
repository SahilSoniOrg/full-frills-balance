import { WorkplaceId } from '@/src/types/ids';

export type LaunchResolution =
  | { readonly kind: 'device_onboarding' }
  | { readonly kind: 'workplace_creation' }
  | { readonly kind: 'picker' }
  | {
      readonly kind: 'open';
      readonly workplaceId: WorkplaceId;
      readonly persistAsActive: boolean;
    };

export interface LaunchResolverInput {
  readonly deviceClaimed: boolean;
  readonly activeWorkplaceId?: WorkplaceId;
  readonly pendingWorkplaceId?: WorkplaceId;
  readonly workplaceIds: readonly WorkplaceId[];
}

/**
 * Decide which launch gate is valid for the current Device and discovered
 * Workplaces. This function is deliberately pure: callers own all writes.
 */
export function resolveLaunchGate(input: LaunchResolverInput): LaunchResolution {
  const { deviceClaimed, activeWorkplaceId, pendingWorkplaceId, workplaceIds } = input;

  if (!deviceClaimed) return { kind: 'device_onboarding' };
  if (workplaceIds.length === 0) return { kind: 'workplace_creation' };

  if (pendingWorkplaceId && workplaceIds.includes(pendingWorkplaceId)) {
    return { kind: 'open', workplaceId: pendingWorkplaceId, persistAsActive: true };
  }

  if (activeWorkplaceId && workplaceIds.includes(activeWorkplaceId)) {
    return { kind: 'open', workplaceId: activeWorkplaceId, persistAsActive: false };
  }

  if (workplaceIds.length === 1) {
    return { kind: 'open', workplaceId: workplaceIds[0], persistAsActive: true };
  }

  return { kind: 'picker' };
}
