import { AppButton, AppInput, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ModalSurface } from './ModalSurface';

type ConfirmDialogAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
};

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  message?: React.ReactNode;
  children?: React.ReactNode;
  primaryAction: ConfirmDialogAction;
  secondaryAction?: ConfirmDialogAction;
  accessibilityCloseLabel?: string;
  useNativeModal?: boolean;
  requiredConfirmationValue?: string;
}

export function ConfirmDialog({
  visible,
  title,
  onClose,
  message,
  children,
  primaryAction,
  secondaryAction,
  accessibilityCloseLabel,
  useNativeModal = true,
  requiredConfirmationValue,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const isConfirmed =
    !requiredConfirmationValue || inputValue.trim() === requiredConfirmationValue.trim();

  // Reset input when visibility changes
  React.useEffect(() => {
    if (!visible) {
      setInputValue('');
      setError(undefined);
    }
  }, [visible]);

  const handleConfirm = () => {
    if (requiredConfirmationValue && inputValue.trim() !== requiredConfirmationValue.trim()) {
      setError(`Please type exactly: ${requiredConfirmationValue}`);
      return;
    }
    primaryAction.onPress();
  };

  return (
    <ModalSurface
      visible={visible}
      title={title}
      onClose={onClose}
      accessibilityCloseLabel={accessibilityCloseLabel}
      fixedHeight={false}
      scrollable={false}
      useNativeModal={useNativeModal}
      footer={
        <View style={styles.footer}>
          {secondaryAction ? (
            <AppButton
              variant={secondaryAction.variant || 'outline'}
              onPress={secondaryAction.onPress}
              style={styles.actionButton}
            >
              {secondaryAction.label}
            </AppButton>
          ) : null}
          <AppButton
            variant={primaryAction.variant || 'primary'}
            onPress={handleConfirm}
            style={styles.actionButton}
            disabled={!isConfirmed}
          >
            {primaryAction.label}
          </AppButton>
        </View>
      }
    >
      <View style={styles.content}>
        {typeof message === 'string' ? <AppText>{message}</AppText> : message}

        {requiredConfirmationValue && (
          <View style={styles.confirmationContainer}>
            <AppText variant="caption" color="secondary" style={styles.confirmationInstruction}>
              Please type{' '}
              <AppText variant="caption" weight="bold" color="text">
                &quot;{requiredConfirmationValue}&quot;
              </AppText>{' '}
              to confirm.
            </AppText>
            <AppInput
              value={inputValue}
              onChangeText={(text: string) => {
                setInputValue(text);
                if (error) setError(undefined);
              }}
              placeholder={requiredConfirmationValue}
              error={error}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {children}
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.md,
  },
  footer: {
    paddingTop: Spacing.md,
    borderTopWidth: 0,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  confirmationContainer: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  confirmationInstruction: {
    marginBottom: Spacing.xs,
  },
});
