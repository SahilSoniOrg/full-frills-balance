import { useCallback, useEffect, useRef, useState } from 'react';
import { filter, firstValueFrom, timeout, TimeoutError } from 'rxjs';
import { useNavigationContainerRef, useRouter } from 'expo-router';
import {
  dispatchWorkplaceSwitchHistory,
  rewriteStackForWorkplaceSwitch,
} from '@/src/navigation/workplaceSwitchHistory';
import { sharingRuntime } from '@/src/services/SharingService';
import { workplaceService } from '@/src/services/WorkplaceService';
import { evictWorkplaceReactiveCaches } from '@/src/services/reactive/evictWorkplaceReactiveCaches';
import { preferences } from '@/src/services/preferences';
import type { WorkplaceId } from '@/src/types/ids';
import type { PlainWorkplace } from '@/src/types/plainDtos';
import type { LaunchCoordinatorState } from '../LaunchCoordinator.types';
import { logger } from '@/src/utils/logger';

const WORKPLACE_SCOPE_TIMEOUT_MS = 15_000;
const WORKPLACE_SWITCH_TIMEOUT_MESSAGE = 'Switching workplace took too long. Try again.';

type DeleteWorkplaceResult = {
  status: 'committed' | 'committed_with_warnings';
  warnings: string[];
};

export type WorkplaceTransition = (
  targetId: WorkplaceId,
  previousId?: WorkplaceId,
  options?: {
    preserveRoute?: boolean;
    rejectOnError?: boolean;
    onTargetValidated?: (workplace: PlainWorkplace) => void;
    onTransitionCommitted?: () => void;
  },
) => Promise<void>;

export interface RootNavigationResetter<State> {
  resetRoot(state: State): void;
}

export function restoreRootNavigationState<State>(
  navigation: RootNavigationResetter<State>,
  previousState: State | undefined,
): void {
  if (previousState !== undefined) navigation.resetRoot(previousState);
}

export function shouldSkipWorkplaceTransition(
  targetId: WorkplaceId,
  activeId: WorkplaceId | undefined,
  strict: boolean,
): boolean {
  return activeId === targetId && !strict;
}

export function shouldRollbackWorkplacePointer({
  pointerMoved,
  strict,
  targetWasActiveAtStart,
  fromWorkplaceId,
  targetWorkplaceId,
}: {
  readonly pointerMoved: boolean;
  readonly strict: boolean;
  readonly targetWasActiveAtStart: boolean;
  readonly fromWorkplaceId?: WorkplaceId;
  readonly targetWorkplaceId: WorkplaceId;
}): boolean {
  return (
    pointerMoved ||
    (strict &&
      targetWasActiveAtStart &&
      fromWorkplaceId !== targetWorkplaceId)
  );
}

export async function rollbackFailedWorkplaceTransition<State>({
  fromWorkplaceId,
  targetWorkplaceId,
  pointerMoved,
  historyRewritten,
  previousNavigationState,
  safeNavigationState,
  getActiveWorkplaceId,
  switchWorkplace,
  clearActiveWorkplace,
  restoreNavigation,
  onRollbackFailure,
}: {
  readonly fromWorkplaceId?: WorkplaceId;
  readonly targetWorkplaceId: WorkplaceId;
  readonly pointerMoved: boolean;
  readonly historyRewritten: boolean;
  readonly previousNavigationState: State | undefined;
  readonly safeNavigationState: State | undefined;
  readonly getActiveWorkplaceId: () => WorkplaceId | undefined;
  readonly switchWorkplace: (id: WorkplaceId) => Promise<void>;
  readonly clearActiveWorkplace?: () => void;
  readonly restoreNavigation: (state: State | undefined) => void;
  readonly onRollbackFailure: (step: 'pointer' | 'navigation', error: unknown) => void;
}): Promise<void> {
  let pointerRestored = !pointerMoved || getActiveWorkplaceId() !== targetWorkplaceId;
  if (pointerMoved && getActiveWorkplaceId() === targetWorkplaceId) {
    if (fromWorkplaceId) {
      try {
        await switchWorkplace(fromWorkplaceId);
      } catch (error) {
        onRollbackFailure('pointer', error);
      }
    } else {
      try {
        clearActiveWorkplace?.();
      } catch (error) {
        onRollbackFailure('pointer', error);
      }
    }
    pointerRestored = getActiveWorkplaceId() !== targetWorkplaceId;
  }
  if (historyRewritten) {
    try {
      restoreNavigation(pointerRestored ? previousNavigationState : safeNavigationState);
    } catch (error) {
      onRollbackFailure('navigation', error);
    }
  }
}

