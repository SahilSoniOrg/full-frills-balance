import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Keyboard, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

interface BudgetPeriodStepperProps {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  canGoNext: boolean;
  showBackToToday: boolean;
  onBackToToday: () => void;
}

/** Prev/next period control for budget detail — no date-picker affordance. */
export function BudgetPeriodStepper({
  label,
  onPrevious,
  onNext,
  canGoNext,
  showBackToToday,
  onBackToToday,
}: BudgetPeriodStepperProps) {
  const { theme, fonts } = useTheme();

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onPress={() => {
          Keyboard.dismiss();
          onPrevious();
        }}
        style={[styles.navButton, { backgroundColor: theme.surface }, Shape.elevation.sm]}
        activeOpacity={Opacity.heavy}
        accessibilityLabel="Previous period"
      >
        <AppIcon name="chevronLeft" size={Size.sm} color={theme.textSecondary} />
      </TouchableOpacity>

      <View style={[styles.labelContainer, { backgroundColor: theme.surface }, Shape.elevation.sm]}>
        <AppText
          variant="body"
          style={[styles.label, { fontFamily: fonts.medium }]}
          numberOfLines={1}
        >
          {label}
        </AppText>
        {showBackToToday && (
          <Pressable
            onPress={onBackToToday}
            accessibilityRole="button"
            accessibilityLabel={AppConfig.strings.budget.backToToday}
          >
            <AppText variant="caption" color="primary" weight="bold">
              {AppConfig.strings.budget.backToToday}
            </AppText>
          </Pressable>
        )}
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
        accessibilityLabel="Next period"
      >
        <AppIcon
          name="chevronRight"
          size={Size.sm}
          color={canGoNext ? theme.textSecondary : theme.border}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  navButton: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Size.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    gap: Spacing.xs,
    maxWidth: 180,
  },
  label: {
    textAlign: 'center',
  },
});
