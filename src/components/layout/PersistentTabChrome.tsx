import type { TabScreenChrome } from './screenChrome';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

type Register = (routeName: string, chrome: TabScreenChrome) => () => void;
const RegistrationContext = createContext<Register | null>(null);
const ChromeContext = createContext<Readonly<Record<string, TabScreenChrome>>>({});
const LeafContext = createContext<string | null>(null);

/** Keeps screen-owned actions intact while rendering their header outside the pager. */
export function PersistentTabChromeProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, TabScreenChrome>>({});
  const register = useCallback<Register>((routeName, chrome) => {
    setEntries(previous =>
      previous[routeName] === chrome ? previous : { ...previous, [routeName]: chrome },
    );
    return () =>
      setEntries(previous => {
        if (previous[routeName] !== chrome) return previous;
        const next = { ...previous };
        delete next[routeName];
        return next;
      });
  }, []);
  return (
    <RegistrationContext.Provider value={register}>
      <ChromeContext.Provider value={entries}>{children}</ChromeContext.Provider>
    </RegistrationContext.Provider>
  );
}

export function PersistentTabLeaf({
  routeName,
  children,
}: {
  routeName: string;
  children: ReactNode;
}) {
  return <LeafContext.Provider value={routeName}>{children}</LeafContext.Provider>;
}

export function usePersistentTabChrome(routeName: string) {
  return useContext(ChromeContext)[routeName];
}

export function usePublishTabChrome(chrome: TabScreenChrome | null) {
  const register = useContext(RegistrationContext);
  const routeName = useContext(LeafContext);
  // Keep registration independent of the header's entries context: publishing
  // an action must not subscribe every retained screen to all other actions.
  useLayoutEffect(() => {
    if (register && routeName && chrome) return register(routeName, chrome);
  }, [register, routeName, chrome]);
  return register && routeName && chrome ? routeName : null;
}