async function awaitWorkplaceScope(
  workplaceId: WorkplaceId,
  timeoutMs: number = WORKPLACE_SCOPE_TIMEOUT_MS,
): Promise<PlainWorkplace> {
  try {
    return await firstValueFrom(
      workplaceService.observeWorkplace(workplaceId).pipe(
        filter(workplace => !!workplace.defaultCurrencyCode),
        timeout(timeoutMs),
      ),
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new Error(WORKPLACE_SWITCH_TIMEOUT_MESSAGE);
    }
    throw error instanceof Error ? error : new Error(`Workplace is unavailable: ${workplaceId}`);
  }
}

function remainingSwitchMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

export function useWorkplaceTransitions(state: LaunchCoordinatorState) {
  const router = useRouter();
  const rootNavigation = useNavigationContainerRef();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [pendingDeletionId, setPendingDeletionId] = useState<WorkplaceId | null>(null);
  const transitionSequence = useRef(0);
  const transitionInFlightRef = useRef<Promise<void> | null>(null);
  const deletionInFlightRef = useRef<Promise<DeleteWorkplaceResult> | null>(null);
  const deletionWaiterRef = useRef<{
    resolve: (result: DeleteWorkplaceResult) => void;
    reject: (error: unknown) => void;
  } | null>(null);
  const committedWorkplaceRef = useRef<{
    id: WorkplaceId | null;
    waiters: Set<(id: WorkplaceId) => void>;
  }>({ id: null, waiters: new Set() });

  useEffect(() => {
    if (state.kind !== 'open') committedWorkplaceRef.current.id = null;
  }, [state.kind]);

  const clearWorkplaceHistory = useCallback(() => {
    dispatchWorkplaceSwitchHistory({
      getState: () => rootNavigation.getRootState(),
      dispatch: action => rootNavigation.dispatch(action),
    });
  }, [rootNavigation]);

  const onCommittedWorkplace = useCallback((id: WorkplaceId) => {
    committedWorkplaceRef.current.id = id;
    for (const waiter of [...committedWorkplaceRef.current.waiters]) waiter(id);
  }, []);

  const awaitCommittedWorkplace = useCallback(
    (targetId: WorkplaceId, timeoutMs: number, allowCurrentCommit: boolean) => {
      if (allowCurrentCommit && committedWorkplaceRef.current.id === targetId) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          committedWorkplaceRef.current.waiters.delete(onReady);
          reject(new Error(WORKPLACE_SWITCH_TIMEOUT_MESSAGE));
        }, timeoutMs);
        const onReady = (id: WorkplaceId) => {
          if (id !== targetId) return;
          clearTimeout(timer);
          committedWorkplaceRef.current.waiters.delete(onReady);
          resolve();
        };
        committedWorkplaceRef.current.waiters.add(onReady);
      });
    },
    [],
  );

  const transitionToWorkplace = useCallback<WorkplaceTransition>(
    async (targetId, previousId, options) => {
      setTransitionError(null);
      const queuedBehind = transitionInFlightRef.current;
      if (!queuedBehind) setIsTransitioning(true);

      const runTransition = async () => {
        const fromWorkplaceId = queuedBehind
          ? (preferences.device.activeWorkplaceId ?? previousId)
          : previousId;
        if (
          shouldSkipWorkplaceTransition(
            targetId,
            preferences.device.activeWorkplaceId,
            options?.rejectOnError ?? false,
          )
        ) {
          return;
        }

        setTransitionError(null);
        const releaseSharing = fromWorkplaceId
          ? sharingRuntime.beginWorkplaceTransition(fromWorkplaceId, 'switch')
          : () => {};
        const transitionId = `workplace-transition-${++transitionSequence.current}`;
        const deadline = Date.now() + WORKPLACE_SCOPE_TIMEOUT_MS;
        let pointerMoved = false;
        let historyRewritten = false;
        const targetWasActiveAtStart = preferences.device.activeWorkplaceId === targetId;
        const previousRootState = rootNavigation.getRootState();
        let safeRootState = previousRootState;
        logger.info('[WorkplaceTransition] started', {
          transitionId,
          fromWorkplaceId,
          toWorkplaceId: targetId,
        });
        try {
          safeRootState = previousRootState
            ? rewriteStackForWorkplaceSwitch(previousRootState) ?? previousRootState
            : undefined;
          // Validate under the prior provider, clear record routes, then hold the overlay
          // until the next provider has committed the target workplace.
          const validatedWorkplace = await awaitWorkplaceScope(
            targetId,
            remainingSwitchMs(deadline),
          );
          options?.onTargetValidated?.(validatedWorkplace);
          if (fromWorkplaceId || options?.rejectOnError) {
            historyRewritten = true;
            clearWorkplaceHistory();
          }
          const wasTargetActive = preferences.device.activeWorkplaceId === targetId;
          try {
            await workplaceService.switchWorkplace(targetId);
          } finally {
            pointerMoved = !wasTargetActive && preferences.device.activeWorkplaceId === targetId;
          }
          logger.info('[WorkplaceTransition] pointer-persisted', {
            transitionId,
            fromWorkplaceId,
            toWorkplaceId: targetId,
          });
          const currentProviderAlreadyCommitted = committedWorkplaceRef.current.id === targetId;
          await awaitCommittedWorkplace(
            targetId,
            remainingSwitchMs(deadline),
            currentProviderAlreadyCommitted,
          );
          if (options?.onTransitionCommitted) {
            historyRewritten = true;
            options.onTransitionCommitted();
          } else if (!fromWorkplaceId && !options?.preserveRoute) {
            historyRewritten = true;
            router.replace('/');
          }
          logger.info('[WorkplaceTransition] completed', {
            transitionId,
            toWorkplaceId: targetId,
          });
        } catch (error) {
          logger.error('[WorkplaceTransition] failed', error, {
            transitionId,
            fromWorkplaceId,
            toWorkplaceId: targetId,
          });
          await rollbackFailedWorkplaceTransition({
            fromWorkplaceId,
            targetWorkplaceId: targetId,
            pointerMoved: shouldRollbackWorkplacePointer({
              pointerMoved,
              strict: options?.rejectOnError ?? false,
              targetWasActiveAtStart,
              fromWorkplaceId,
              targetWorkplaceId: targetId,
            }),
            historyRewritten,
            previousNavigationState: previousRootState,
            safeNavigationState: safeRootState,
            getActiveWorkplaceId: () => preferences.device.activeWorkplaceId,
            switchWorkplace: id => workplaceService.switchWorkplace(id),
            clearActiveWorkplace: () => preferences.device.setActiveWorkplaceId(undefined),
            restoreNavigation: state => restoreRootNavigationState(rootNavigation, state),
            onRollbackFailure: (step, rollbackError) => {
              logger.error(`[WorkplaceTransition] ${step} rollback failed`, rollbackError, {
                transitionId,
                fromWorkplaceId,
                toWorkplaceId: targetId,
              });
            },
          });
          setTransitionError(
            error instanceof Error ? error.message : 'Could not switch workplace.',
          );
          if (options?.rejectOnError) throw error;
        } finally {
          releaseSharing();
        }
      };

      const transition = (queuedBehind ?? Promise.resolve())
        .catch(() => undefined)
        .then(runTransition);
      transitionInFlightRef.current = transition;
      try {
        await transition;
      } finally {
        if (transitionInFlightRef.current === transition) {
          transitionInFlightRef.current = null;
          setIsTransitioning(false);
        }
      }
    },
    [awaitCommittedWorkplace, clearWorkplaceHistory, rootNavigation, router, state],
  );

  useEffect(() => {
    if (!pendingDeletionId) return;
    let cancelled = false;
    const deletion = async () => {
      try {
        const result = await workplaceService.deleteWorkplace(pendingDeletionId);
        evictWorkplaceReactiveCaches({ from: pendingDeletionId, to: pendingDeletionId });
        if (!cancelled) deletionWaiterRef.current?.resolve(result);
        return result;
      } catch (error) {
        if (!cancelled) {
          setTransitionError(
            error instanceof Error ? error.message : 'Could not delete workplace.',
          );
          deletionWaiterRef.current?.reject(error);
        }
        throw error;
      } finally {
        if (!cancelled) {
          deletionWaiterRef.current = null;
          deletionInFlightRef.current = null;
          setPendingDeletionId(null);
          setIsTransitioning(false);
        }
      }
    };

    const promise = deletion();
    void promise.catch(() => {});
    deletionInFlightRef.current = promise;
    return () => {
      cancelled = true;
      if (deletionWaiterRef.current) {
        deletionWaiterRef.current.reject(new Error('Workplace deletion was interrupted.'));
        deletionWaiterRef.current = null;
        deletionInFlightRef.current = null;
      }
    };
  }, [pendingDeletionId]);

  const deleteWorkplace = useCallback(
    async (targetId: WorkplaceId): Promise<DeleteWorkplaceResult> => {
      const releaseSharing = sharingRuntime.beginWorkplaceTransition(targetId, 'delete');
      try {
        if (transitionInFlightRef.current) await transitionInFlightRef.current;
        if (deletionInFlightRef.current) return deletionInFlightRef.current;
        const previousId = state.kind === 'open' ? state.workplaceId : undefined;
        setTransitionError(null);

        if (previousId === targetId) {
          const promise = new Promise<DeleteWorkplaceResult>((resolve, reject) => {
            deletionWaiterRef.current = { resolve, reject };
            setPendingDeletionId(targetId);
            setIsTransitioning(true);
          });
          deletionInFlightRef.current = promise;
          return await promise;
        }

        try {
          const result = await workplaceService.deleteWorkplace(targetId);
          evictWorkplaceReactiveCaches({ from: targetId, to: targetId });
          return result;
        } catch (error) {
          setTransitionError(
            error instanceof Error ? error.message : 'Could not delete workplace.',
          );
          throw error;
        }
      } finally {
        releaseSharing();
      }
    },
    [state],
  );

  const switchWorkplace = useCallback(
    async (targetId: WorkplaceId) => {
      if (state.kind !== 'open' || state.workplaceId === targetId) return;
      await transitionToWorkplace(targetId, state.workplaceId);
    },
    [state, transitionToWorkplace],
  );

  const transitionToWorkplaceStrict = useCallback<WorkplaceTransition>(
    (targetId, previousId, options) =>
      transitionToWorkplace(targetId, previousId, { ...(options ?? {}), rejectOnError: true }),
    [transitionToWorkplace],
  );

  return {
    deleteWorkplace,
    isTransitioning,
    onCommittedWorkplace,
    pendingDeletionId,
    switchWorkplace,
    transitionError,
    transitionToWorkplace,
    transitionToWorkplaceStrict,
  };
}
