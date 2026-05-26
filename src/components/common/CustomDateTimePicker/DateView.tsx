import { AppText, IconButton } from '@/src/components/core';
import { Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface DateViewProps {
  date: dayjs.Dayjs;
  onChange: (date: dayjs.Dayjs) => void;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DateView({ date, onChange }: DateViewProps) {
  const { theme } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(() => date.startOf('month'));

  const handlePrevMonth = () => setCurrentMonth(prev => prev.subtract(1, 'month'));
  const handleNextMonth = () => setCurrentMonth(prev => prev.add(1, 'month'));

  const handleSelectDate = (day: number) => {
    const newDate = date.year(currentMonth.year()).month(currentMonth.month()).date(day);
    onChange(newDate);
  };

  const daysInMonth = currentMonth.daysInMonth();
  const firstDayOfWeek = currentMonth.startOf('month').day();

  const grid = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    // Pad to 42 cells (6 rows) to prevent height jumping
    while (days.length < 42) {
      days.push(null);
    }
    return days;
  }, [daysInMonth, firstDayOfWeek]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          name="chevronLeft"
          onPress={handlePrevMonth}
          variant="surface"
          iconColor={theme.textSecondary}
          size={32}
        />
        <View style={styles.monthTitle}>
          <AppText variant="body" weight="bold" style={{ color: theme.text }}>
            {currentMonth.format('MMMM YYYY')}
          </AppText>
        </View>
        <IconButton
          name="chevronRight"
          onPress={handleNextMonth}
          variant="surface"
          iconColor={theme.textSecondary}
          size={32}
        />
      </View>

      <View style={styles.calendarContainer}>
        <View style={styles.daysHeader}>
          {DAYS_OF_WEEK.map(day => (
            <View key={day} style={styles.dayCell}>
              <AppText variant="caption" weight="semibold" style={{ color: theme.textSecondary }}>
                {day}
              </AppText>
            </View>
          ))}
        </View>

        <View style={styles.grid}>
          {grid.map((day, index) => {
            if (day === null) {
              return <View key={`empty-${index}`} style={styles.dayCell} />;
            }
            const isSelected =
              date.year() === currentMonth.year() &&
              date.month() === currentMonth.month() &&
              date.date() === day;
            const isToday =
              dayjs().year() === currentMonth.year() &&
              dayjs().month() === currentMonth.month() &&
              dayjs().date() === day;

            return (
              <TouchableOpacity
                key={`day-${day}`}
                style={[
                  styles.dayCell,
                  isToday &&
                    !isSelected && {
                      backgroundColor: withOpacity(theme.primary, Opacity.soft),
                      borderRadius: Shape.radius.md,
                    },
                  isSelected && {
                    backgroundColor: theme.primary,
                    borderRadius: Shape.radius.md,
                  },
                ]}
                onPress={() => handleSelectDate(day)}
                activeOpacity={0.7}
              >
                <AppText
                  variant="body"
                  weight={isSelected || isToday ? 'bold' : 'regular'}
                  style={[
                    isSelected && { color: theme.onPrimary },
                    !isSelected && isToday && { color: theme.primary },
                    !isSelected && !isToday && { color: theme.text },
                  ]}
                >
                  {day}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  monthTitle: {
    alignItems: 'center',
  },
  calendarContainer: {
    backgroundColor: 'transparent',
  },
  daysHeader: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
});
