import React, { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { sharingRuntime } from '@/src/services/SharingService';
import type { SharingRuntime } from '@/src/services/sharing/SharingRuntime';

const SharingContext = createContext<SharingRuntime | null>(null);

/** Exposes the same runtime used by imperative recovery callers; never keyed by Workplace. */
export function SharingProvider({
  children,
  runtime = sharingRuntime,
}: {
  children: React.ReactNode;
  runtime?: SharingRuntime;
}) {
  return <SharingContext.Provider value={runtime}>{children}</SharingContext.Provider>;
}

export function useSharing(): SharingRuntime {
  const runtime = useContext(SharingContext);
  if (!runtime) throw new Error('useSharing must be used within SharingProvider');
  return runtime;
}

export function useSharingBusy() {
  const runtime = useSharing();
  const getSnapshot = useCallback(() => runtime.getSnapshot().operationId !== null, [runtime]);
  return useSyncExternalStore(runtime.subscribe, getSnapshot, getSnapshot);
}

/** Only the operation owner subscribes to its changing progress and presentation phase. */
export function useSharingStatus(operationId: number | null) {
  const runtime = useSharing();
  const getSnapshot = useCallback(() => {
    const snapshot = runtime.getSnapshot();
    return operationId !== null && snapshot.operationId === operationId ? snapshot : null;
  }, [runtime, operationId]);
  return useSyncExternalStore(runtime.subscribe, getSnapshot, getSnapshot);
}
