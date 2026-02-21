import { CustomDateTimePicker } from '@/src/components/common/CustomDateTimePicker';
import { AppButton, AppText, Divider, IconButton } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DateTimePickerModalProps {
    visible: boolean;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    onClose: () => void;
    onSelect: (date: string, time: string) => void;
}

/**
 * DateTimePickerModal - A unified picker for date and time using react-native-ui-datepicker.
 */
export function DateTimePickerModal({
    visible,
    date,
    time,
    onClose,
    onSelect,
}: DateTimePickerModalProps) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    const [selectedValue, setSelectedValue] = useState(() => dayjs(`${date}T${time}`));

    useEffect(() => {
        if (!visible) return;
        const nextValue = dayjs(`${date}T${time}`);
        setSelectedValue(nextValue.isValid() ? nextValue : dayjs());
    }, [visible, date, time]);

    const handleApply = () => {
        const newDate = selectedValue.format('YYYY-MM-DD');
        const newTime = selectedValue.format('HH:mm');
        onSelect(newDate, newTime);
        onClose();
    };

    const handleDateChange = (newDate: dayjs.Dayjs) => {
        setSelectedValue(newDate);
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
                <Pressable
                    style={[
                        styles.content,
                        {
                            backgroundColor: theme.background,
                            paddingBottom: insets.bottom + Spacing.md
                        }
                    ]}
                    onPress={e => e.stopPropagation()}
                >
                    <View style={styles.header}>
                        <IconButton name="close" onPress={onClose} />
                        <AppText variant="subheading">Select Date & Time</AppText>
                        <View style={{ width: Size.md }} />
                    </View>

                    <View style={styles.pickerContainer}>
                        <CustomDateTimePicker
                            date={selectedValue}
                            onChange={handleDateChange}
                            timePicker={true}
                        />
                    </View>

                    <Divider style={styles.divider} />

                    <View style={{ paddingHorizontal: Spacing.lg }}>
                        <AppButton variant="primary" onPress={handleApply}>
                            Set Date & Time
                        </AppButton>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    content: {
        borderTopLeftRadius: Shape.radius.r2,
        borderTopRightRadius: Shape.radius.r2,
        paddingTop: Spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
    },
    pickerContainer: {
        paddingHorizontal: Spacing.md,
    },
    divider: {
        marginVertical: Spacing.md,
    },
});
