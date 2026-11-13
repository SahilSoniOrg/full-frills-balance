import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { gmailBinding } from '@/src/services/email/gmailConnection';
import { getGmailSyncState, gmailSyncState } from '@/src/services/email/gmailSyncService';
import { useCaptureMutationRunner } from '@/src/features/settings/hooks/useCaptureMutationRunner';
import { useGmailCaptureActions } from '@/src/features/settings/hooks/useGmailCaptureActions';
import { usePostHogFeatureFlag } from '@/src/hooks/usePostHogFeatureFlag';
import { POSTHOG_FEATURE_FLAGS } from '@/src/services/analytics/featureFlags';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { WorkplaceId } from '@/src/types/ids';

type GmailBinding = ReturnType<typeof gmailBinding>;
type GmailSnapshot = { workplaceId: WorkplaceId; binding: GmailBinding };

export function useGmailCaptureViewModel() {
  const { workplaceId } = useWorkplace();
  const featureEnabled = usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.gmailCaptureSettings);
  const loadGeneration = useRef(0);
  const mutationEpoch = useRef(0);
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
    const request = ++loadGeneration.current;
    setLoading(true);
    try {
      const binding = gmailBinding(workplaceId);
      if (request === loadGeneration.current) setSnapshot({ workplaceId, binding });
    } finally {
      if (request === loadGeneration.current) setLoading(false);
    }
  }, [workplaceId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        ++loadGeneration.current;
      };
    }, [refresh]),
  );

  useEffect(
    () => () => {
      ++mutationEpoch.current;
    },
    [workplaceId],
  );

  const current = snapshot?.workplaceId === workplaceId ? snapshot.binding : undefined;
  const mutations = useCaptureMutationRunner(workplaceId, mutationEpoch, refresh);
  const actions = useGmailCaptureActions({
    mutations,
    loading: loading || !snapshot || snapshot.workplaceId !== workplaceId,
    connected: !!current,
    featureEnabled,
  });

  return {
    featureEnabled,
    connected: !!current,
    backgroundEnabled: current?.backgroundEnabled === true,
    automaticCaptureEnabled: !!current?.automaticCaptureEnabledAt,
    syncState,
    loading: loading || !snapshot || snapshot.workplaceId !== workplaceId,
    busy: mutations.busy,
    ...actions,
  };
}
