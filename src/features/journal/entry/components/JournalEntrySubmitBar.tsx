import {
  AppButton,
  AppIcon,
  AppSegmentedControl,
  AppText,
  Icon,
  PressScaleTouchable,
} from '@/src/components/core';
import type { PlannedJournalMode } from '@/src/services/journal/journalDomainService';
import { ChromeMotion, Scale } from '@/src/constants';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import { MotiView } from 'moti';
import React, { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaLayout } from '@/src/design-system/SafeArea';

export interface JournalEntrySubmitBarProps {
  onPress: () => void;
  label: string;
  disabled: boolean;
  loading?: boolean;
  saveSuccessPulse?: boolean;
  missingRequirementHint?: string | null;
  /** Tapped while disabled: lets the form point at the missing field. */
  onDisabledPress?: () => void;
  /** Shown for future-dated new entries: post automatically on the date, or wait for the user. */
  plannedMode?: PlannedJournalMode;
  onPlannedModeChange?: (mode: PlannedJournalMode) => void;
  isEdit?: boolean;
}

export const plannedModeOptions = (isEdit: boolean) =>
  [
    { id: 'auto', label: 'Auto-post' },
    { id: 'manual', label: 'Remind me' },
    { id: 'post', label: isEdit ? 'Keep posted' : 'Post now' },
  ] as const;

export const JournalEntrySubmitBar = React.memo(function JournalEntrySubmitBar({
  onPress,
  label,
  disabled,
  loading = false,
  saveSuccessPulse = false,
  missingRequirementHint,
  onDisabledPress,
  plannedMode,
  onPlannedModeChange,
  isEdit = false,
}: JournalEntrySubmitBarProps) {
  const { theme } = useTheme();
  const { bottomSpacing } = useSafeAreaLayout();
  const { isKeyboardVisible } = useKeyboard();
  const reduceMotion = useReducedMotion();
  // Hint only after a tap on the disabled button, not on open.
  const [attempted, setAttempted] = useState(false);

  const showPulse = saveSuccessPulse && !reduceMotion;

  const bottomPadding = isKeyboardVisible ? Spacing.xs : bottomSpacing.journalFooter;

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
      {disabled && attempted && missingRequirementHint ? (
        <View style={styles.hintRow} accessibilityLiveRegion="polite">
          <AppText variant="caption" color="error" style={styles.hintText}>
            {missingRequirementHint}
          </AppText>
        </View>
      ) : null}

      {plannedMode && onPlannedModeChange ? (
        <View style={styles.plannedRow}>
          <AppSegmentedControl
            options={plannedModeOptions(isEdit)}
            value={plannedMode}
            onChange={onPlannedModeChange}
            itemHeight={Size.touchTarget}
            flex
            testID="journal-planned-mode"
          />
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable
          style={styles.submitButtonWrapper}
          disabled={!disabled}
          onPress={() => {
            setAttempted(true);
            onDisabledPress?.();
          }}
          accessible={false}
        >
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
        </Pressable>

        {isKeyboardVisible && (
          <PressScaleTouchable
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
          </PressScaleTouchable>
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
  plannedRow: {
    marginBottom: Spacing.xs,
  },
  hintRow: {
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  hintText: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
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
