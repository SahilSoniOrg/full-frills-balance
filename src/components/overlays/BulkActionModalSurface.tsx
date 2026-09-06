import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { AppButton, Badge } from '@/src/components/core';
import type { AppButtonProps } from '@/src/components/core/AppButton';
import { Spacing } from '@/src/constants/design-tokens';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface BulkActionModalSurfaceProps {
  visible: boolean;
  onClose: () => void;
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
      visible={visible}
      onClose={onClose}
      title={title}
      fixedHeight={false}
      scrollable={true}
      footer={
        <View style={styles.footerRow}>
          <View style={styles.cancelSlot}>
            <AppButton
              variant="outline"
              onPress={onClose}
              style={styles.button}
              disabled={isSubmitting}
              accessibilityLabel={cancelAccessibilityLabel ?? cancelLabel}
              testID={`${testID ?? 'bulk-modal'}-cancel`}
            >
              {cancelLabel}
            </AppButton>
          </View>
          {onConfirm && (
            <View style={styles.confirmSlot}>
              <AppButton
                variant={confirmVariant}
                onPress={onConfirm}
                style={styles.button}
                disabled={isConfirmDisabled || isSubmitting}
                loading={isSubmitting}
                accessibilityLabel={confirmAccessibilityLabel ?? confirmLabel}
                testID={`${testID ?? 'bulk-modal'}-confirm`}
              >
                {confirmLabel}
              </AppButton>
            </View>
          )}
        </View>
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
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    paddingTop: Spacing.md,
  },
  button: {
    width: '100%',
  },
  cancelSlot: {
    flexGrow: 0.8,
    flexShrink: 1,
    flexBasis: 0,
    width: 0,
  },
  confirmSlot: {
    flexGrow: 1.2,
    flexShrink: 1,
    flexBasis: 0,
    width: 0,
  },
});
