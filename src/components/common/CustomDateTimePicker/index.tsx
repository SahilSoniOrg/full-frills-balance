import { Spacing } from '@/src/constants';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DateView } from './DateView';
import { TimeView } from './TimeView';

interface CustomDateTimePickerProps {
    date: dayjs.Dayjs;
    onChange: (date: dayjs.Dayjs) => void;
    timePicker?: boolean;
}

export function CustomDateTimePicker({ date, onChange, timePicker }: CustomDateTimePickerProps) {
    return (
        <View style={styles.container}>
            <DateView date={date} onChange={onChange} />
            {timePicker && (
                <View style={styles.timePickerContainer}>
                    <TimeView date={date} onChange={onChange} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    timePickerContainer: {
        marginTop: Spacing.lg,
    }
});
