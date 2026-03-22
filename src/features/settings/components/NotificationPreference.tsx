import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppIcon, AppSegmentedControl, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { notificationService } from '@/src/services/NotificationService';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { TouchableOpacity } from 'react-native';

export const NotificationPreference = () => {
    const { theme } = useTheme();
    const {
        notificationCadence,
        setNotificationCadence,
        notificationHour,
        notificationMinute,
        notificationWeekday,
        setNotificationTime,
        setNotificationWeekday,
    } = useUI();
    const [showTimePicker, setShowTimePicker] = useState(false);

    const options = [
        { id: 'none', label: AppConfig.strings.settings.notifications.none },
        { id: 'daily', label: AppConfig.strings.settings.notifications.daily },
        { id: 'weekly', label: AppConfig.strings.settings.notifications.weekly },
    ] as const;

    const handleSelectCadence = async (cadence: 'none' | 'daily' | 'weekly') => {
        if (cadence !== 'none') {
            const granted = await notificationService.requestPermissions();
            if (!granted) return;
        }
        await setNotificationCadence(cadence);
        await notificationService.scheduleReminder(cadence, notificationHour, notificationMinute, notificationWeekday);
    };

    const handleSelectTime = async (_dateStr: string, timeStr: string, weekday?: number) => {
        const [hour, minute] = timeStr.split(':').map(Number);
        await setNotificationTime(hour, minute);
        if (weekday !== undefined) {
            await setNotificationWeekday(weekday);
        }
        await notificationService.scheduleReminder(notificationCadence, hour, minute, weekday ?? notificationWeekday);
        setShowTimePicker(false);
    };

    const formattedTime = dayjs().hour(notificationHour).minute(notificationMinute).format('HH:mm');
    const displayTime = dayjs().hour(notificationHour).minute(notificationMinute).format('hh:mm A');

    return (
        <Stack space="sm" paddingHorizontal="md" paddingBottom="md">
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
                <AppSegmentedControl
                    options={options}
                    value={notificationCadence}
                    onChange={handleSelectCadence}
                    minWidth={60}
                    flex={false}
                />

                <TouchableOpacity
                    onPress={() => notificationCadence !== 'none' && setShowTimePicker(true)}
                    activeOpacity={notificationCadence === 'none' ? 1 : 0.7}
                    disabled={notificationCadence === 'none'}
                >
                    <Box
                        flexDirection="row"
                        alignItems="center"
                        paddingHorizontal="md"
                        paddingVertical="sm"
                        borderRadius="full"
                        background="surfaceSecondary"
                        style={{ opacity: notificationCadence === 'none' ? 0.3 : 1 }}
                    >
                        <AppText variant="caption" weight="semibold" color="text">
                            {displayTime}
                        </AppText>
                        <AppIcon
                            name="clock"
                            size={14}
                            color={theme.textSecondary}
                            style={{ marginLeft: Spacing.xs, opacity: 0.7 }}
                        />
                    </Box>
                </TouchableOpacity>
            </Box>

            {notificationCadence !== 'none' && (
                <TouchableOpacity
                    onPress={() => notificationService.sendImmediateTest()}
                >
                    <Box
                        paddingVertical="xs"
                        paddingHorizontal="md"
                        borderRadius="sm"
                        style={{ borderWidth: 1, borderColor: theme.border }}
                        alignSelf="flex-start"
                    >
                        <AppText variant="caption" color="secondary">Send Test Notification (Now)</AppText>
                    </Box>
                </TouchableOpacity>
            )}

            <DateTimePickerModal
                visible={showTimePicker}
                date={dayjs().format('YYYY-MM-DD')}
                time={formattedTime}
                weekday={notificationWeekday}
                showWeekdayPicker={notificationCadence === 'weekly'}
                onClose={() => setShowTimePicker(false)}
                onSelect={handleSelectTime}
                hideDate
            />
        </Stack>
    );
};
