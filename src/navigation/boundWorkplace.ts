import { AppConfig } from '@/src/constants';
import { useOptionalWorkplace, useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { WorkplaceId } from '@/src/types/ids';
import { asWorkplaceId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

export const WORKPLACE_MISMATCH_MESSAGE = AppConfig.strings.navigation.workplaceBound.message;

function routeWorkplaceId(params: { workplaceId?: string | string[] }): string | undefined {
  return typeof params.workplaceId === 'string' && params.workplaceId
    ? params.workplaceId
    : undefined;
}

/**
 * Captures the workplace a creation route was opened in (route param, else the
 * active provider at mount). Stable for the life of the screen.
 */
export function useWorkplaceLaunchBinding() {
  const workplace = useOptionalWorkplace();
  const params = useLocalSearchParams<{ workplaceId?: string | string[] }>();
  const [launchWorkplaceId] = useState(() => routeWorkplaceId(params) ?? workplace?.workplaceId);
  const mismatched =
    !!launchWorkplaceId && !!workplace?.workplaceId && launchWorkplaceId !== workplace.workplaceId;
  return { launchWorkplaceId, mismatched };
}

/** Launch workplace for save handlers that require an active WorkplaceProvider. */
export function useLaunchWorkplaceId(): WorkplaceId {
  const { workplaceId } = useWorkplace();
  const { launchWorkplaceId } = useWorkplaceLaunchBinding();
  return asWorkplaceId(launchWorkplaceId ?? workplaceId);
}

/** Save-time gate: refuse writes when the committed workplace is no longer the launch one. */
export function assertBoundWorkplace(launchId: WorkplaceId, activeId: WorkplaceId): void {
  if (launchId !== activeId) {
    throw new Error(WORKPLACE_MISMATCH_MESSAGE);
  }
}

/**
 * Shared save-bind helper: launch id + active books id, with a one-call assert.
 * Prefer this in creation/edit save handlers over wiring the two hooks separately.
 */
export function useBoundWorkplaceSaveGate(): {
  workplaceId: WorkplaceId;
  launchWorkplaceId: WorkplaceId;
  assertBound: () => void;
} {
  const { workplaceId } = useWorkplace();
  const launchWorkplaceId = useLaunchWorkplaceId();
  return {
    workplaceId,
    launchWorkplaceId,
    assertBound: () => assertBoundWorkplace(launchWorkplaceId, workplaceId),
  };
}
