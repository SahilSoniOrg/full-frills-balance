import React from 'react';
import { ModalActions } from './ModalActions';
import { ModalSurface } from './ModalSurface';

type InfoSheetAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  disabled?: boolean;
  testID?: string;
};

interface InfoSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  onDismiss?: () => void;
  children: React.ReactNode;
  accessibilityCloseLabel?: string;
  maxHeightPercent?: number;
  fixedHeight?: boolean;
  scrollable?: boolean;
  keyboardAvoiding?: boolean;
  position?: 'center' | 'bottomSheet';
  primaryAction?: InfoSheetAction;
  secondaryAction?: InfoSheetAction;
  useNativeModal?: boolean;
  contentTestID?: string;
}

export function InfoSheet({
  visible,
  title,
  onClose,
  onDismiss,
  children,
  accessibilityCloseLabel,
  maxHeightPercent,
  fixedHeight = true,
  scrollable = true,
  keyboardAvoiding = false,
  position = 'center',
  primaryAction,
  secondaryAction,
  useNativeModal = true,
  contentTestID,
}: InfoSheetProps) {
  const footer =
    primaryAction || secondaryAction ? (
      <ModalActions
        actions={[
          ...(secondaryAction
            ? [
                {
                  ...secondaryAction,
                  role: 'secondary' as const,
                  variant: secondaryAction.variant ?? 'secondary',
                },
              ]
            : []),
          ...(primaryAction ? [{ ...primaryAction, role: 'primary' as const }] : []),
        ]}
      />
    ) : undefined;

  return (
    <ModalSurface
      visible={visible}
      title={title}
      onClose={onClose}
      onDismiss={onDismiss}
      accessibilityCloseLabel={accessibilityCloseLabel}
      maxHeightPercent={maxHeightPercent}
      fixedHeight={fixedHeight}
      scrollable={scrollable}
      keyboardAvoiding={keyboardAvoiding}
      position={position}
      footer={footer}
      useNativeModal={useNativeModal}
      contentTestID={contentTestID}
    >
      {children}
    </ModalSurface>
  );
}
