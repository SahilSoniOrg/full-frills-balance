import { AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { hour12To24, hour24To12, type ClockMeridiem } from '@/src/utils/hourCycle';
import dayjs from 'dayjs';
import { StyleSheet, View } from 'react-native';
import { ClockWheel } from './ClockWheel';

interface TimeViewProps {
  date: dayjs.Dayjs;
  onChange: (date: dayjs.Dayjs) => void;
}

const HOURS_24 = Array.from({ length: AppConfig.dateTimePicker.hoursInDay }, (_, i) => ({
  id: i.toString(),
  label: i.toString().padStart(2, '0'),
}));

const HOURS_12 = Array.from({ length: 12 }, (_, i) => {
  const hour = i + 1;
  return { id: hour.toString(), label: hour.toString() };
});

const MERIDIEMS: { id: ClockMeridiem; label: ClockMeridiem }[] = [
  { id: 'AM', label: 'AM' },
  { id: 'PM', label: 'PM' },
];

const MINUTES = Array.from({ length: AppConfig.dateTimePicker.minutesInHour }, (_, i) => ({
  id: i.toString(),
  label: i.toString().padStart(2, '0'),
}));

export function TimeView({ date, onChange }: TimeViewProps) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const is12Hour = resolvedHourCycle === '12-hour';

  const { hour12, meridiem } = hour24To12(date.hour());
  const currentHour24 = date.hour().toString();
  const currentHour12 = hour12.toString();
  const currentMinute = date.minute().toString();

  const handleHour24Select = (hour: string) => {
    onChange(date.hour(parseInt(hour, 10)));
  };

  const handleHour12Select = (hour: string) => {
    onChange(date.hour(hour12To24(parseInt(hour, 10), meridiem)));
  };

  const handleMeridiemSelect = (next: ClockMeridiem) => {
    onChange(date.hour(hour12To24(hour12, next)));
  };

  const handleMinuteSelect = (minute: string) => {
    onChange(date.minute(parseInt(minute, 10)));
  };

  const hourLabel = is12Hour ? currentHour12 : currentHour24.padStart(2, '0');

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.selection),
          borderColor: withOpacity(theme.border, Opacity.medium),
        },
      ]}
    >
      <View style={styles.column}>
        <View
          style={[
            styles.labelContainer,
            { borderBottomColor: withOpacity(theme.border, Opacity.medium) },
          ]}
        >
          <AppText variant="body" weight="bold" style={{ color: theme.primary, letterSpacing: 1 }}>
            Hour: {hourLabel}
          </AppText>
        </View>
        <View style={styles.pickerWrapper}>
          <ClockWheel
            options={is12Hour ? HOURS_12 : HOURS_24}
            value={is12Hour ? currentHour12 : currentHour24}
            onChange={is12Hour ? handleHour12Select : handleHour24Select}
          />
        </View>
      </View>
      <View
        style={[styles.separator, { backgroundColor: withOpacity(theme.border, Opacity.medium) }]}
      />
      <View style={styles.column}>
        <View
          style={[
            styles.labelContainer,
            { borderBottomColor: withOpacity(theme.border, Opacity.medium) },
          ]}
        >
          <AppText
            variant="body"
            weight="bold"
            style={{ color: theme.primary, letterSpacing: 1.5 }}
          >
            Minute: {currentMinute.padStart(2, '0')}
          </AppText>
        </View>
        <View style={styles.pickerWrapper}>
          <ClockWheel options={MINUTES} value={currentMinute} onChange={handleMinuteSelect} />
        </View>
      </View>
      {is12Hour && (
        <>
          <View
            style={[
              styles.separator,
              { backgroundColor: withOpacity(theme.border, Opacity.medium) },
            ]}
          />
          <View style={styles.column}>
            <View
              style={[
                styles.labelContainer,
                { borderBottomColor: withOpacity(theme.border, Opacity.medium) },
              ]}
            >
              <AppText
                variant="body"
                weight="bold"
                style={{ color: theme.primary, letterSpacing: 1 }}
              >
                {meridiem}
              </AppText>
            </View>
            <View style={styles.pickerWrapper}>
              <ClockWheel
                options={MERIDIEMS}
                value={meridiem}
                onChange={handleMeridiemSelect}
                loop={false}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: AppConfig.dateTimePicker.containerHeight,
    borderRadius: Shape.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  column: {
    flex: 1,
  },
  pickerWrapper: {
    flex: 1,
    padding: Spacing.xs,
  },
  labelContainer: {
    height: AppConfig.dateTimePicker.labelHeight,
    borderBottomWidth: 1,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    width: 1,
    height: '100%',
  },
});
