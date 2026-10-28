import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentType,
} from 'react';

export type PrivacyScopeValue = {
  isPrivacyMode: boolean;
  isPrivacyOverridden: boolean;
  togglePrivacyMode: () => void;
};

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

  const isPrivacyOverridden = override !== null && isPrivacyMode !== globalPrivacyMode;

  return { isPrivacyMode, isPrivacyOverridden, togglePrivacyMode };
}

const PrivacyScopeContext = createContext<PrivacyScopeValue | null>(null);
type PrivacyOverrideStore = {
  overrides: Record<string, boolean | null>;
  setOverride: (key: string, value: boolean | null) => void;
};
const PrivacyOverrideStoreContext = createContext<PrivacyOverrideStore | null>(null);

/** Session-local overrides shared by primary pages in the same group. */
export function PrimaryPrivacyScopeStoreProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({});
  const setOverride = useCallback((key: string, value: boolean | null) => {
    setOverrides(previous => ({ ...previous, [key]: value }));
  }, []);
  const value = useMemo(() => ({ overrides, setOverride }), [overrides, setOverride]);
  return (
    <PrivacyOverrideStoreContext.Provider value={value}>
      {children}
    </PrivacyOverrideStoreContext.Provider>
  );
}

/**
 * Screen-local or group-shared privacy scope.
 *
 * Composes global privacy prefs with an override. With `scopeKey` under
 * `PrimaryPrivacyScopeStoreProvider`, pages in the same group share the
 * override. Otherwise the override is local to this provider instance.
 * Once toggled, the override sticks until the user toggles again
 * ("charting lock") — global pref changes do not clear it.
 */
export function PrivacyScopeProvider({
  children,
  scopeKey,
}: {
  children: React.ReactNode;
  scopeKey?: string;
}) {
  const { isPrivacyMode: globalPrivacyMode } = usePrivacyPrefs();
  const store = useContext(PrivacyOverrideStoreContext);
  const [localOverride, setLocalOverride] = useState<boolean | null>(null);
  const isSharedScope = !!scopeKey && store !== null;
  const override = isSharedScope ? (store.overrides[scopeKey] ?? null) : localOverride;
  const isPrivacyMode = override ?? globalPrivacyMode;
  const togglePrivacyMode = useCallback(() => {
    const next = !(override ?? globalPrivacyMode);
    if (isSharedScope && scopeKey) store?.setOverride(scopeKey, next);
    else setLocalOverride(next);
  }, [globalPrivacyMode, isSharedScope, override, scopeKey, store]);
  const isPrivacyOverridden = override !== null && isPrivacyMode !== globalPrivacyMode;

  const value = useMemo(
    () => ({ isPrivacyMode, isPrivacyOverridden, togglePrivacyMode }),
    [isPrivacyMode, isPrivacyOverridden, togglePrivacyMode],
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

/** Screen-local privacy toggle; must be used under PrivacyScopeProvider. */
export function usePrivacyScope(): PrivacyScopeValue {
  const scope = useContext(PrivacyScopeContext);
  if (!scope) {
    throw new Error('usePrivacyScope must be used within a PrivacyScopeProvider');
  }
  return scope;
}
