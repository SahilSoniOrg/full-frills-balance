import { useCallback, useState } from 'react';

/**
 * Screen-local privacy toggle that mirrors global settings but can be flipped
 * in-place (e.g. dashboard / accounts list eye icon) without persisting.
 *
 * When override is null, the effective value tracks globalPrivacyMode.
 * Toggling sets an override relative to the current effective value.
 * Global changes do not clear an existing override.
 */
export function useScreenPrivacyMode(globalPrivacyMode: boolean) {
  const [override, setOverride] = useState<boolean | null>(null);

  const isPrivacyMode = override ?? globalPrivacyMode;

  const togglePrivacyMode = useCallback(() => {
    setOverride(prev => !(prev ?? globalPrivacyMode));
  }, [globalPrivacyMode]);

  return { isPrivacyMode, togglePrivacyMode };
}
