import { useSmsPrefs } from '@/src/hooks/useSmsPrefs';
import { analytics } from '@/src/services/analytics';
import { useCallback } from 'react';

export interface SmsImportSetting {
  isSmsImportEnabled: boolean;
  setIsSmsImportEnabled: (enabled: boolean) => void;
}

/** Owns the device-local SMS import preference and its settings analytics. */
export function useSmsImportSetting(): SmsImportSetting {
  const { isSmsImportEnabled, setIsSmsImportEnabled } = useSmsPrefs();

  const handleSetIsSmsImportEnabled = useCallback(
    (enabled: boolean) => {
      setIsSmsImportEnabled(enabled);
      analytics.logSmsImportSettingsChanged(enabled);
      analytics.trackFeatureUsage('settings', 'toggle_sms_import', { enabled });
    },
    [setIsSmsImportEnabled],
  );

  return {
    isSmsImportEnabled,
    setIsSmsImportEnabled: handleSetIsSmsImportEnabled,
  };
}
