import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import { analytics } from '@/src/services/analytics';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PersonalizationViewModel {
  draftName: string;
  setDraftName: (value: string) => void;
  commitName: () => void;
  onOpenPrivacyNotice: () => void;
}

export function usePersonalizationViewModel(): PersonalizationViewModel {
  const { userName, setUserName: persistUserName } = useProfilePrefs();
  const [draftName, setDraftNameState] = useState(userName);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const previousUserNameRef = useRef(userName);

  useEffect(() => {
    const hasUserNameChanged = userName !== previousUserNameRef.current;
    previousUserNameRef.current = userName;
    if (hasUserNameChanged && !isDraftDirty && userName !== draftName) {
      setDraftNameState(userName);
    }
  }, [draftName, isDraftDirty, userName]);

  const setDraftName = useCallback(
    (value: string) => {
      setDraftNameState(value);
      setIsDraftDirty(value.trim() !== userName);
    },
    [userName],
  );

  const commitName = useCallback(() => {
    const normalizedName = draftName.trim();
    if (!normalizedName) {
      setDraftNameState(userName);
      setIsDraftDirty(false);
      return;
    }

    if (normalizedName !== userName) {
      persistUserName(normalizedName);
      analytics.trackFeatureUsage('settings', 'change_name', {
        name_length: normalizedName.length,
      });
    }

    setDraftNameState(normalizedName);
    setIsDraftDirty(false);
  }, [draftName, persistUserName, userName]);

  return {
    draftName,
    setDraftName,
    commitName,
    onOpenPrivacyNotice: AppNavigation.toPrivacyNotice,
  };
}
