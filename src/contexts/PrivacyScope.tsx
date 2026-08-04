import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { useScreenPrivacyMode } from '@/src/hooks/useScreenPrivacyMode';
import React, { createContext, useContext, useMemo, type ComponentType } from 'react';

export type PrivacyScopeValue = {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
};

const PrivacyScopeContext = createContext<PrivacyScopeValue | null>(null);

/**
 * Screen-local privacy scope.
 *
 * Composes global privacy prefs with a screen override (`useScreenPrivacyMode`).
 * Once the user toggles on this screen, the override sticks until they toggle
 * again ("charting lock") — global pref changes do not clear it.
 */
export function PrivacyScopeProvider({ children }: { children: React.ReactNode }) {
  const { isPrivacyMode: globalPrivacyMode } = usePrivacyPrefs();
  const { isPrivacyMode, togglePrivacyMode } = useScreenPrivacyMode(globalPrivacyMode);

  const value = useMemo(
    () => ({ isPrivacyMode, togglePrivacyMode }),
    [isPrivacyMode, togglePrivacyMode],
  );

  return <PrivacyScopeContext.Provider value={value}>{children}</PrivacyScopeContext.Provider>;
}

/** Wrap a screen so its hooks run under PrivacyScopeProvider (no Content split). */
export function withPrivacyScope<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function Wrapped(props: P) {
    return (
      <PrivacyScopeProvider>
        <Component {...props} />
      </PrivacyScopeProvider>
    );
  }
  const name = Component.displayName ?? Component.name ?? 'Component';
  Wrapped.displayName = `withPrivacyScope(${name})`;
  return Wrapped;
}

/**
 * Effective privacy for amount masking.
 * Uses the nearest PrivacyScopeProvider when present; otherwise global prefs.
 */
export function useEffectivePrivacyMode(): boolean {
  const scope = useContext(PrivacyScopeContext);
  const { isPrivacyMode: globalPrivacyMode } = usePrivacyPrefs();
  return scope?.isPrivacyMode ?? globalPrivacyMode;
}

/** Optional access to the nearest privacy scope (null outside a provider). */
export function usePrivacyScopeOptional(): PrivacyScopeValue | null {
  return useContext(PrivacyScopeContext);
}

/** Screen-local privacy toggle; must be used under PrivacyScopeProvider. */
export function usePrivacyScope(): PrivacyScopeValue {
  const scope = useContext(PrivacyScopeContext);
  if (!scope) {
    throw new Error('usePrivacyScope must be used within a PrivacyScopeProvider');
  }
  return scope;
}
