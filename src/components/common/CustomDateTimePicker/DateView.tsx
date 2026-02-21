import { AppText, IconButton } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface DateViewProps {
    date: dayjs.Dayjs;
    onChange: (date: dayjs.Dayjs) => void;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DateView({ date, onChange }: DateViewProps) {
    const { theme, fonts } = useTheme();
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
        return days;
    }, [daysInMonth, firstDayOfWeek]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <IconButton name="chevronLeft" onPress={handlePrevMonth} iconColor={theme.textSecondary} />
                <AppText variant="body" style={{ fontFamily: fonts.bold }}>
                    {currentMonth.format('MMMM YYYY')}
                </AppText>
                <IconButton name="chevronRight" onPress={handleNextMonth} iconColor={theme.textSecondary} />
            </View>
            <View style={styles.daysHeader}>
                {DAYS_OF_WEEK.map(day => (
                    <View key={day} style={styles.dayCell}>
                        <AppText variant="caption" color="secondary">{day}</AppText>
                    </View>
                ))}
            </View>
            <View style={styles.grid}>
                {grid.map((day, index) => {
                    if (day === null) {
                        return <View key={`empty-${index}`} style={styles.dayCell} />;
                    }
                    const isSelected = date.year() === currentMonth.year() &&
                        date.month() === currentMonth.month() &&
                        date.date() === day;
                    const isToday = dayjs().year() === currentMonth.year() &&
                        dayjs().month() === currentMonth.month() &&
                        dayjs().date() === day;

                    return (
                        <TouchableOpacity
                            key={`day-${day}`}
                            style={[
                                styles.dayCell,
                                isSelected && { backgroundColor: theme.primary, borderRadius: Shape.radius.full }
                            ]}
                            onPress={() => handleSelectDate(day)}
                        >
                            <AppText
                                variant="body"
                                style={[
                                    isSelected && { color: theme.onPrimary, fontFamily: fonts.bold },
                                    !isSelected && isToday && { color: theme.primary, fontFamily: fonts.bold }
                                ]}
                            >
                                {day}
                            </AppText>
                        </TouchableOpacity>
                    );
                })}
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
    },
    daysHeader: {
        flexDirection: 'row',
        marginBottom: Spacing.sm,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: `${100 / 7}%`,
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    }
});
