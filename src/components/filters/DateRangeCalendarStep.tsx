import { CustomDateTimePicker } from '@/src/components/filters/CustomDateTimePicker';
import { Icon, AppIcon, AppText, IconButton } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import { StyleSheet, View } from 'react-native';

interface DateRangeCalendarStepProps {
  mode: 'START_DATE' | 'END_DATE';
  date: dayjs.Dayjs | null;
  onBack: () => void;
  onSelect: (date: dayjs.Dayjs) => void;
}

export function DateRangeCalendarStep({
  mode,
  date,
  onBack,
  onSelect,
}: DateRangeCalendarStepProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          name={Icon.Back}
          onPress={onBack}
          accessibilityLabel={AppConfig.strings.common.back}
          variant="surface"
          iconColor={theme.textSecondary}
        />
        <AppText variant="caption" color="secondary" style={styles.headerCopy}>
          {mode === 'START_DATE'
            ? 'Choose where the range begins.'
            : 'Choose where the range ends.'}
        </AppText>
      </View>

      <View
        style={[
          styles.selectedDatePill,
          {
            backgroundColor: withOpacity(theme.primary, Opacity.selection),
            borderColor: 'transparent',
          },
        ]}
      >
        <AppIcon name={Icon.Calendar} size={16} color={theme.primary} />
        <AppText variant="body" weight="semibold">
          {(date || dayjs()).format('DD MMM YYYY')}
        </AppText>
      </View>

      <View style={styles.calendarShell}>
        <CustomDateTimePicker date={date || dayjs()} onChange={onSelect} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  selectedDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Shape.radius.full,
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
  },
  calendarShell: {
    flex: 1,
  },
});
