import { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type ModeHandleRegistry = {
  handle: ModeHandle | null;
  setHandle: (handle: ModeHandle | null) => void;
};

const ModeHandleContext = createContext<ModeHandleRegistry | null>(null);

export function ModeHandleProvider({ children }: { children: ReactNode }) {
  const [handle, setHandleState] = useState<ModeHandle | null>(null);
  const setHandle = useCallback((next: ModeHandle | null) => {
    setHandleState(next);
  }, []);

  const value = useMemo(() => ({ handle, setHandle }), [handle, setHandle]);

  return <ModeHandleContext.Provider value={value}>{children}</ModeHandleContext.Provider>;
}

function useModeHandleRegistry(): ModeHandleRegistry {
  const ctx = useContext(ModeHandleContext);
  if (!ctx) {
    throw new Error('ModeHandle hooks require ModeHandleProvider');
  }
  return ctx;
}

/**
 * Active mode panel: publish submit contract for the shell footer.
 * Re-registers when label / disabled / submitting / footer amount fields change.
 * Cleared on unmount.
 */
export function useRegisterModeHandle(handle: ModeHandle): void {
  const { setHandle } = useModeHandleRegistry();

  const {
    submitLabel,
    isSubmitDisabled,
    isSubmitting,
    submit,
    applyAccount,
    resolveSelectedAccountId,
    applyVoice,
    footerAmount,
  } = handle;

  useEffect(() => {
    setHandle({
      submitLabel,
      isSubmitDisabled,
      isSubmitting,
      submit,
      applyAccount,
      resolveSelectedAccountId,
      applyVoice,
      footerAmount,
    });
    return () => setHandle(null);
  }, [
    submitLabel,
    isSubmitDisabled,
    isSubmitting,
    submit,
    applyAccount,
    resolveSelectedAccountId,
    applyVoice,
    footerAmount,
    setHandle,
  ]);
}

/** Shell: read the currently registered mode handle (null while switching / before mount). */
export function useActiveModeHandle(): ModeHandle | null {
  return useModeHandleRegistry().handle;
}
