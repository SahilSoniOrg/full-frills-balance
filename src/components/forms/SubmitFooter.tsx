import { AppButton } from '@/src/components/core/AppButton';
import { AppConfig, Scale, Shape, Size, Spacing } from '@/src/constants';
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
  /** Briefly scales the primary CTA on save success (no-op under Reduce Motion). */
  successPulse?: boolean;
}

export const SubmitFooter = ({
  onPress,
  label,
  disabled,
  topSlot,
  loading,
  successPulse = false,
}: SubmitFooterProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isKeyboardVisible } = useKeyboard();
  const reduceMotion = useReducedMotion();
  const bottomPadding = isKeyboardVisible
    ? Spacing.md
    : Math.max(Spacing.lg, insets.bottom + Spacing.md);

  const showPulse = successPulse && !reduceMotion;

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
      {topSlot && <View style={styles.topSlot}>{topSlot}</View>}
      <MotiView
        animate={{ scale: showPulse ? 1.04 : Scale.identity }}
        transition={{
          type: 'timing',
          duration: Math.round(AppConfig.timing.saveConfirmMs / 2),
        }}
      >
        <AppButton
          variant="primary"
          onPress={onPress}
          disabled={disabled}
          loading={loading}
          style={styles.button}
          buttonStyle={styles.button}
          testID="submit-footer-button"
        >
          {label}
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
  button: {
    height: Size.buttonXl,
    borderRadius: Shape.radius.r4,
  },
});
