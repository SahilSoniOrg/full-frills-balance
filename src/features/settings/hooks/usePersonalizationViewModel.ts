import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import { analytics } from '@/src/services/analytics';
import { useCallback } from 'react';

export interface PersonalizationViewModel {
  userName: string;
  setUserName: (value: string) => void;
}

export function usePersonalizationViewModel(): PersonalizationViewModel {
  const { userName, setUserName: persistUserName } = useProfilePrefs();

  const setUserName = useCallback(
    (newName: string) => {
      if (newName.trim() && newName !== userName) {
        persistUserName(newName.trim());
        analytics.trackFeatureUsage('settings', 'change_name', {
          name_length: newName.trim().length,
        });
      }
    },
    [persistUserName, userName],
  );

  return {
    userName,
    setUserName,
  };
}
