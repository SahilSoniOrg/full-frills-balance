import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { AppText } from '@/src/components/core/AppText';
import { AppConfig } from '@/src/constants';
import {
  AlertPayload,
  clearAlertListener,
  clearConfirmListener,
  ConfirmPayload,
  setAlertListener,
  setConfirmListener,
} from '@/src/utils/alerts';
import { useEffect, useRef, useState } from 'react';

type AlertState =
  | {
      type: 'alert';
      payload: AlertPayload;
    }
  | {
      type: 'confirm';
      payload: ConfirmPayload;
    }
  | null;

export function AlertContainer() {
  const [activeAlert, setActiveAlert] = useState<AlertState>(null);
  const activeAlertIdRef = useRef<string | null>(null);

  useEffect(() => {
    setAlertListener(payload => {
      activeAlertIdRef.current = payload.id;
      setActiveAlert({ type: 'alert', payload });
    });

    setConfirmListener(payload => {
      activeAlertIdRef.current = payload.id;
      setActiveAlert({ type: 'confirm', payload });
    });

    return () => {
      clearAlertListener();
      clearConfirmListener();
    };
  }, []);

  if (!activeAlert) return null;

  if (activeAlert.type === 'alert') {
    const { payload } = activeAlert;
    return (
      <ConfirmDialog
        visible={true}
        title={payload.title || AppConfig.strings.common.alert}
        onClose={() => setActiveAlert(null)}
        primaryAction={{
          label: AppConfig.strings.common.ok,
          onPress: () => setActiveAlert(null),
          variant: 'primary',
        }}
        message={<AppText>{payload.message}</AppText>}
        useNativeModal={false}
      />
    );
  }

  if (activeAlert.type === 'confirm') {
    const { payload } = activeAlert;
    return (
      <ConfirmDialog
        visible={true}
        title={payload.title}
        onClose={() => {
          payload.onClose();
          setActiveAlert(null);
        }}
        secondaryAction={{
          label: payload.cancelText || AppConfig.strings.common.cancel,
          onPress: () => {
            const currentId = payload.id;
            payload.onCancel();
            if (activeAlertIdRef.current === currentId) {
              setActiveAlert(null);
            }
          },
          variant: payload.destructiveCancel ? 'destructive-outline' : 'outline',
        }}
        primaryAction={{
          label: payload.confirmText || AppConfig.strings.common.confirm,
          onPress: () => {
            const currentId = payload.id;
            payload.onConfirm();
            if (activeAlertIdRef.current === currentId) {
              setActiveAlert(null);
            }
          },
          variant: payload.destructive ? 'destructive' : 'primary',
        }}
        message={<AppText>{payload.message}</AppText>}
        requiredConfirmationValue={payload.requiredConfirmationValue}
        useNativeModal={false}
      />
    );
  }

  return null;
}
