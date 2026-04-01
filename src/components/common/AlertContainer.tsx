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
import React, { useEffect, useState } from 'react';

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

  useEffect(() => {
    setAlertListener(payload => {
      setActiveAlert({ type: 'alert', payload });
    });

    setConfirmListener(payload => {
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
          payload.onCancel();
          setActiveAlert(null);
        }}
        secondaryAction={{
          label: payload.cancelText || AppConfig.strings.common.cancel,
          onPress: () => {
            payload.onCancel();
            setActiveAlert(null);
          },
          variant: 'outline',
        }}
        primaryAction={{
          label: payload.confirmText || AppConfig.strings.common.confirm,
          onPress: () => {
            payload.onConfirm();
            setActiveAlert(null);
          },
          variant: payload.destructive ? 'destructive' : 'primary',
        }}
        message={<AppText>{payload.message}</AppText>}
        useNativeModal={false}
      />
    );
  }

  return null;
}
