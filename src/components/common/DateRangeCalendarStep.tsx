import { CustomDateTimePicker } from '@/src/components/common/CustomDateTimePicker';
import { AppText, IconButton } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
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
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <IconButton name="back" onPress={onBack} />
                <AppText variant="subheading">
                    Select {mode === 'START_DATE' ? 'Start' : 'End'} Date
                </AppText>
                <View style={{ width: Size.md }} />
            </View>
            <CustomDateTimePicker date={date || dayjs()} onChange={onSelect} />
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
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
});
