import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { notificationService } from '@/src/services/NotificationService';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Box, Inline, Stack } from '@/src/design-system';

export const NotificationPreference = () => {
    const { theme } = useTheme();
    const { 
        notificationCadence, 
        setNotificationCadence, 
        notificationHour, 
        notificationMinute, 
        setNotificationTime 
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
        await notificationService.scheduleReminder(cadence, notificationHour, notificationMinute);
    };

    const handleSelectTime = async (_dateStr: string, timeStr: string) => {
        const [hour, minute] = timeStr.split(':').map(Number);
        await setNotificationTime(hour, minute);
        await notificationService.scheduleReminder(notificationCadence, hour, minute);
        setShowTimePicker(false);
    };

    const formattedTime = dayjs().hour(notificationHour).minute(notificationMinute).format('HH:mm');
    const displayTime = dayjs().hour(notificationHour).minute(notificationMinute).format('hh:mm A');

    return (
        <Stack space="md" paddingVertical="xs">
            <Inline align="center" justify="space-between" space="md">
                <Stack space="xs" flex={1}>
                    <AppText variant="body" weight="semibold">{AppConfig.strings.settings.notifications.title}</AppText>
                    <AppText variant="caption" color="secondary">{AppConfig.strings.settings.notifications.description}</AppText>
                </Stack>
                <AppIcon name="notifications" size={20} color={theme.primary} />
            </Inline>
            
            <Inline align="center" space="md" style={{ flexWrap: 'wrap' }}>
                <Box
                    flexDirection="row"
                    borderRadius="full"
                    padding="xs"
                    background={withOpacity(theme.primary, Opacity.selection) as any}
                >
                    {options.map((option) => {
                        const isSelected = notificationCadence === option.id;
                        return (
                            <TouchableOpacity
                                key={option.id}
                                onPress={() => handleSelectCadence(option.id)}
                                activeOpacity={0.7}
                            >
                                <Box
                                    paddingHorizontal="lg"
                                    paddingVertical="xs"
                                    borderRadius="full"
                                    background={isSelected ? 'primary' : 'transparent'}
                                    justifyContent="center"
                                    alignItems="center"
                                >
                                    <AppText
                                        variant="caption"
                                        weight={isSelected ? "semibold" : "regular"}
                                        style={{ color: isSelected ? theme.surface : theme.primary }}
                                    >
                                        {option.label}
                                    </AppText>
                                </Box>
                            </TouchableOpacity>
                        );
                    })}
                </Box>

                {notificationCadence !== 'none' && (
                    <TouchableOpacity 
                        onPress={() => setShowTimePicker(true)}
                    >
                        <Box
                            flexDirection="row"
                            alignItems="center"
                            paddingHorizontal="md"
                            paddingVertical="sm"
                            borderRadius="full"
                            background={withOpacity(theme.primary, Opacity.selection) as any}
                        >
                            <AppText variant="caption" weight="semibold" style={{ color: theme.primary }}>
                                {displayTime}
                            </AppText>
                            <AppIcon name="time" size={14} color={theme.primary} style={{ marginLeft: Spacing.xs }} />
                        </Box>
                    </TouchableOpacity>
                )}
            </Inline>

            {notificationCadence !== 'none' && (
                <Box marginTop="md">
                    <TouchableOpacity 
                        onPress={() => notificationService.sendImmediateTest()}
                    >
                        <Box
                            paddingVertical="xs"
                            paddingHorizontal="md"
                            borderRadius="r2"
                            style={{ borderWidth: 1, borderColor: theme.border }}
                            alignSelf="flex-start"
                        >
                            <AppText variant="caption" color="secondary">Send Test Notification (Now)</AppText>
                        </Box>
                    </TouchableOpacity>
                </Box>
            )}

            <DateTimePickerModal
                visible={showTimePicker}
                date={dayjs().format('YYYY-MM-DD')}
                time={formattedTime}
                onClose={() => setShowTimePicker(false)}
                onSelect={handleSelectTime}
                hideDate
            />
        </Stack>
    );
};

