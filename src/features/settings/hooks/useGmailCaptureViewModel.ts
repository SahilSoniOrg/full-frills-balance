import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { gmailBinding } from '@/src/services/email/gmailConnection';
import { getGmailSyncState, gmailSyncState } from '@/src/services/email/gmailSyncService';
import { useCaptureMutationRunner } from '@/src/features/settings/hooks/useCaptureMutationRunner';
import { useGmailCaptureActions } from '@/src/features/settings/hooks/useGmailCaptureActions';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type { WorkplaceId } from '@/src/types/ids';

type GmailBinding = ReturnType<typeof gmailBinding>;
type GmailSnapshot = { workplaceId: WorkplaceId; binding: GmailBinding };

export function useGmailCaptureViewModel() {
  const { workplaceId } = useWorkplace();
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<GmailSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const subscribeSyncState = useCallback(
    (onChange: () => void) => {
      const subscription = gmailSyncState(workplaceId).subscribe(onChange);
      return () => subscription.unsubscribe();
    },
    [workplaceId],
  );
  const getSyncState = useCallback(() => getGmailSyncState(workplaceId), [workplaceId]);
  const syncState = useSyncExternalStore(subscribeSyncState, getSyncState, getSyncState);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const binding = gmailBinding(workplaceId);
      if (request === generation.current) setSnapshot({ workplaceId, binding });
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [workplaceId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        ++generation.current;
      };
    }, [refresh]),
  );

  const current = snapshot?.workplaceId === workplaceId ? snapshot.binding : undefined;
  const mutations = useCaptureMutationRunner(workplaceId, generation, refresh);
  const actions = useGmailCaptureActions({
    mutations,
    loading: loading || !snapshot || snapshot.workplaceId !== workplaceId,
    connected: !!current,
  });

  return {
    connected: !!current,
    backgroundEnabled: current?.backgroundEnabled === true,
    automaticCaptureEnabled: !!current?.automaticCaptureEnabledAt,
    syncState,
    loading: loading || !snapshot || snapshot.workplaceId !== workplaceId,
    busy: mutations.busy,
    ...actions,
  };
}
