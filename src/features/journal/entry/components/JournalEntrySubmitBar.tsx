import {
  AppIcon,
  AppSegmentedControl,
  AppText,
  Icon,
  PressScaleTouchable,
} from '@/src/components/core';
import { SubmitFooter } from '@/src/components/forms/SubmitFooter';
import type { PlannedJournalMode } from '@/src/services/journal/journalDomainService';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import React from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

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
  const { isKeyboardVisible } = useKeyboard();

  return (
    <SubmitFooter
      onPress={onPress}
      label={label}
      disabled={disabled}
      loading={loading}
      requirementHint={missingRequirementHint}
      onDisabledPress={onDisabledPress}
      hintTone="error"
      pulse={saveSuccessPulse}
      bottomInset="journal"
      above={
        plannedMode && onPlannedModeChange ? (
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
        ) : null
      }
      trailing={
        isKeyboardVisible ? (
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
        ) : null
      }
    />
  );
});

const styles = StyleSheet.create({
  plannedRow: {
    marginBottom: Spacing.xs,
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
