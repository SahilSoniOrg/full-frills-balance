import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Badge } from '@/src/components/core';
import type { AppButtonProps } from '@/src/components/core/AppButton';
import { Spacing } from '@/src/constants/design-tokens';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ModalActions } from './ModalActions';

export interface BulkActionModalSurfaceProps {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  title: string;
  itemCount?: number;
  itemCountLabel?: string;
  confirmLabel?: string;
  confirmVariant?: AppButtonProps['variant'];
  confirmAccessibilityLabel?: string;
  onConfirm?: () => Promise<void> | void;
  isSubmitting?: boolean;
  isConfirmDisabled?: boolean;
  cancelLabel?: string;
  cancelAccessibilityLabel?: string;
  children: React.ReactNode;
  testID?: string;
}

export function BulkActionModalSurface({
  visible,
  onClose,
  onDismiss,
  title,
  itemCount,
  itemCountLabel,
  confirmLabel = 'Save',
  confirmVariant = 'primary',
  confirmAccessibilityLabel,
  onConfirm,
  isSubmitting = false,
  isConfirmDisabled = false,
  cancelLabel = 'Cancel',
  cancelAccessibilityLabel,
  children,
  testID,
}: BulkActionModalSurfaceProps) {
  const countBadge =
    itemCount !== undefined && itemCount > 0 ? (
      <View style={styles.badgeRow}>
        <Badge variant="default">
          {itemCountLabel ?? `${itemCount} item${itemCount === 1 ? '' : 's'}`}
        </Badge>
      </View>
    ) : null;

  return (
    <ModalSurface
      keyboardAvoiding
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={title}
      fixedHeight={false}
      scrollable={true}
      footer={
        <ModalActions
          actions={[
            {
              label: cancelLabel,
              role: 'secondary',
              onPress: onClose,
              disabled: isSubmitting,
              accessibilityLabel: cancelAccessibilityLabel ?? cancelLabel,
              testID: `${testID ?? 'bulk-modal'}-cancel`,
            },
            ...(onConfirm
              ? [
                  {
                    label: confirmLabel,
                    role: 'primary' as const,
                    variant: confirmVariant,
                    onPress: onConfirm,
                    disabled: isConfirmDisabled || isSubmitting,
                    loading: isSubmitting,
                    accessibilityLabel: confirmAccessibilityLabel ?? confirmLabel,
                    testID: `${testID ?? 'bulk-modal'}-confirm`,
                  },
                ]
              : []),
          ]}
        />
      }
    >
      <View style={styles.contentContainer} testID={testID}>
        {countBadge}
        {children}
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  badgeRow: {
    marginBottom: Spacing.md,
    alignItems: 'flex-start',
  },
  contentContainer: {
    paddingVertical: Spacing.xs,
  },
});
