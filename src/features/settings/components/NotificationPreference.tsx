import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { notificationService } from '@/src/services/NotificationService';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

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
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flex: 1 }}>
                    <AppText variant="body" weight="semibold">{AppConfig.strings.settings.notifications.title}</AppText>
                    <AppText variant="caption" color="secondary">{AppConfig.strings.settings.notifications.description}</AppText>
                </View>
                <AppIcon name="notifications" size={20} color={theme.primary} />
            </View>
            
            <View style={styles.controlsRow}>
                <View style={[styles.pillContainer, { backgroundColor: withOpacity(theme.primary, Opacity.selection) }]}>
                    {options.map((option) => {
                        const isSelected = notificationCadence === option.id;
                        return (
                            <TouchableOpacity
                                key={option.id}
                                style={[
                                    styles.pill,
                                    isSelected && { backgroundColor: theme.primary }
                                ]}
                                onPress={() => handleSelectCadence(option.id)}
                                activeOpacity={0.7}
                            >
                                <AppText
                                    variant="caption"
                                    weight={isSelected ? "semibold" : "regular"}
                                    style={{ color: isSelected ? theme.surface : theme.primary }}
                                >
                                    {option.label}
                                </AppText>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {notificationCadence !== 'none' && (
                    <TouchableOpacity 
                        style={[styles.timeSelector, { backgroundColor: withOpacity(theme.primary, Opacity.selection) }]}
                        onPress={() => setShowTimePicker(true)}
                    >
                        <AppText variant="caption" weight="semibold" style={{ color: theme.primary }}>
                            {displayTime}
                        </AppText>
                        <AppIcon name="time" size={14} color={theme.primary} style={{ marginLeft: Spacing.xs }} />
                    </TouchableOpacity>
                )}
            </View>

            {notificationCadence !== 'none' && (
                <View style={{ marginTop: Spacing.md }}>
                    <TouchableOpacity 
                        onPress={() => notificationService.sendImmediateTest()}
                        style={[styles.testButton, { borderColor: theme.divider }]}
                    >
                        <AppText variant="caption" color="secondary">Send Test Notification (Now)</AppText>
                    </TouchableOpacity>
                </View>
            )}

            <DateTimePickerModal
                visible={showTimePicker}
                date={dayjs().format('YYYY-MM-DD')}
                time={formattedTime}
                onClose={() => setShowTimePicker(false)}
                onSelect={handleSelectTime}
                hideDate
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: Spacing.xs,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        flexWrap: 'wrap',
    },
    pillContainer: {
        flexDirection: 'row',
        borderRadius: 24,
        padding: 4,
    },
    pill: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xs,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    timeSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: 20,
    },
    testButton: {
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.md,
        borderRadius: 8,
        borderWidth: 1,
        alignSelf: 'flex-start',
    }
});
