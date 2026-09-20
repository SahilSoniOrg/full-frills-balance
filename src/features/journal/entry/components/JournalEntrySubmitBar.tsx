import { AppButton, AppIcon, AppText, Icon } from '@/src/components/core';
import { ChromeMotion, Scale } from '@/src/constants';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import { MotiView } from 'moti';
import React from 'react';
import { Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface JournalEntrySubmitBarProps {
  onPress: () => void;
  label: string;
  disabled: boolean;
  loading?: boolean;
  saveSuccessPulse?: boolean;
  missingRequirementHint?: string | null;
}

export const JournalEntrySubmitBar = React.memo(function JournalEntrySubmitBar({
  onPress,
  label,
  disabled,
  loading = false,
  saveSuccessPulse = false,
  missingRequirementHint,
}: JournalEntrySubmitBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isKeyboardVisible } = useKeyboard();
  const reduceMotion = useReducedMotion();

  const showPulse = saveSuccessPulse && !reduceMotion;

  const bottomPadding = isKeyboardVisible
    ? Spacing.xs
    : Math.max(Spacing.md, insets.bottom + Spacing.xs);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      {disabled && missingRequirementHint ? (
        <View style={styles.hintRow}>
          <AppText variant="caption" color="secondary" style={styles.hintText}>
            {missingRequirementHint}
          </AppText>
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <View style={styles.submitButtonWrapper}>
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
              buttonStyle={styles.button}
              testID="submit-footer-button"
            >
              {label}
            </AppButton>
          </MotiView>
        </View>

        {isKeyboardVisible && (
          <TouchableOpacity
            onPress={() => Keyboard.dismiss()}
            style={[
              styles.doneButton,
              {
                backgroundColor: theme.surfaceSecondary,
                borderColor: withOpacity(theme.border, 0.7),
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Done editing, dismiss keyboard"
            testID="submit-bar-keyboard-done"
            activeOpacity={Opacity.medium}
          >
            <AppIcon name={Icon.ChevronDown} size={Size.iconXs} color={theme.textSecondary} />
            <AppText variant="body" weight="bold" color="primary" style={styles.doneText}>
              Done
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hintRow: {
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  hintText: {
    fontSize: Typography.sizes.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
  },
  submitButtonWrapper: {
    flex: 1,
  },
  button: {
    height: Size.buttonLg,
    borderRadius: Shape.radius.r4,
  },
  doneButton: {
    height: Size.buttonLg,
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  doneText: {
    fontSize: Typography.sizes.sm,
  },
});
