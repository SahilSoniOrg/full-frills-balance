import { ModeHandle, ModeSubmitState } from '@/src/features/journal/entry/modes/ModeHandle';
import { AccountId } from '@/src/types/domain';
import {
  createContext,
  Dispatch,
  MutableRefObject,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type ModeActions = Pick<ModeHandle, 'submit' | 'applyAccountToLine' | 'resolveSelectedAccountId'>;

type ModeRegistry = {
  actionsRef: MutableRefObject<ModeActions | null>;
  setSubmitState: Dispatch<SetStateAction<ModeSubmitState | null>>;
};

/**
 * Registry identity never changes, so consumers that only need to call into the
 * active panel never re-render when a panel registers.
 */
const ModeRegistryContext = createContext<ModeRegistry | null>(null);
const ModeSubmitStateContext = createContext<ModeSubmitState | null>(null);

export function ModeHandleProvider({ children }: { children: ReactNode }) {
  const [submitState, setSubmitState] = useState<ModeSubmitState | null>(null);
  const actionsRef = useRef<ModeActions | null>(null);
  const registry = useMemo<ModeRegistry>(() => ({ actionsRef, setSubmitState }), []);

  return (
    <ModeRegistryContext.Provider value={registry}>
      <ModeSubmitStateContext.Provider value={submitState}>
        {children}
      </ModeSubmitStateContext.Provider>
    </ModeRegistryContext.Provider>
  );
}

function useModeRegistry(): ModeRegistry {
  const registry = useContext(ModeRegistryContext);
  if (!registry) {
    throw new Error('ModeHandle hooks require ModeHandleProvider');
  }
  return registry;
}

/**
 * Active mode panel: publish submit chrome and imperative callbacks.
 *
 * Callbacks live in a ref, so a panel re-creating them on every render can never
 * schedule a render and feed itself. Only the submit primitives reach state, and
 * they bail out when unchanged.
 */
export function useRegisterModeHandle(handle: ModeHandle): void {
  const { actionsRef, setSubmitState } = useModeRegistry();
  const { submitLabel, isSubmitDisabled, isSubmitting = false } = handle;
  const { submit, applyAccountToLine, resolveSelectedAccountId } = handle;

  useLayoutEffect(() => {
    actionsRef.current = { submit, applyAccountToLine, resolveSelectedAccountId };
  }, [actionsRef, submit, applyAccountToLine, resolveSelectedAccountId]);

  useEffect(() => {
    setSubmitState(current =>
      current &&
      current.submitLabel === submitLabel &&
      current.isSubmitDisabled === isSubmitDisabled &&
      current.isSubmitting === isSubmitting
        ? current
        : { submitLabel, isSubmitDisabled, isSubmitting },
    );
  }, [setSubmitState, submitLabel, isSubmitDisabled, isSubmitting]);

  useEffect(
    () => () => {
      actionsRef.current = null;
      setSubmitState(null);
    },
    [actionsRef, setSubmitState],
  );
}

/** Shell: hand a picked account to the active panel without subscribing to it. */
export function useModeAccountActions() {
  const { actionsRef } = useModeRegistry();

  return useMemo(
    () => ({
      applyAccountToLine: (lineId: string, accountId: AccountId) =>
        actionsRef.current?.applyAccountToLine?.(lineId, accountId),
      resolveSelectedAccountId: (lineId: string) =>
        actionsRef.current?.resolveSelectedAccountId?.(lineId),
    }),
    [actionsRef],
  );
}

/** Footer: submit chrome for the active mode, with a stable submit callback. */
export function useModeSubmitBar() {
  const { actionsRef } = useModeRegistry();
  const submitState = useContext(ModeSubmitStateContext);
  const submit = useCallback(() => actionsRef.current?.submit(), [actionsRef]);

  return {
    submitLabel: submitState?.submitLabel ?? '',
    isSubmitDisabled: submitState?.isSubmitDisabled ?? true,
    isSubmitting: submitState?.isSubmitting ?? false,
    submit,
  };
}
