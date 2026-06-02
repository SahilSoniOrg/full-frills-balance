import { usePostHog } from 'posthog-react-native';
import { AppConfig } from '../constants';

export function useFeatureFlags() {
  const posthog = usePostHog();

  const isFeatureEnabled = (flagKey: string, defaultValue: boolean = false): boolean => {
    if (!AppConfig.features.enablePostHog) {
      return defaultValue;
    }
    // `isFeatureEnabled` returns boolean | undefined
    return posthog?.isFeatureEnabled(flagKey) ?? defaultValue;
  };

  return {
    isLocalAiEnabled: isFeatureEnabled('enable-local-ai', false),
    isAccountEnabled: isFeatureEnabled('enable-account', false),
  };
}
