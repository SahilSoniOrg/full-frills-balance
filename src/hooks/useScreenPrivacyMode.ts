import { useCallback, useEffect, useState } from 'react';

/**
 * Screen-local privacy toggle that mirrors global settings but can be flipped
 * in-place (e.g. dashboard / accounts list eye icon) without persisting.
 */
export function useScreenPrivacyMode(globalPrivacyMode: boolean) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(globalPrivacyMode);

  useEffect(() => {
    setTimeout(() => setIsPrivacyMode(globalPrivacyMode), 0);
  }, [globalPrivacyMode]);

  const togglePrivacyMode = useCallback(() => setIsPrivacyMode(prev => !prev), []);

  return { isPrivacyMode, togglePrivacyMode };
}
