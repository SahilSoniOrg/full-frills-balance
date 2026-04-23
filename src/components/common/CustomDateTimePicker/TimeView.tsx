import { AppSegmentedControl, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface TimeViewProps {
  date: dayjs.Dayjs;
  onChange: (date: dayjs.Dayjs) => void;
}

const HOURS = Array.from({ length: AppConfig.dateTimePicker.hoursInDay }, (_, i) => ({
  id: i.toString(),
  label: i.toString().padStart(2, '0'),
}));
const MINUTES = Array.from({ length: AppConfig.dateTimePicker.minutesInHour }, (_, i) => ({
  id: i.toString(),
  label: i.toString().padStart(2, '0'),
}));

export function TimeView({ date, onChange }: TimeViewProps) {
  const { theme } = useTheme();

  const handleHourSelect = (hour: string) => {
    onChange(date.hour(parseInt(hour, 10)));
  };

  const handleMinuteSelect = (minute: string) => {
    onChange(date.minute(parseInt(minute, 10)));
  };

  const currentHour = date.hour().toString();
  const currentMinute = date.minute().toString();

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
            Hour: {currentHour.padStart(2, '0')}
          </AppText>
        </View>
        <View style={styles.pickerWrapper}>
          <AppSegmentedControl
            options={HOURS}
            value={currentHour}
            onChange={handleHourSelect}
            orientation="vertical"
            scrollable
            flex
            variant="minimal"
            size="lg"
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
          <AppSegmentedControl
            options={MINUTES}
            value={currentMinute}
            onChange={handleMinuteSelect}
            orientation="vertical"
            scrollable
            flex
            variant="minimal"
            size="lg"
          />
        </View>
      </View>
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
  label: {
    textAlign: 'center',
    letterSpacing: 1,
  },
  separator: {
    width: 1,
    height: '100%',
  },
});
