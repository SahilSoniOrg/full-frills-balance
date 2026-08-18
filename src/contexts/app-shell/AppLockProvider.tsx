import { requireShellContext } from '@/src/contexts/app-shell/requireShellContext';
import { preferences } from '@/src/utils/preferences';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

export interface AppLockValue {
  isUnlocked: boolean;
  hasUnlockedThisSession: boolean;
  isAppActive: boolean;
  isLockAuthenticating: boolean;
  isAppCurrentlyLocked: boolean;
  authenticateSession: (unlocked: boolean) => void;
  setIsAppActive: (isActive: boolean) => void;
  setIsLockAuthenticating: (isAuthenticating: boolean) => void;
}

export const AppLockContext = createContext<AppLockValue | undefined>(undefined);

export function useAppLock(): AppLockValue {
  return requireShellContext(useContext(AppLockContext), 'useAppLock');
}

const INITIAL_LOCK = {
  isUnlocked: false,
  hasUnlockedThisSession: false,
  isAppActive: true,
  isLockAuthenticating: false,
};

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [lock, setLock] = useState(INITIAL_LOCK);

  const isAppLockEnabled = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.privacy.observeAppLockEnabled().subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.privacy.isAppLockEnabled || false,
    () => preferences.privacy.isAppLockEnabled || false,
  );

  const authenticateSession = useCallback((isUnlocked: boolean) => {
    setLock(prev => ({
      ...prev,
      isUnlocked,
      hasUnlockedThisSession: isUnlocked || prev.hasUnlockedThisSession,
    }));
  }, []);

  const setIsAppActive = useCallback((isAppActive: boolean) => {
    setLock(prev => ({ ...prev, isAppActive }));
  }, []);

  const setIsLockAuthenticating = useCallback((isLockAuthenticating: boolean) => {
    setLock(prev => ({ ...prev, isLockAuthenticating }));
  }, []);

  const isAppCurrentlyLocked = useMemo(() => {
    const isActuallyBackgrounded = !lock.isAppActive && !lock.isLockAuthenticating;
    return isAppLockEnabled && (!lock.isUnlocked || isActuallyBackgrounded);
  }, [isAppLockEnabled, lock.isUnlocked, lock.isAppActive, lock.isLockAuthenticating]);

  const value = useMemo<AppLockValue>(
    () => ({
      ...lock,
      isAppCurrentlyLocked,
      authenticateSession,
      setIsAppActive,
      setIsLockAuthenticating,
    }),
    [lock, isAppCurrentlyLocked, authenticateSession, setIsAppActive, setIsLockAuthenticating],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}
