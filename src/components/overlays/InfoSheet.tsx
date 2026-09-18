import { AppButton } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ModalSurface } from './ModalSurface';

type InfoSheetAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  disabled?: boolean;
};

interface InfoSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  accessibilityCloseLabel?: string;
  maxHeightPercent?: number;
  fixedHeight?: boolean;
  scrollable?: boolean;
  position?: 'center' | 'bottomSheet';
  primaryAction?: InfoSheetAction;
  secondaryAction?: InfoSheetAction;
  useNativeModal?: boolean;
}

export function InfoSheet({
  visible,
  title,
  onClose,
  children,
  accessibilityCloseLabel,
  maxHeightPercent,
  fixedHeight = true,
  scrollable = true,
  position = 'center',
  primaryAction,
  secondaryAction,
  useNativeModal = true,
}: InfoSheetProps) {
  const footer =
    primaryAction || secondaryAction ? (
      <View style={styles.footer}>
        {secondaryAction ? (
          <AppButton
            variant={secondaryAction.variant || 'secondary'}
            onPress={secondaryAction.onPress}
            style={styles.actionButtonContainer}
            buttonStyle={styles.actionButton}
          >
            {secondaryAction.label}
          </AppButton>
        ) : null}
        {primaryAction ? (
          <AppButton
            variant={primaryAction.variant || 'primary'}
            onPress={primaryAction.onPress}
            disabled={primaryAction.disabled}
            style={styles.actionButtonContainer}
            buttonStyle={styles.actionButton}
          >
            {primaryAction.label}
          </AppButton>
        ) : null}
      </View>
    ) : undefined;

  return (
    <ModalSurface
      visible={visible}
      title={title}
      onClose={onClose}
      accessibilityCloseLabel={accessibilityCloseLabel}
      maxHeightPercent={maxHeightPercent}
      fixedHeight={fixedHeight}
      scrollable={scrollable}
      position={position}
      footer={footer}
      useNativeModal={useNativeModal}
    >
      {children}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButtonContainer: {
    flex: 1,
  },
  actionButton: {
    borderRadius: Shape.radius.full,
  },
});
