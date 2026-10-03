import { Icon, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Keyboard, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

interface BudgetPeriodStepperProps {
  label: string;
  periodDetail: string;
  daysLeft?: number;
  onPrevious: () => void;
  onNext: () => void;
  canGoNext: boolean;
  showBackToToday: boolean;
  onBackToToday: () => void;
}

/** Centered previous/current/next period control with accessible period context. */
export function BudgetPeriodStepper({
  label,
  periodDetail,
  daysLeft,
  onPrevious,
  onNext,
  canGoNext,
  showBackToToday,
  onBackToToday,
}: BudgetPeriodStepperProps) {
  const { theme, fonts } = useTheme();
  const strings = AppConfig.strings.budgetDetailRedesign;
  const periodLabel = strings.periodAccessibility(label, periodDetail, daysLeft);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onPress={() => {
          Keyboard.dismiss();
          onPrevious();
        }}
        style={[styles.navButton, { backgroundColor: theme.surface }, Shape.elevation.sm]}
        activeOpacity={Opacity.heavy}
        accessibilityLabel={strings.previousPeriodButton}
        accessibilityRole="button"
      >
        <AppIcon name={Icon.ChevronLeft} size={Size.sm} color={theme.textSecondary} />
      </TouchableOpacity>

      <View style={styles.labelContainer} accessible accessibilityLabel={periodLabel}>
        <AppText
          variant="body"
          style={[styles.label, { fontFamily: fonts.semibold }]}
          numberOfLines={2}
          align="center"
        >
          {label}
        </AppText>
        <AppText variant="caption" color="secondary" align="center">
          {periodDetail}
          {daysLeft === undefined ? '' : ` · ${strings.daysLeft(daysLeft)}`}
        </AppText>
        {showBackToToday ? (
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
          if (!canGoNext) return;
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
        accessibilityLabel={strings.nextPeriodButton}
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
  label: { textAlign: 'center' },
  todayButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.md },
});
