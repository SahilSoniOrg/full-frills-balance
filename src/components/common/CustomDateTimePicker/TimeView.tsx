import { AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React, { useEffect, useRef } from 'react';
import { FlatList, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

interface TimeViewProps {
    date: dayjs.Dayjs;
    onChange: (date: dayjs.Dayjs) => void;
}

const HOURS = Array.from({ length: AppConfig.dateTimePicker.hoursInDay }, (_, i) => i);
const MINUTES = Array.from({ length: AppConfig.dateTimePicker.minutesInHour }, (_, i) => i);

const ITEM_HEIGHT = Size.touchTarget;

export function TimeView({ date, onChange }: TimeViewProps) {
    const { theme, fonts } = useTheme();
    const hoursRef = useRef<FlatList>(null);
    const minutesRef = useRef<FlatList>(null);

    const handleHourSelect = (hour: number) => {
        onChange(date.hour(hour));
    };

    const handleMinuteSelect = (minute: number) => {
        onChange(date.minute(minute));
    };

    const currentHour = date.hour();
    const currentMinute = date.minute();

    useEffect(() => {
        if (hoursRef.current && Platform.OS !== 'web') {
            setTimeout(() => {
                hoursRef.current?.scrollToOffset({ offset: currentHour * ITEM_HEIGHT, animated: true });
            }, AppConfig.dateTimePicker.scrollSnapDelayMs);
        }
        if (minutesRef.current && Platform.OS !== 'web') {
            setTimeout(() => {
                minutesRef.current?.scrollToOffset({ offset: currentMinute * ITEM_HEIGHT, animated: true });
            }, AppConfig.dateTimePicker.scrollSnapDelayMs);
        }
    }, [currentHour, currentMinute]);

    const onHourScrollEnd = (e: any) => {
        const y = e.nativeEvent.contentOffset.y;
        const index = Math.max(0, Math.min(AppConfig.dateTimePicker.hoursInDay - 1, Math.round(y / ITEM_HEIGHT)));
        if (index !== currentHour) handleHourSelect(index);
    };

    const onMinuteScrollEnd = (e: any) => {
        const y = e.nativeEvent.contentOffset.y;
        const index = Math.max(0, Math.min(AppConfig.dateTimePicker.minutesInHour - 1, Math.round(y / ITEM_HEIGHT)));
        if (index !== currentMinute) handleMinuteSelect(index);
    };

    const renderItem = ({ item, isSelected, onSelect }: { item: number; isSelected: boolean; onSelect: (val: number) => void }) => (
        <View style={styles.itemWrapper}>
            <TouchableOpacity
                style={[styles.item, isSelected && { backgroundColor: theme.primary }]}
                onPress={() => onSelect(item)}
            >
                <AppText
                    variant="body"
                    style={isSelected ? { color: theme.onPrimary, fontFamily: fonts.bold } : undefined}
                >
                    {item.toString().padStart(2, '0')}
                </AppText>
            </TouchableOpacity>
        </View>
    );

    const listPadding = (AppConfig.dateTimePicker.columnHeight - ITEM_HEIGHT) / 2;

    return (
        <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.column}>
                <View style={[styles.labelContainer, { borderBottomColor: theme.border }]}>
                    <AppText variant="caption" color="secondary" style={styles.label}>Hour</AppText>
                </View>
                <FlatList
                    ref={hoursRef}
                    data={HOURS}
                    keyExtractor={h => `h-${h}`}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: listPadding }}
                    initialScrollIndex={currentHour}
                    getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={onHourScrollEnd}
                    renderItem={({ item }) => renderItem({ item, isSelected: currentHour === item, onSelect: handleHourSelect })}
                />
            </View>
            <View style={[styles.separator, { backgroundColor: theme.border }]} />
            <View style={styles.column}>
                <View style={[styles.labelContainer, { borderBottomColor: theme.border }]}>
                    <AppText variant="caption" color="secondary" style={styles.label}>Minute</AppText>
                </View>
                <FlatList
                    ref={minutesRef}
                    data={MINUTES}
                    keyExtractor={m => `m-${m}`}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: listPadding }}
                    initialScrollIndex={currentMinute}
                    getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={onMinuteScrollEnd}
                    renderItem={({ item }) => renderItem({ item, isSelected: currentMinute === item, onSelect: handleMinuteSelect })}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        height: AppConfig.dateTimePicker.containerHeight,
        borderRadius: Shape.radius.md,
        borderWidth: 1,
        overflow: 'hidden',
    },
    column: {
        flex: 1,
    },
    labelContainer: {
        height: AppConfig.dateTimePicker.labelHeight,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingVertical: Spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        textAlign: 'center',
    },
    itemWrapper: {
        height: ITEM_HEIGHT,
        width: '100%',
        justifyContent: 'center',
        paddingHorizontal: Spacing.xs,
    },
    item: {
        height: ITEM_HEIGHT - 4,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: Shape.radius.sm,
    },
    separator: {
        width: 1,
        height: '100%',
    }
});
