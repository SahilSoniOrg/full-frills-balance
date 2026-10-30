import type { LaunchResolution, LaunchSetupDraft } from '@/src/services/launch/launchResolver';
import type { PlainWorkplace } from '@/src/types/plainDtos';

export type LaunchCoordinatorState =
  | { kind: 'loading'; retry: () => void }
  | { kind: 'error'; error: Error; retry: () => void }
  | Extract<LaunchResolution, { kind: 'setup' }>
  | (Extract<LaunchResolution, { kind: 'picker' }> & { workplaces: PlainWorkplace[] })
  | (Extract<LaunchResolution, { kind: 'open' }> & { workplace: PlainWorkplace });

export type { LaunchSetupDraft };
