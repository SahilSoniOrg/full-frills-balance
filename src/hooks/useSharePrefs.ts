import { ShareFormat } from '@/src/types/sharing';
import { usePreference } from '@/src/hooks/usePreference';
import { useCallback } from 'react';

export type SharePrefsState = {
  defaultShareFormat: ShareFormat;
  setDefaultShareFormat: (format: ShareFormat) => void;
};

/**
 * Scoped share-format prefs — expandable without growing UIContext.
 */
export function useSharePrefs(): SharePrefsState {
  const { value: storedShareFormat, setValue: setStoredShareFormat } =
    usePreference('defaultShareFormat');
  const defaultShareFormat = storedShareFormat || ShareFormat.TEXT;

  const setDefaultShareFormat = useCallback(
    (format: ShareFormat) => {
      setStoredShareFormat(format);
    },
    [setStoredShareFormat],
  );

  return {
    defaultShareFormat,
    setDefaultShareFormat,
  };
}
