import { confirm } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseConfirmUnsavedChangesOptions {
  fingerprint: string;
  baselineReady: boolean;
  disabled?: boolean;
  leaveAfterSave?: (() => void) | null;
  title?: string;
}

export function useConfirmUnsavedChanges({
  fingerprint,
  baselineReady,
  disabled = false,
  leaveAfterSave = null,
  title = 'Discard changes?',
}: UseConfirmUnsavedChangesOptions) {
  const navigation = useNavigation();
  const latestFingerprintRef = useRef(fingerprint);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    latestFingerprintRef.current = fingerprint;
  }, [fingerprint]);

  useEffect(() => {
    if (!baselineReady || baseline !== null) return;
    const timer = setTimeout(() => setBaseline(latestFingerprintRef.current), 0);
    return () => clearTimeout(timer);
  }, [baseline, baselineReady]);

  const isDirty = baseline !== null && fingerprint !== baseline;

  const leaveWithoutPrompt = useCallback((action: () => void) => {
    pendingLeaveActionRef.current = action;
    setIsLeaving(true);
  }, []);

  const requestLeave = useCallback(
    (action: () => void) => {
      if (!isDirty || disabled || isLeaving || leaveAfterSave) {
        action();
        return;
      }
      confirm.show({
        title,
        message: 'Your changes have not been saved.',
        confirmText: 'Discard changes',
        cancelText: 'Keep editing',
        destructive: true,
        onConfirm: () => leaveWithoutPrompt(action),
      });
    },
    [disabled, isDirty, isLeaving, leaveAfterSave, leaveWithoutPrompt, title],
  );

  const onBack = useCallback(() => requestLeave(AppNavigation.back), [requestLeave]);

  usePreventRemove(isDirty && !disabled && !isLeaving && !leaveAfterSave, ({ data }) => {
    requestLeave(() => navigation.dispatch(data.action));
  });

  // Register the disabled removal guard before dispatching successful saves or
  // confirmed discards. Router actions may be processed on a later render.
  useEffect(() => {
    const action = leaveAfterSave ?? (isLeaving ? pendingLeaveActionRef.current : null);
    pendingLeaveActionRef.current = null;
    action?.();
  }, [isLeaving, leaveAfterSave]);

  return { isDirty, hasBaseline: baseline !== null, onBack };
}
