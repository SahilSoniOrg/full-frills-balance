import { AppConfig } from '@/src/constants/app-config';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type AiPrefsState = {
  isNativeAiEnabled: boolean;
  preferredAiModelId: string;
  aiInferenceMode: 'single' | 'multi';
  setIsNativeAiEnabled: (enabled: boolean) => void;
  setPreferredAiModelId: (modelId: string) => void;
  setAiInferenceMode: (mode: 'single' | 'multi') => void;
};

/**
 * Scoped on-device AI prefs — expandable without growing UIContext.
 */
export function useAiPrefs(): AiPrefsState {
  const isNativeAiEnabled = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.ai.observeNativeAiEnabled().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.ai.isNativeAiEnabled,
    () => preferences.ai.isNativeAiEnabled,
  );

  const preferredAiModelId = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.ai.observePreferredAiModelId().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.ai.preferredAiModelId || AppConfig.defaults.defaultAiModelId,
    () => preferences.ai.preferredAiModelId || AppConfig.defaults.defaultAiModelId,
  );

  const aiInferenceMode = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.ai.observeAiInferenceMode().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.ai.aiInferenceMode,
    () => preferences.ai.aiInferenceMode,
  );

  const setIsNativeAiEnabled = useCallback((enabled: boolean) => {
    preferences.ai.setIsNativeAiEnabled(enabled);
  }, []);

  const setPreferredAiModelId = useCallback((modelId: string) => {
    preferences.ai.setPreferredAiModelId(modelId);
  }, []);

  const setAiInferenceMode = useCallback((mode: 'single' | 'multi') => {
    preferences.ai.setAiInferenceMode(mode);
  }, []);

  return {
    isNativeAiEnabled,
    preferredAiModelId,
    aiInferenceMode,
    setIsNativeAiEnabled,
    setPreferredAiModelId,
    setAiInferenceMode,
  };
}
