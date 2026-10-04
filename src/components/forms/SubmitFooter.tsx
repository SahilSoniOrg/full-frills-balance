import { AppButton } from '@/src/components/core/AppButton';
import { AppText } from '@/src/components/core/AppText';
import { ChromeMotion, Scale, Shape, Size, Spacing } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboard } from '@/src/design-system/Keyboard';

interface SubmitFooterProps {
  onPress: () => void;
  label: string;
  disabled: boolean;
  topSlot?: React.ReactNode;
  loading?: boolean;
  requirementHint?: string | null;
  pulseOnSave?: boolean;
}

export const SubmitFooter = ({
  onPress,
  label,
  disabled,
  topSlot,
  loading,
  requirementHint,
  pulseOnSave = false,
}: SubmitFooterProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isKeyboardVisible } = useKeyboard();
  const reduceMotion = useReducedMotion();
  const showPulse = pulseOnSave && !reduceMotion;
  const bottomPadding = isKeyboardVisible
    ? Spacing.md
    : Math.max(Spacing.lg, insets.bottom + Spacing.md);

  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      {disabled && requirementHint ? (
        <AppText variant="caption" color="secondary" style={styles.requirementHint}>
          {requirementHint}
        </AppText>
      ) : null}
      {topSlot && <View style={styles.topSlot}>{topSlot}</View>}
      <MotiView
        animate={{ scale: showPulse ? 1.03 : Scale.identity }}
        transition={ChromeMotion.spring}
      >
        <AppButton
          variant="primary"
          onPress={onPress}
          disabled={disabled}
          loading={loading}
          style={styles.button}
          buttonStyle={[
            styles.button,
            disabled ? { backgroundColor: theme.surfaceSecondary } : undefined,
          ]}
          testID="submit-footer-button"
          accessibilityLabel={label}
        >
          {disabled ? (
            <AppText variant="body" weight="semibold" style={{ color: theme.text }}>
              {label}
            </AppText>
          ) : (
            label
          )}
        </AppButton>
      </MotiView>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  topSlot: {
    marginBottom: Spacing.md,
  },
  requirementHint: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  button: {
    height: Size.buttonXl,
    borderRadius: Shape.radius.full,
  },
});
