import { Icon, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import type { PeriodRangeFacts } from '@/src/utils/dateUtils';
import { Keyboard, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

interface PeriodStepperProps {
  label: string;
  /** Adds the date span, plus days left while the period is current. */
  period?: Pick<PeriodRangeFacts, 'dateRangeText' | 'isCurrent' | 'daysRemaining'>;
  onPrevious?: () => void;
  onNext?: () => void;
  canGoNext?: boolean;
  /** Makes the centered label a button, e.g. to open a date picker. */
  onPressLabel?: () => void;
  labelAccessibilityHint?: string;
  showBackToToday?: boolean;
  onBackToToday?: () => void;
  testID?: string;
}

/** Centered previous/current/next period control with accessible period context. */
export function PeriodStepper({
  label,
  period,
  onPrevious,
  onNext,
  canGoNext = !!onNext,
  onPressLabel,
  labelAccessibilityHint,
  showBackToToday = false,
  onBackToToday,
  testID,
}: PeriodStepperProps) {
  const { theme, fonts } = useTheme();
  const strings = AppConfig.strings.common.period;
  const detail = period
    ? [period.dateRangeText, period.isCurrent ? strings.daysLeft(period.daysRemaining) : null]
        .filter(Boolean)
        .join(' · ')
    : '';
  const periodLabel = [label, detail].filter(Boolean).join(', ');
  const canGoPrevious = !!onPrevious;

  const labelContent = (
    <>
      <View style={styles.labelRow}>
        <AppText
          variant="body"
          style={[styles.label, { fontFamily: fonts.semibold }]}
          numberOfLines={2}
          align="center"
        >
          {label}
        </AppText>
        {onPressLabel ? (
          <AppIcon name={Icon.ChevronDown} size={Size.xs} color={theme.textSecondary} />
        ) : null}
      </View>
      {detail ? (
        <AppText variant="caption" color="secondary" align="center">
          {detail}
        </AppText>
      ) : null}
    </>
  );

  return (
    <View style={styles.wrapper} testID={testID}>
      <TouchableOpacity
        onPress={() => {
          if (!onPrevious) return;
          Keyboard.dismiss();
          onPrevious();
        }}
        style={[
          styles.navButton,
          { backgroundColor: theme.surface },
          Shape.elevation.sm,
          !canGoPrevious && { opacity: Opacity.muted },
        ]}
        activeOpacity={canGoPrevious ? Opacity.heavy : 1}
        disabled={!canGoPrevious}
        accessibilityLabel={strings.previousButton}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canGoPrevious }}
      >
        <AppIcon
          name={Icon.ChevronLeft}
          size={Size.sm}
          color={canGoPrevious ? theme.textSecondary : theme.border}
        />
      </TouchableOpacity>

      <View style={styles.labelContainer}>
        {onPressLabel ? (
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              onPressLabel();
            }}
            accessibilityRole="button"
            accessibilityLabel={periodLabel}
            accessibilityHint={labelAccessibilityHint}
            style={({ pressed }) => [styles.labelButton, pressed && styles.pressed]}
          >
            {labelContent}
          </Pressable>
        ) : (
          <View style={styles.labelButton} accessible accessibilityLabel={periodLabel}>
            {labelContent}
          </View>
        )}
        {showBackToToday && onBackToToday ? (
          <Pressable
            onPress={onBackToToday}
            style={styles.todayButton}
            accessibilityRole="button"
            accessibilityLabel={strings.backToToday}
          >
            <AppText variant="caption" color="primary" weight="bold">
              {strings.backToToday}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={() => {
          if (!canGoNext || !onNext) return;
          Keyboard.dismiss();
          onNext();
        }}
        style={[
          styles.navButton,
          { backgroundColor: theme.surface },
          Shape.elevation.sm,
          !canGoNext && { opacity: Opacity.muted },
        ]}
        activeOpacity={canGoNext ? Opacity.heavy : 1}
        disabled={!canGoNext}
        accessibilityLabel={strings.nextButton}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canGoNext }}
      >
        <AppIcon
          name={Icon.ChevronRight}
          size={Size.sm}
          color={canGoNext ? theme.textSecondary : theme.border}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    minHeight: Size.buttonMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  navButton: {
    width: Size.buttonMd,
    height: Size.buttonMd,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    flex: 1,
    minWidth: 0,
    minHeight: Size.buttonMd,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  labelButton: {
    minHeight: Size.buttonMd,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  label: { textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: Opacity.medium },
  todayButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.md },
});
