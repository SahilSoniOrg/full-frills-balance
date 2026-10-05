import { usePreference } from '@/src/hooks/usePreference';

export function useReportsPreferences() {
  const { value: reportsV2Enabled, setValue: setReportsV2Enabled } =
    usePreference('reportsV2Enabled');

  return { reportsV2Enabled, setReportsV2Enabled };
}
