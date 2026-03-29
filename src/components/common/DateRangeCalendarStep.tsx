import { CustomDateTimePicker } from '@/src/components/common/CustomDateTimePicker';
import { AppIcon, AppText, IconButton } from '@/src/components/core';
import { Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface DateRangeCalendarStepProps {
    mode: 'START_DATE' | 'END_DATE';
    date: dayjs.Dayjs | null;
    onBack: () => void;
    onSelect: (date: dayjs.Dayjs) => void;
}

export function DateRangeCalendarStep({ mode, date, onBack, onSelect }: DateRangeCalendarStepProps) {
    const { theme, fonts } = useTheme();

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <IconButton name="back" onPress={onBack} variant="surface" iconColor={theme.textSecondary} />
                <View style={styles.headerCopy}>
                    <AppText variant="heading" style={{ fontFamily: fonts.bold }}>
                        {mode === 'START_DATE' ? 'Start Date' : 'End Date'}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                        {mode === 'START_DATE' ? 'Choose where the range begins.' : 'Choose where the range ends.'}
                    </AppText>
                </View>
                <View style={{ width: Size.xl }} />
            </View>

            <View
                style={[
                    styles.selectedDatePill,
                    {
                        backgroundColor: withOpacity(theme.primary, 0.06),
                        borderColor: 'transparent',
                    },
                ]}
            >
                <AppIcon name="calendar" size={16} color={theme.primary} />
                <AppText variant="body" style={{ fontFamily: fonts.semibold }}>
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
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    headerCopy: {
        flex: 1,
        gap: Spacing.xs,
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
