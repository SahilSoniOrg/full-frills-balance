import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  getCaptureWorkspaceSnapshot,
  refreshIfStale,
  refresh,
  subscribeCaptureWorkspace,
  type CaptureLoadOptions,
  type CaptureWorkspaceSnapshot,
} from '@/src/features/settings/hooks/captureWorkspaceStore';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/** One workplace-keyed capture snapshot shared across capture screens. */
export function useCaptureWorkspace(options: CaptureLoadOptions = {}): CaptureWorkspaceSnapshot & {
  refresh: () => Promise<void>;
} {
  const { workplaceId } = useWorkplace();
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  const snapshot = useSyncExternalStore(
    useCallback(listener => subscribeCaptureWorkspace(workplaceId, listener), [workplaceId]),
    () => getCaptureWorkspaceSnapshot(workplaceId),
    () => getCaptureWorkspaceSnapshot(workplaceId),
  );

  const doRefresh = useCallback(() => refresh(workplaceId, optionsRef.current), [workplaceId]);

  useFocusEffect(
    useCallback(() => {
      void refreshIfStale(workplaceId, optionsRef.current);
    }, [workplaceId]),
  );

  return { ...snapshot, refresh: doRefresh };
}
