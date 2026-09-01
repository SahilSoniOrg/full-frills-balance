import { WorkplaceId } from '@/src/types/ids';

/**
 * The launch layer only needs these two facts from Setup. The Setup feature
 * owns the full draft and validates it before handing this projection to
 * launch. Keeping the projection small prevents launch from learning about
 * individual setup slices.
 */
export type LaunchSetupDraft =
  | { readonly unreadable: true }
  | {
      readonly unreadable?: false;
      readonly journeyId: string;
      readonly entryPolicy: 'blocking' | 'optional';
    };

export type LaunchResolution =
  | { readonly kind: 'setup'; readonly journeyId: string; readonly unreadable?: true }
  | { readonly kind: 'picker' }
  | {
      readonly kind: 'open';
      readonly workplaceId: WorkplaceId;
      readonly persistAsActive: boolean;
    };

export interface LaunchResolverInput {
  /** A validated Setup projection. Blocking drafts take precedence. */
  readonly setupDraft?: LaunchSetupDraft;
  readonly deviceClaimed: boolean;
  readonly activeWorkplaceId?: WorkplaceId;
  readonly workplaceIds: readonly WorkplaceId[];
}

/**
 * Decide which launch gate is valid for the current Device and discovered
 * Workplaces. This function is deliberately pure: callers own all writes.
 */
export function resolveLaunchGate(input: LaunchResolverInput): LaunchResolution {
  const { deviceClaimed, activeWorkplaceId, workplaceIds } = input;

  if (input.setupDraft && 'unreadable' in input.setupDraft && input.setupDraft.unreadable) {
    return { kind: 'setup', journeyId: 'first_run', unreadable: true };
  }

  if (
    input.setupDraft &&
    input.setupDraft.entryPolicy === 'blocking' &&
    input.setupDraft.journeyId.trim()
  ) {
    return { kind: 'setup', journeyId: input.setupDraft.journeyId };
  }

  if (!deviceClaimed) return { kind: 'setup', journeyId: 'first_run' };
  if (workplaceIds.length === 0) return { kind: 'setup', journeyId: 'empty_device_workplace' };

  if (activeWorkplaceId && workplaceIds.includes(activeWorkplaceId)) {
    return { kind: 'open', workplaceId: activeWorkplaceId, persistAsActive: false };
  }

  if (workplaceIds.length === 1) {
    return { kind: 'open', workplaceId: workplaceIds[0], persistAsActive: true };
  }

  return { kind: 'picker' };
}
